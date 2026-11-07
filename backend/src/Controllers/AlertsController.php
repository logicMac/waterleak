<?php
declare(strict_types=1);

final class AlertsController
{
    private const PER_PAGE = 20;

    /** GET /admin/alerts?status=&zone=&from=&to=&page= */
    public static function index(): void
    {
        AdminAuth::requireUser();
        [$where, $args] = self::filters();
        $page = max(1, (int) (Http::query('page', '1')));
        $off  = ($page - 1) * self::PER_PAGE;
        $pdo  = DB::pdo();

        $total = $pdo->prepare("SELECT COUNT(*) FROM alerts a $where");
        $total->execute($args);
        $count = (int) $total->fetchColumn();

        $stmt = $pdo->prepare(
            "SELECT a.*, u.name AS acknowledged_by_name
             FROM alerts a LEFT JOIN users u ON u.id = a.acknowledged_by
             $where ORDER BY a.occurred_at DESC, a.id DESC
             LIMIT " . self::PER_PAGE . " OFFSET $off"
        );
        $stmt->execute($args);

        Http::json([
            'ok'    => true,
            'rows'  => $stmt->fetchAll(),
            'total' => $count,
            'page'  => $page,
            'pages' => max(1, (int) ceil($count / self::PER_PAGE)),
        ]);
    }

    /** GET /admin/alerts/export.csv — same filters, no paging. */
    public static function exportCsv(): void
    {
        AdminAuth::requireUser();
        [$where, $args] = self::filters();
        $stmt = DB::pdo()->prepare(
            "SELECT a.id, a.device_id, a.zone, a.reason, a.flow_lpm, a.occurred_at,
                    a.status, a.resolved_at, a.resolved_source, u.name AS acknowledged_by
             FROM alerts a LEFT JOIN users u ON u.id = a.acknowledged_by
             $where ORDER BY a.occurred_at DESC"
        );
        $stmt->execute($args);
        Csv::send('alerts.csv',
            ['id', 'device_id', 'zone', 'reason', 'flow_lpm', 'occurred_at', 'status', 'acknowledged_by', 'resolved_at', 'resolved_source'],
            $stmt->fetchAll());
    }

    /** POST /admin/alerts/{id}/acknowledge — staff and admin. */
    public static function acknowledge(int $id): void
    {
        $u = AdminAuth::requireUser();
        $stmt = DB::pdo()->prepare(
            "UPDATE alerts SET status = 'acknowledged', acknowledged_by = ?
             WHERE id = ? AND status = 'active'"
        );
        $stmt->execute([$u['id'], $id]);
        if ($stmt->rowCount() === 0) {
            Http::error('Alert not found or not active', 404);
        }
        Http::json(['ok' => true]);
    }

    private static function filters(): array
    {
        $where = 'WHERE 1=1';
        $args  = [];
        if ($s = Http::query('status')) {
            if (!in_array($s, ['active', 'acknowledged', 'resolved'], true)) {
                Http::error('Invalid status', 400);
            }
            $where .= ' AND a.status = ?';
            $args[] = $s;
        }
        if ($z = Http::query('zone')) {
            if (!in_array($z, ['1', '2'], true)) {
                Http::error('Invalid zone', 400);
            }
            $where .= ' AND a.zone = ?';
            $args[] = (int) $z;
        }
        if ($f = Http::query('from')) {
            $where .= ' AND a.occurred_at >= ?';
            $args[] = $f . ' 00:00:00';
        }
        if ($t = Http::query('to')) {
            $where .= ' AND a.occurred_at <= ?';
            $args[] = $t . ' 23:59:59';
        }
        return [$where, $args];
    }
}
