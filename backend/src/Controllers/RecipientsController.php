<?php
declare(strict_types=1);

final class RecipientsController
{
    /** GET /admin/recipients */
    public static function index(): void
    {
        AdminAuth::requireUser();
        $rows = DB::pdo()->query(
            'SELECT id, name, phone, email, active FROM notification_recipients ORDER BY name'
        )->fetchAll();
        Http::json(['ok' => true, 'rows' => $rows]);
    }

    /** POST /admin/recipients {name, phone?, email?, active?} */
    public static function create(): void
    {
        AdminAuth::requireUser('admin');
        $b = Http::body();
        [$name, $phone, $email, $active] = self::fields($b, true);
        DB::pdo()->prepare(
            'INSERT INTO notification_recipients (name, phone, email, active) VALUES (?,?,?,?)'
        )->execute([$name, $phone, $email, $active]);
        Http::json(['ok' => true, 'id' => (int) DB::pdo()->lastInsertId()], 201);
    }

    /** PUT /admin/recipients/{id} */
    public static function update(int $id): void
    {
        AdminAuth::requireUser('admin');
        $b = Http::body();
        [$name, $phone, $email, $active] = self::fields($b, true);
        $stmt = DB::pdo()->prepare(
            'UPDATE notification_recipients SET name=?, phone=?, email=?, active=? WHERE id=?'
        );
        $stmt->execute([$name, $phone, $email, $active, $id]);
        if ($stmt->rowCount() === 0) {
            Http::error('Recipient not found', 404);
        }
        Http::json(['ok' => true]);
    }

    /** DELETE /admin/recipients/{id} */
    public static function delete(int $id): void
    {
        AdminAuth::requireUser('admin');
        $stmt = DB::pdo()->prepare('DELETE FROM notification_recipients WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            Http::error('Recipient not found', 404);
        }
        Http::json(['ok' => true]);
    }

    private static function fields(array $b, bool $requireName): array
    {
        $name   = $requireName ? V::str($b, 'name', 120) : ($b['name'] ?? '');
        $phone  = isset($b['phone']) && $b['phone'] !== '' ? V::str($b, 'phone', 32) : null;
        $email  = isset($b['email']) && $b['email'] !== '' ? strtolower(trim(V::str($b, 'email', 190))) : null;
        $active = isset($b['active']) ? (V::boolv($b, 'active') ? 1 : 0) : 1;
        if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Http::error('Invalid email address', 400);
        }
        if ($phone !== null && !preg_match('/^[+\d][\d\s-]{4,30}$/', $phone)) {
            Http::error('Invalid phone number', 400);
        }
        if ($email === null && $phone === null) {
            Http::error('Provide at least an email or a phone number', 400);
        }
        return [$name, $phone, $email, $active];
    }
}
