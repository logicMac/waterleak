<?php
declare(strict_types=1);

/*
 * LeakGuard API front controller + router.
 *
 * Apache (.htaccess) sends every /<base>/api/* request here. Under the PHP
 * built-in server (`php -S localhost:8000 -t public public/index.php`) it also
 * acts as the router script and passes static files through.
 */

if (PHP_SAPI === 'cli-server') {
    $path = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (strpos($path, '/api/') === false) {
        $file = __DIR__ . $path;
        if ($path !== '/' && is_file($file)) {
            return false; // let the built-in server serve it
        }
        http_response_code(404);
        header('Content-Type: application/json');
        echo '{"ok":false,"error":"Not found"}';
        return true;
    }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
define('LEAKGUARD_SRC', dirname(__DIR__) . '/src');

spl_autoload_register(function (string $class): void {
    foreach ([
        LEAKGUARD_SRC . "/$class.php",
        LEAKGUARD_SRC . "/Controllers/$class.php",
        LEAKGUARD_SRC . "/Services/$class.php",
        LEAKGUARD_SRC . "/Middleware/$class.php",
    ] as $f) {
        if (is_file($f)) {
            require $f;
            return;
        }
    }
});

if (is_file(dirname(__DIR__) . '/vendor/autoload.php')) {
    require dirname(__DIR__) . '/vendor/autoload.php';
}

Env::load(dirname(__DIR__) . '/config/.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Asia/Manila'));

// ── Security headers ─────────────────────────────────────────────────────────
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store');

// ── CORS (admin API only; device calls carry no Origin) ──────────────────────
$origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = array_filter(array_map('trim', explode(',', (string) Env::get('APP_ORIGIN', ''))));
if ($origin !== '' && in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, X-API-Key');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Vary: Origin');
}
if (Http::method() === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Session (admin API) ──────────────────────────────────────────────────────
session_name(Env::get('SESSION_NAME', 'LGSESS'));
session_set_cookie_params([
    'lifetime' => 60 * 60 * 8,
    'path'     => '/',
    'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// ── Routing ──────────────────────────────────────────────────────────────────
$uri  = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pos  = strpos($uri, '/api/');
$route = $pos === false ? '' : rtrim(substr($uri, $pos + 5), '/');
// The firmware's SERVER_BASE may mount the device API under /api/leak
// (e.g. https://host/api/leak + "/report"); accept that prefix for the
// device routes so both /api/report and /api/leak/report work.
if (preg_match('#^leak/(report|alert|daily|event|commands|config|health)$#', $route, $pm)) {
    $route = $pm[1];
}
$method = Http::method();

$routes = [
    // device-facing (X-API-Key)
    ['GET',  'health',                        fn() => Http::json(['ok' => true, 'time' => date('Y-m-d H:i:s')])],
    ['POST', 'report',                        [DeviceController::class, 'report']],
    ['POST', 'alert',                         [DeviceController::class, 'alert']],
    ['POST', 'event',                         [DeviceController::class, 'event']],
    ['POST', 'daily',                         [DeviceController::class, 'daily']],
    ['GET',  'commands',                      [DeviceController::class, 'commands']],
    ['GET',  'config',                        [DeviceController::class, 'config']],

    // admin auth
    ['POST', 'admin/auth/login',              [AuthController::class, 'login']],
    ['POST', 'admin/auth/logout',             [AuthController::class, 'logout']],
    ['GET',  'admin/auth/me',                 [AuthController::class, 'me']],

    // admin data
    ['GET',  'admin/status',                  [StatusController::class, 'status']],
    ['GET',  'admin/readings',                [ReadingsController::class, 'readings']],
    ['GET',  'admin/alerts',                  [AlertsController::class, 'index']],
    ['GET',  'admin/alerts/export.csv',       [AlertsController::class, 'exportCsv']],
    ['GET',  'admin/logs',                    [LogsController::class, 'index']],
    ['GET',  'admin/logs/export.csv',         [LogsController::class, 'exportCsv']],
    ['GET',  'admin/reports/daily',           [ReportsController::class, 'daily']],
    ['GET',  'admin/reports/daily/export.csv',[ReportsController::class, 'exportCsv']],
    ['GET',  'admin/settings',                [SettingsController::class, 'get']],
    ['PUT',  'admin/settings',                [SettingsController::class, 'put']],
    ['POST', 'admin/control',                 [ControlController::class, 'control']],
    ['POST', 'admin/ai/summary',              [AiController::class, 'summary']],
    ['GET',  'admin/users',                   [UsersController::class, 'index']],
    ['POST', 'admin/users',                   [UsersController::class, 'create']],
    ['GET',  'admin/recipients',              [RecipientsController::class, 'index']],
    ['POST', 'admin/recipients',              [RecipientsController::class, 'create']],
];

try {
    foreach ($routes as [$m, $r, $handler]) {
        if ($m === $method && $r === $route) {
            $handler();
        }
    }

    // Parameterised routes
    if (preg_match('#^admin/alerts/(\d+)/acknowledge$#', $route, $mm) && $method === 'POST') {
        AlertsController::acknowledge((int) $mm[1]);
    }
    if (preg_match('#^admin/commands/(\d+)$#', $route, $mm) && $method === 'GET') {
        ControlController::show((int) $mm[1]);
    }
    if (preg_match('#^admin/users/(\d+)$#', $route, $mm)) {
        $method === 'PUT'    ? UsersController::update((int) $mm[1])
          : ($method === 'DELETE' ? UsersController::delete((int) $mm[1])
          : Http::error('Method not allowed', 405));
    }
    if (preg_match('#^admin/recipients/(\d+)$#', $route, $mm)) {
        $method === 'PUT'    ? RecipientsController::update((int) $mm[1])
          : ($method === 'DELETE' ? RecipientsController::delete((int) $mm[1])
          : Http::error('Method not allowed', 405));
    }

    Http::error('Not found', 404);
} catch (PDOException $e) {
    error_log('LeakGuard DB error: ' . $e->getMessage());
    Http::error('Database error', 500);
} catch (Throwable $e) {
    error_log('LeakGuard error: ' . $e->getMessage());
    Http::error('Server error', 500);
}
