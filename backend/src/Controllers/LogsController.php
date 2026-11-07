<?php
declare(strict_types=1);

final class LogsController
{
    private const PER_PAGE = 25;
    private const TYPES = ['alert', 'reset', 'valve_closed', 'valve_opened', 'command', 'system', 'login'];

    /** GET /admin/logs?type=&from=&to=&q=&page= */
    public static function index(): void
    {
        AdminAuth::requireUser();
        [$where, $args] = self::filters();
        $page = max(1, (int) (Http::query('page', '1')));
        $off  = ($page - 1) * self::PER_PAGE;
        $pdo  = DB::pdo();

        $total = $pdo->prepare("SELECT COUNT(*) FROM activity_logs l $where");
        $total->execute($args);
        $count = (int) $total->fetchColumn();

        $stmt = $pdo->prepare(
            "SELECT l.*, u.name AS user_name
             FROM activity_logs l LEFT JOIN users u ON u.id = l.user_id
             $where ORDER BY l.occurred_at DESC, l.id DESC
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

    /** GET /admin/logs/export.csv */
    public static function exportCsv(): void
    {
        AdminAuth::requireUser();
        [$where, $args] = self::filters();
        $stmt = DB::pdo()->prepare(
            "SELECT l.id, l.device_id, l.occurred_at, l.type, l.source, l.message, u.name AS user
             FROM activity_logs l LEFT JOIN users u ON u.id = l.user_id
             $where ORDER BY l.occurred_at DESC LIMIT 5000"
        );
        $stmt->execute($args);
        Csv::send('activity_logs.csv',
            ['id', 'device_id', 'occurred_at', 'type', 'source', 'message', 'user'],
            $stmt->fetchAll());
    }

    private static function filters(): array
    {
        $where = 'WHERE 1=1';
        $args  = [];
        if ($t = Http::query('type')) {
            if (!in_array($t, self::TYPES, true)) {
                Http::error('Invalid type', 400);
            }
            $where .= ' AND l.type = ?';
            $args[] = $t;
        }
        if ($f = Http::query('from')) {
            $where .= ' AND l.occurred_at >= ?';
            $args[] = $f . ' 00:00:00';
        }
        if ($t = Http::query('to')) {
            $where .= ' AND l.occurred_at <= ?';
            $args[] = $t . ' 23:59:59';
        }
        if ($q = Http::query('q')) {
            $where .= ' AND l.message LIKE ?';
            $args[] = '%' . substr($q, 0, 80) . '%';
        }
        return [$where, $args];
    }
}
