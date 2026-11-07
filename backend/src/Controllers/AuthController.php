<?php
declare(strict_types=1);

final class AuthController
{
    private const MAX_ATTEMPTS = 5;
    private const WINDOW_S     = 600;

    public static function login(): void
    {
        $b     = Http::body();
        $email = strtolower(trim(V::str($b, 'email', 190)));
        $pass  = V::str($b, 'password', 128);
        $pdo   = DB::pdo();

        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM login_attempts
             WHERE email = ? AND attempted_at > (NOW() - INTERVAL ? SECOND)'
        );
        $stmt->execute([$email, self::WINDOW_S]);
        if ((int) $stmt->fetchColumn() >= self::MAX_ATTEMPTS) {
            Http::error('Too many failed attempts. Try again in a few minutes.', 429);
        }

        $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $u = $stmt->fetch();

        if (!$u || !(int) $u['is_active'] || !password_verify($pass, $u['password_hash'])) {
            $pdo->prepare('INSERT INTO login_attempts (email, ip, attempted_at) VALUES (?,?,NOW())')
                ->execute([$email, $_SERVER['REMOTE_ADDR'] ?? '']);
            Http::error('Invalid email or password', 401);
        }

        $pdo->prepare('DELETE FROM login_attempts WHERE email = ?')->execute([$email]);

        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $u['id'];
        unset($_SESSION['csrf']);
        $csrf = AdminAuth::issueCsrf();

        $pdo->prepare(
            "INSERT INTO activity_logs (device_id, occurred_at, type, source, message, user_id)
             VALUES (NULL, NOW(), 'login', 'web', ?, ?)"
        )->execute([$u['name'] . ' signed in', $u['id']]);

        Http::json([
            'ok'         => true,
            'user'       => self::publicUser($u),
            'csrf_token' => $csrf,
        ]);
    }

    public static function logout(): void
    {
        AdminAuth::requireUser();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        Http::json(['ok' => true]);
    }

    public static function me(): void
    {
        $u = AdminAuth::user();
        if (!$u) {
            Http::error('Unauthenticated', 401);
        }
        Http::json(['ok' => true, 'user' => self::publicUser($u), 'csrf_token' => AdminAuth::issueCsrf()]);
    }

    private static function publicUser(array $u): array
    {
        return [
            'id'    => (int) $u['id'],
            'name'  => $u['name'],
            'email' => $u['email'],
            'role'  => $u['role'],
        ];
    }
}
