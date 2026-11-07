<?php
declare(strict_types=1);

final class StatusController
{
    /** GET /admin/status — device state, zones, active alerts, today's KPIs. */
    public static function status(): void
    {
        AdminAuth::requireUser();
        $pdo = DB::pdo();

        $dev = Http::query('device_id');
        if ($dev) {
            $stmt = $pdo->prepare('SELECT * FROM devices WHERE device_id = ?');
            $stmt->execute([$dev]);
        } else {
            $stmt = $pdo->query('SELECT * FROM devices ORDER BY device_id LIMIT 1');
        }
        $d = $stmt->fetch();
        if (!$d) {
            Http::json(['ok' => true, 'device' => null]);
        }

        $offlineAfter = Env::int('OFFLINE_AFTER_S', 15);
        $lastSeenTs   = $d['last_seen'] ? strtotime($d['last_seen']) : null;
        $online       = $lastSeenTs !== null && (time() - $lastSeenTs) <= $offlineAfter;

        $stmt = $pdo->prepare(
            "SELECT id, zone, reason, flow_lpm, occurred_at, status
             FROM alerts WHERE device_id = ? AND status = 'active'
             ORDER BY occurred_at DESC"
        );
        $stmt->execute([$d['device_id']]);
        $alerts = $stmt->fetchAll();

        // Today's liters ≈ ∫ flow dt over readings (robust to any report cadence
        // and to the cumulative counter resetting on reboot; gaps > 60 s ignored).
        $stmt = $pdo->prepare(
            'SELECT
               COALESCE(SUM(CASE WHEN dt > 0 AND dt <= 60 THEN z1_flow * dt / 60 END), 0) AS z1_l,
               COALESCE(SUM(CASE WHEN dt > 0 AND dt <= 60 THEN z2_flow * dt / 60 END), 0) AS z2_l,
               COALESCE(MAX(GREATEST(z1_flow, z2_flow)), 0)                            AS peak_lpm
             FROM (
               SELECT z1_flow, z2_flow,
                      TIMESTAMPDIFF(SECOND, recorded_at,
                        LEAD(recorded_at) OVER (ORDER BY recorded_at)) AS dt
               FROM readings
               WHERE device_id = ? AND recorded_at >= CURDATE()
             ) x'
        );
        $stmt->execute([$d['device_id']]);
        $today = $stmt->fetch() ?: ['z1_l' => 0, 'z2_l' => 0, 'peak_lpm' => 0];

        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM alerts WHERE device_id = ? AND occurred_at >= CURDATE()'
        );
        $stmt->execute([$d['device_id']]);
        $tripsToday = (int) $stmt->fetchColumn();

        Http::json([
            'ok'       => true,
            'device'   => [
                'device_id'        => $d['device_id'],
                'name'             => $d['name'],
                'location'         => $d['location'],
                'firmware_version' => $d['firmware_version'],
            ],
            'online'    => $online,
            'last_seen' => $d['last_seen'],
            'rssi'      => $d['rssi'] !== null ? (int) $d['rssi'] : null,
            'valve_open' => (bool) $d['valve_open'],
            'zones'     => [
                [
                    'zone'     => 1,
                    'flow_lpm' => (float) $d['z1_flow'],
                    'total_l'  => (float) $d['z1_total'],
                    'tripped'  => (bool) $d['z1_tripped'],
                    'reason'   => $d['z1_reason'],
                ],
                [
                    'zone'     => 2,
                    'flow_lpm' => (float) $d['z2_flow'],
                    'total_l'  => (float) $d['z2_total'],
                    'tripped'  => (bool) $d['z2_tripped'],
                    'reason'   => $d['z2_reason'],
                ],
            ],
            'alerts' => $alerts,
            'today'  => [
                'z1_l'     => round((float) $today['z1_l'], 2),
                'z2_l'     => round((float) $today['z2_l'], 2),
                'peak_lpm' => round((float) $today['peak_lpm'], 2),
                'trips'    => $tripsToday,
            ],
            'server_time' => date('Y-m-d H:i:s'),
        ]);
    }
}
