<?php
declare(strict_types=1);

/*
 * One-off admin bootstrap for shared hosting (no CLI access).
 *
 * Upload this file to backend/public/, open it in a browser once, then
 * DELETE it from the server immediately after use.
 *
 *   /setup-admin.php                        → resets admin@leakguard.local / admin123
 *   /setup-admin.php?email=a@b.com&pass=x   → creates/resets that user (role=admin)
 */

require dirname(__DIR__) . '/src/Env.php';
require dirname(__DIR__) . '/src/DB.php';

Env::load(dirname(__DIR__) . '/config/.env');

header('Content-Type: text/plain; charset=utf-8');

$email = trim((string)($_GET['email'] ?? 'admin@leakguard.local'));
$pass  = (string)($_GET['pass'] ?? 'admin123');
$name  = trim((string)($_GET['name'] ?? 'Admin'));

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    exit("Invalid email\n");
}
if (strlen($pass) < 8) {
    http_response_code(400);
    exit("Password must be at least 8 characters\n");
}

try {
    $pdo  = DB::pdo();
    $hash = password_hash($pass, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare(
        'INSERT INTO users (name, email, password_hash, role, is_active)
         VALUES (?, ?, ?, "admin", 1)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = "admin", is_active = 1'
    );
    $stmt->execute([$name, $email, $hash]);

    echo "OK — admin ready\n";
    echo "  email:    $email\n";
    echo "  password: $pass\n";
    echo "\nNow DELETE setup-admin.php from backend/public/.\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo "FAILED: " . $e->getMessage() . "\n";
}
