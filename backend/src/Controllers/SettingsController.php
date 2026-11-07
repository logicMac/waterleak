<?php
declare(strict_types=1);

final class SettingsController
{
    /** Editable setting keys and their validators. */
    private const KEYS = [
        'threshold.normal_max_lpm'     => 'float',
        'threshold.quiet_start'        => 'time',
        'threshold.quiet_end'          => 'time',
        'threshold.max_continuous_min' => 'int',
        'threshold.max_burst_lpm'      => 'float',
        'notify.email_enabled'         => 'bool',
        'notify.sms_enabled'           => 'bool',
        'notify.on_night_flow'         => 'bool',
        'notify.on_long_flow'          => 'bool',
        'notify.on_burst_rate'         => 'bool',
        'device.name'                  => 'string',
        'device.location'              => 'string',
    ];

    /** GET /admin/settings — all keys (staff may read; only admin writes). */
    public static function get(): void
    {
        AdminAuth::requireUser();
        $rows = DB::pdo()->query('SELECT `key`, `value` FROM settings')->fetchAll(PDO::FETCH_KEY_PAIR);
        Http::json(['ok' => true, 'settings' => $rows]);
    }

    /** PUT /admin/settings {key: value, …} — admin only. */
    public static function put(): void
    {
        AdminAuth::requireUser('admin');
        $b   = Http::body();
        $pdo = DB::pdo();
        $upd = $pdo->prepare('INSERT INTO settings (`key`, `value`) VALUES (?,?)
                             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)');

        foreach ($b as $key => $value) {
            if (!isset(self::KEYS[$key])) {
                Http::error("Unknown setting: $key", 400);
            }
            $value = self::validate(self::KEYS[$key], $value, $key);
            $upd->execute([$key, $value]);
        }
        if (!$b) {
            Http::error('Empty settings payload', 400);
        }
        Http::json(['ok' => true]);
    }

    private static function validate(string $type, mixed $v, string $key): string
    {
        switch ($type) {
            case 'float':
                if (!is_numeric($v) || (float) $v < 0 || (float) $v > 1000) {
                    Http::error("Invalid value for $key", 400);
                }
                return (string) (float) $v;
            case 'int':
                if (!is_numeric($v) || (int) $v < 0 || (int) $v > 10000) {
                    Http::error("Invalid value for $key", 400);
                }
                return (string) (int) $v;
            case 'time':
                if (!is_string($v) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) {
                    Http::error("Invalid time for $key (HH:MM)", 400);
                }
                return $v;
            case 'bool':
                if (!is_bool($v)) {
                    Http::error("Invalid value for $key", 400);
                }
                return $v ? '1' : '0';
            default:
                if (!is_string($v) || strlen($v) > 190) {
                    Http::error("Invalid value for $key", 400);
                }
                return $v;
        }
    }
}
