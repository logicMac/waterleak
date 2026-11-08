<?php
declare(strict_types=1);

final class ReadingsController
{
    /** GET /admin/readings?range=15m|1h|24h|7d&zone=1|2|all */
    public static function readings(): void
    {
        AdminAuth::requireUser();

        $range = Http::query('range', '15m');
        $zone  = Http::query('zone', 'all');
        if (!in_array($zone, ['1', '2', 'all'], true)) {
            Http::error('Invalid zone', 400);
        }

        // [lookback interval, bucket seconds] — long ranges are downsampled
        // server-side so at most ~750 points cross the wire.
        $map = [
            '15m' => ['15 MINUTE', 0],
            '1h'  => ['1 HOUR', 0],
            '24h' => ['24 HOUR', 120],
            '7d'  => ['7 DAY', 900],
        ];
        if (!isset($map[$range])) {
            Http::error('Invalid range', 400);
        }
        [$interval, $bucket] = $map[$range];

        $dev  = self::deviceId();
        $pdo  = DB::pdo();

        if ($bucket === 0) {
            $stmt = $pdo->prepare(
                'SELECT recorded_at AS t, z1_flow, z2_flow, z1_tripped, z2_tripped, rssi
                 FROM readings
                 WHERE device_id = ? AND recorded_at >= (NOW() - INTERVAL ' . $interval . ')
                 ORDER BY recorded_at ASC'
            );
        } else {
            $stmt = $pdo->prepare(
                'SELECT MIN(recorded_at) AS t,
                        AVG(z1_flow) AS z1_flow, AVG(z2_flow) AS z2_flow,
                        MAX(z1_tripped) AS z1_tripped, MAX(z2_tripped) AS z2_tripped,
                        AVG(rssi) AS rssi
                 FROM readings
                 WHERE device_id = ? AND recorded_at >= (NOW() - INTERVAL ' . $interval . ')
                 GROUP BY FLOOR(UNIX_TIMESTAMP(recorded_at) / ' . $bucket . ')
                 ORDER BY t ASC'
            );
        }
        $stmt->execute([$dev]);

        $points = array_map(static fn (array $r): array => [
            't'          => $r['t'],
            'z1_flow'    => round((float) $r['z1_flow'], 2),
            'z2_flow'    => round((float) $r['z2_flow'], 2),
            'z1_tripped' => (bool) $r['z1_tripped'],
            'z2_tripped' => (bool) $r['z2_tripped'],
            'rssi'       => $r['rssi'] !== null ? (int) round((float) $r['rssi']) : null,
        ], $stmt->fetchAll());

        Http::json(['ok' => true, 'range' => $range, 'zone' => $zone, 'points' => $points]);
    }

    private static function deviceId(): string
    {
        $dev = Http::query('device_id');
        if ($dev) {
            return $dev;
        }
        $first = DB::pdo()->query('SELECT device_id FROM devices ORDER BY device_id LIMIT 1')->fetchColumn();
        return $first ? (string) $first : 'leakguard-01';
    }
}
