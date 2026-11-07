<?php
declare(strict_types=1);

final class ReportsController
{
    /** GET /admin/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD */
    public static function daily(): void
    {
        AdminAuth::requireUser();
        [$from, $to] = self::range();
        $dev = self::deviceId();

        $stmt = DB::pdo()->prepare(
            'SELECT report_date, z1_daily_l, z1_peak_lpm, z2_daily_l, z2_peak_lpm, trips
             FROM daily_reports
             WHERE device_id = ? AND report_date BETWEEN ? AND ?
             ORDER BY report_date ASC'
        );
        $stmt->execute([$dev, $from, $to]);
        $rows = $stmt->fetchAll();

        Http::json(['ok' => true, 'from' => $from, 'to' => $to, 'rows' => $rows]);
    }

    /** GET /admin/reports/daily/export.csv */
    public static function exportCsv(): void
    {
        AdminAuth::requireUser();
        [$from, $to] = self::range();
        $dev = self::deviceId();
        $stmt = DB::pdo()->prepare(
            'SELECT report_date, z1_daily_l, z1_peak_lpm, z2_daily_l, z2_peak_lpm, trips
             FROM daily_reports
             WHERE device_id = ? AND report_date BETWEEN ? AND ?
             ORDER BY report_date ASC'
        );
        $stmt->execute([$dev, $from, $to]);
        Csv::send('daily_report.csv',
            ['date', 'zone1_liters', 'zone1_peak_lpm', 'zone2_liters', 'zone2_peak_lpm', 'trips'],
            $stmt->fetchAll());
    }

    private static function range(): array
    {
        $to   = Http::query('to', date('Y-m-d'));
        $from = Http::query('from', date('Y-m-d', strtotime('-6 days')));
        foreach ([$from, $to] as $d) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
                Http::error('Invalid date range', 400);
            }
        }
        if ($from > $to || (strtotime($to) - strtotime($from)) > 366 * 86400) {
            Http::error('Invalid date range', 400);
        }
        return [$from, $to];
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
