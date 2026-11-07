<?php
declare(strict_types=1);

final class AdminAuth
{
    /** Current session user row, or null. */
    public static function user(): ?array
    {
        if (empty($_SESSION['user_id'])) {
            return null;
        }
        $stmt = DB::pdo()->prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?');
        $stmt->execute([$_SESSION['user_id']]);
        $u = $stmt->fetch();
        if (!$u || !(int) $u['is_active']) {
            return null;
        }
        return $u;
    }

    /** Require a logged-in user + valid CSRF token on state-changing methods. */
    public static function requireUser(?string $role = null): array
    {
        $u = self::user();
        if (!$u) {
            Http::error('Unauthenticated', 401);
        }
        if ($role !== null && $u['role'] !== $role) {
            Http::error('Forbidden', 403);
        }
        if (Http::method() !== 'GET') {
            $token = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
            $sess  = (string) ($_SESSION['csrf'] ?? '');
            if ($sess === '' || $token === '' || !hash_equals($sess, $token)) {
                Http::error('CSRF token mismatch', 403);
            }
        }
        return $u;
    }

    public static function issueCsrf(): string
    {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }
}
