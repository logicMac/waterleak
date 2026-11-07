<?php
declare(strict_types=1);

/*
 * Retention job — run nightly (Task Scheduler / cron):
 *   php C:\wamp64\www\waterleak\backend\cron\cleanup.php
 *
 * Deletes readings older than READING_RETENTION_DAYS. daily_reports and
 * activity_logs are kept (they are already the aggregate forms).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('CLI only');
}

$src = dirname(__DIR__) . '/src';
require $src . '/Env.php';
require $src . '/DB.php';

Env::load(dirname(__DIR__) . '/config/.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Asia/Manila'));

$days = Env::int('READING_RETENTION_DAYS', 30);
$pdo  = DB::pdo();

$stmt = $pdo->prepare(
    'DELETE FROM readings WHERE recorded_at < (NOW() - INTERVAL ? DAY)'
);
$stmt->execute([$days]);
$deleted = $stmt->rowCount();

$pdo->exec('DELETE FROM login_attempts WHERE attempted_at < (NOW() - INTERVAL 1 DAY)');

$pdo->prepare(
    "INSERT INTO activity_logs (device_id, occurred_at, type, source, message)
     VALUES (NULL, NOW(), 'system', 'cron', ?)"
)->execute(["Retention cleanup: removed $deleted readings older than {$days}d"]);

echo '[' . date('Y-m-d H:i:s') . "] removed $deleted readings (>{$days}d)\n";
