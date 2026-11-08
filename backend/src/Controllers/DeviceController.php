<?php
declare(strict_types=1);

/**
 * Firmware-facing endpoints. Every route requires the X-API-Key header.
 * All handlers answer 2xx on success — a non-2xx makes the device re-queue
 * and retry "important" messages every 3 s.
 */
final class DeviceController
{
    private const REASONS = ['NIGHT FLOW', 'LONG FLOW', 'BURST RATE'];
    private const EVENTS  = ['reset'];
    private const SOURCES = ['button', 'remote'];

    /** POST /report — live state + a readings row. Not retried by the device. */
    public static function report(): void
    {
        DeviceAuth::check();
        $b      = Http::body();
        $dev    = V::str($b, 'device_id', 64);
        $ts     = V::ts($b, 'timestamp');
        $z1     = V::zone($b, 'zone1');
        $z2     = V::zone($b, 'zone2');
        $rssi   = V::int($b, 'rssi', -120, 0);

        $pdo = DB::pdo();

        $stmt = $pdo->prepare(
            'INSERT INTO devices
               (device_id, name, last_seen, rssi,
                z1_flow, z1_total, z1_tripped, z1_reason,
                z2_flow, z2_total, z2_tripped, z2_reason)
             VALUES (?,?,NOW(),?,?,?,?,NULL,?,?,?,NULL)
             ON DUPLICATE KEY UPDATE
               last_seen = NOW(), rssi = VALUES(rssi),
               z1_flow = VALUES(z1_flow), z1_total = VALUES(z1_total), z1_tripped = VALUES(z1_tripped),
               z1_reason = IF(VALUES(z1_tripped) = 0, NULL, z1_reason),
               z2_flow = VALUES(z2_flow), z2_total = VALUES(z2_total), z2_tripped = VALUES(z2_tripped),
               z2_reason = IF(VALUES(z2_tripped) = 0, NULL, z2_reason)'
        );
        $stmt->execute([
            $dev, $dev, $rssi,
            $z1['flow_lpm'], $z1['total_l'], (int) $z1['tripped'],
            $z2['flow_lpm'], $z2['total_l'], (int) $z2['tripped'],
        ]);

        $stmt = $pdo->prepare(
            'INSERT INTO readings
               (device_id, recorded_at, z1_flow, z1_total, z1_tripped,
                z2_flow, z2_total, z2_tripped, rssi, received_at)
             VALUES (?,?,?,?,?,?,?,?,?,NOW())'
        );
        $stmt->execute([
            $dev, $ts,
            $z1['flow_lpm'], $z1['total_l'], (int) $z1['tripped'],
            $z2['flow_lpm'], $z2['total_l'], (int) $z2['tripped'],
            $rssi,
        ]);

        Http::json(['ok' => true]);
    }

    /** POST /alert — important, retried until 2xx. Idempotent via UNIQUE key. */
    public static function alert(): void
    {
        DeviceAuth::check();
        $b      = Http::body();
        $dev    = V::str($b, 'device_id', 64);
        $ts     = V::ts($b, 'timestamp');
        $zone   = V::int($b, 'zone', 1, 2);
        $reason = V::oneOf($b, 'reason', self::REASONS);
        $flow   = V::num($b, 'flow_lpm', 0, 200);

        $pdo = DB::pdo();
        $stmt = $pdo->prepare(
            'INSERT IGNORE INTO alerts (device_id, zone, reason, flow_lpm, occurred_at, status)
             VALUES (?,?,?,?,?,\'active\')'
        );
        $stmt->execute([$dev, $zone, $reason, $flow, $ts]);
        $isNew = $stmt->rowCount() === 1;

        if ($isNew) {
            $pdo->prepare('INSERT IGNORE INTO devices (device_id, name) VALUES (?,?)')
                ->execute([$dev, $dev]);
            $col = $zone === 1 ? 'z1' : 'z2';
            $pdo->prepare(
                "UPDATE devices SET {$col}_tripped = 1, {$col}_reason = ?, last_seen = NOW()
                 WHERE device_id = ?"
            )->execute([$reason, $dev]);

            $dedupe = implode('|', ['alert', $dev, $ts, $zone, $reason]);
            $pdo->prepare(
                'INSERT IGNORE INTO activity_logs
                   (device_id, occurred_at, type, source, message, dedupe_key)
                 VALUES (?,?,?,\'device\',?,?)'
            )->execute([
                $dev, $ts, 'alert',
                sprintf('Zone %d %s at %.2f L/min — alarm raised on device', $zone, $reason, $flow),
                $dedupe,
            ]);

            $device = $pdo->prepare('SELECT * FROM devices WHERE device_id = ?');
            $device->execute([$dev]);
            Notifier::alert(
                ['device_id' => $dev, 'zone' => $zone, 'reason' => $reason,
                 'flow_lpm' => $flow, 'occurred_at' => $ts],
                $device->fetch() ?: []
            );
        }

        Http::json(['ok' => true, 'duplicate' => !$isNew]);
    }

    /** POST /event — important. reset resolves active alerts and clears the trips. */
    public static function event(): void
    {
        DeviceAuth::check();
        $b      = Http::body();
        $dev    = V::str($b, 'device_id', 64);
        $ts     = V::ts($b, 'timestamp');
        $event  = V::oneOf($b, 'event', self::EVENTS);
        $source = V::oneOf($b, 'source', self::SOURCES);

        $pdo = DB::pdo();
        $pdo->prepare('INSERT IGNORE INTO devices (device_id, name) VALUES (?,?)')
            ->execute([$dev, $dev]);

        $dedupe  = implode('|', ['event', $dev, $ts, $event, $source]);
        $message = "System reset ($source) — alerts resolved";
        $stmt = $pdo->prepare(
            'INSERT IGNORE INTO activity_logs
               (device_id, occurred_at, type, source, message, dedupe_key)
             VALUES (?,?,?,?,?,?)'
        );
        $stmt->execute([$dev, $ts, $event, $source, $message, $dedupe]);
        $isNew = $stmt->rowCount() === 1;

        if ($isNew) {
            $pdo->prepare(
                "UPDATE alerts SET status = 'resolved', resolved_at = NOW(), resolved_source = ?
                 WHERE device_id = ? AND status IN ('active','acknowledged')"
            )->execute([$source, $dev]);
            $pdo->prepare(
                'UPDATE devices SET z1_tripped = 0, z1_reason = NULL, z2_tripped = 0,
                 z2_reason = NULL, last_seen = NOW() WHERE device_id = ?'
            )->execute([$dev]);
        }

        Http::json(['ok' => true, 'duplicate' => !$isNew]);
    }

    /** POST /daily — important, once at midnight rollover; describes yesterday. */
    public static function daily(): void
    {
        DeviceAuth::check();
        $b    = Http::body();
        $dev  = V::str($b, 'device_id', 64);
        $ts   = V::ts($b, 'timestamp');
        $z1   = V::req($b, 'zone1');
        $z2   = V::req($b, 'zone2');
        if (!is_array($z1) || !is_array($z2)) {
            Http::error('Invalid zone payload', 400);
        }
        $z1d  = V::num($z1, 'daily_l', 0, 1000000);
        $z1p  = V::num($z1, 'peak_lpm', 0, 200);
        $z2d  = V::num($z2, 'daily_l', 0, 1000000);
        $z2p  = V::num($z2, 'peak_lpm', 0, 200);
        $trip = V::int($b, 'trips', 0, 10000);

        $reportDate = (new DateTime($ts, new DateTimeZone('Asia/Manila')))
            ->modify('-1 day')->format('Y-m-d');

        DB::pdo()->prepare(
            'INSERT INTO daily_reports
               (device_id, report_date, z1_daily_l, z1_peak_lpm, z2_daily_l, z2_peak_lpm, trips)
             VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               z1_daily_l = VALUES(z1_daily_l), z1_peak_lpm = VALUES(z1_peak_lpm),
               z2_daily_l = VALUES(z2_daily_l), z2_peak_lpm = VALUES(z2_peak_lpm),
               trips = VALUES(trips)'
        )->execute([$dev, $reportDate, $z1d, $z1p, $z2d, $z2p, $trip]);

        Http::json(['ok' => true]);
    }

    /**
     * GET /commands?device_id=… — polled every 1 s.
     * Returns the oldest pending command and marks it delivered in the same
     * transaction (exactly-once). Commands older than COMMAND_TTL_S expire so a
     * stale "reset" never runs after the device was offline.
     * The body carries at most one quoted command word — the firmware does a
     * substring match on the raw body.
     */
    public static function commands(): void
    {
        DeviceAuth::check();
        $dev = (string) ($_GET['device_id'] ?? '');
        if ($dev === '' || strlen($dev) > 64) {
            Http::error('Missing device_id', 400);
        }
        $ttl = Env::int('COMMAND_TTL_S', 30);

        $pdo = DB::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                "UPDATE commands SET status = 'expired'
                 WHERE device_id = ? AND status = 'pending'
                   AND created_at < (NOW() - INTERVAL ? SECOND)"
            )->execute([$dev, $ttl]);

            $stmt = $pdo->prepare(
                "SELECT id, command FROM commands
                 WHERE device_id = ? AND status = 'pending'
                 ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE"
            );
            $stmt->execute([$dev]);
            $row = $stmt->fetch();

            if ($row) {
                $pdo->prepare("UPDATE commands SET status = 'delivered', delivered_at = NOW() WHERE id = ?")
                    ->execute([$row['id']]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        Http::json(['command' => $row ? $row['command'] : null]);
    }

    /** GET /config?device_id=… — thresholds for future firmware config sync. */
    public static function config(): void
    {
        DeviceAuth::check();
        $rows = DB::pdo()->query('SELECT `key`, `value` FROM settings')->fetchAll(PDO::FETCH_KEY_PAIR);
        $num = static fn (?string $v): float|int|string|null =>
            ($v !== null && is_numeric($v)) ? $v + 0 : $v;
        Http::json([
            'ok' => true,
            'config' => [
                'normal_max_lpm'      => $num($rows['threshold.normal_max_lpm'] ?? null),
                'quiet_start'         => $rows['threshold.quiet_start'] ?? null,
                'quiet_end'           => $rows['threshold.quiet_end'] ?? null,
                'max_continuous_min'  => $num($rows['threshold.max_continuous_min'] ?? null),
                'max_burst_lpm'       => $num($rows['threshold.max_burst_lpm'] ?? null),
            ],
        ]);
    }
}
