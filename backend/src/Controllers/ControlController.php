<?php
declare(strict_types=1);

final class ControlController
{
    private const COMMANDS = ['reset', 'close_valve', 'open_valve'];

    /**
     * POST /admin/control {"command":"reset"|"close_valve"|"open_valve"}
     * Admin only. open_valve is rejected while a zone is tripped — the device
     * ignores it anyway; the user should Reset instead.
     */
    public static function control(): void
    {
        $u   = AdminAuth::requireUser('admin');
        $b   = Http::body();
        $cmd = V::oneOf($b, 'command', self::COMMANDS);
        $pdo = DB::pdo();

        $d = $pdo->query('SELECT * FROM devices ORDER BY device_id LIMIT 1')->fetch();
        if (!$d) {
            Http::error('No device registered yet', 409);
        }
        if ($cmd === 'open_valve' && ((int) $d['z1_tripped'] || (int) $d['z2_tripped'])) {
            Http::error(
                'A zone is tripped — the device ignores Open while tripped. Use Reset instead.',
                409
            );
        }

        $pdo->prepare(
            "INSERT INTO commands (device_id, command, status, issued_by, created_at)
             VALUES (?,?, 'pending', ?, NOW())"
        )->execute([$d['device_id'], $cmd, $u['id']]);
        $id = (int) $pdo->lastInsertId();

        $label = str_replace('_', ' ', $cmd);
        $pdo->prepare(
            "INSERT INTO activity_logs (device_id, occurred_at, type, source, message, user_id)
             VALUES (?, NOW(), 'command', 'remote', ?, ?)"
        )->execute([$d['device_id'], "{$u['name']} issued \"$label\"", $u['id']]);

        Http::json(['ok' => true, 'command_id' => $id]);
    }

    /** GET /admin/commands/{id} — delivery status for the control progress UI. */
    public static function show(int $id): void
    {
        AdminAuth::requireUser();
        // Lazy expiry, same rule the device poll applies.
        DB::pdo()->prepare(
            "UPDATE commands SET status = 'expired'
             WHERE id = ? AND status = 'pending' AND created_at < (NOW() - INTERVAL ? SECOND)"
        )->execute([$id, Env::int('COMMAND_TTL_S', 30)]);

        $stmt = DB::pdo()->prepare(
            'SELECT c.id, c.device_id, c.command, c.status, c.created_at, c.delivered_at, u.name AS issued_by
             FROM commands c LEFT JOIN users u ON u.id = c.issued_by WHERE c.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Http::error('Command not found', 404);
        }
        Http::json(['ok' => true, 'command' => $row]);
    }
}
