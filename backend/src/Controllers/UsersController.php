<?php
declare(strict_types=1);

final class UsersController
{
    /** GET /admin/users — admin only. */
    public static function index(): void
    {
        AdminAuth::requireUser('admin');
        $rows = DB::pdo()->query(
            'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY name'
        )->fetchAll();
        Http::json(['ok' => true, 'rows' => $rows]);
    }

    /** POST /admin/users {name,email,password,role} */
    public static function create(): void
    {
        AdminAuth::requireUser('admin');
        $b    = Http::body();
        $name = V::str($b, 'name', 120);
        $mail = strtolower(trim(V::str($b, 'email', 190)));
        $pass = V::str($b, 'password', 128);
        $role = V::oneOf($b, 'role', ['admin', 'staff']);

        if (!filter_var($mail, FILTER_VALIDATE_EMAIL)) {
            Http::error('Invalid email address', 400);
        }
        if (strlen($pass) < 8) {
            Http::error('Password must be at least 8 characters', 400);
        }
        try {
            DB::pdo()->prepare(
                'INSERT INTO users (name, email, password_hash, role, is_active, created_at)
                 VALUES (?,?,?,?,1,NOW())'
            )->execute([$name, $mail, password_hash($pass, PASSWORD_DEFAULT), $role]);
        } catch (PDOException $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                Http::error('A user with that email already exists', 409);
            }
            throw $e;
        }
        Http::json(['ok' => true, 'id' => (int) DB::pdo()->lastInsertId()], 201);
    }

    /** PUT /admin/users/{id} {name?,role?,is_active?,password?} */
    public static function update(int $id): void
    {
        $me = AdminAuth::requireUser('admin');
        $b  = Http::body();
        $pdo = DB::pdo();

        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $target = $stmt->fetch();
        if (!$target) {
            Http::error('User not found', 404);
        }

        $fields = [];
        $args   = [];
        if (array_key_exists('name', $b)) {
            $fields[] = 'name = ?';
            $args[]   = V::str($b, 'name', 120);
        }
        if (array_key_exists('role', $b)) {
            $role = V::oneOf($b, 'role', ['admin', 'staff']);
            if ($id === (int) $me['id'] && $role !== 'admin') {
                Http::error('You cannot demote your own account', 400);
            }
            $fields[] = 'role = ?';
            $args[]   = $role;
        }
        if (array_key_exists('is_active', $b)) {
            $active = V::boolv($b, 'is_active') ? 1 : 0;
            if ($id === (int) $me['id'] && !$active) {
                Http::error('You cannot deactivate your own account', 400);
            }
            if (!$active && $target['role'] === 'admin' && self::adminCount($id) === 0) {
                Http::error('Cannot deactivate the last admin', 400);
            }
            $fields[] = 'is_active = ?';
            $args[]   = $active;
        }
        if (array_key_exists('password', $b)) {
            $pass = V::str($b, 'password', 128);
            if (strlen($pass) < 8) {
                Http::error('Password must be at least 8 characters', 400);
            }
            $fields[] = 'password_hash = ?';
            $args[]   = password_hash($pass, PASSWORD_DEFAULT);
        }
        if (!$fields) {
            Http::error('Nothing to update', 400);
        }
        $args[] = $id;
        $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($args);
        Http::json(['ok' => true]);
    }

    /** DELETE /admin/users/{id} */
    public static function delete(int $id): void
    {
        $me = AdminAuth::requireUser('admin');
        if ($id === (int) $me['id']) {
            Http::error('You cannot delete your own account', 400);
        }
        $pdo = DB::pdo();
        $stmt = $pdo->prepare('SELECT role FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $role = $stmt->fetchColumn();
        if ($role === false) {
            Http::error('User not found', 404);
        }
        if ($role === 'admin' && self::adminCount($id) === 0) {
            Http::error('Cannot delete the last admin', 400);
        }
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        Http::json(['ok' => true]);
    }

    /** Admins still active if $excludeId were removed. */
    private static function adminCount(int $excludeId): int
    {
        $stmt = DB::pdo()->prepare(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?"
        );
        $stmt->execute([$excludeId]);
        return (int) $stmt->fetchColumn();
    }
}
