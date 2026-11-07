<?php
declare(strict_types=1);

final class DeviceAuth
{
    /** Constant-time check of the X-API-Key header against .env. */
    public static function check(): void
    {
        $expected = (string) Env::get('DEVICE_API_KEY', '');
        $given    = (string) ($_SERVER['HTTP_X_API_KEY'] ?? '');
        if ($expected === '' || $given === '' || !hash_equals($expected, $given)) {
            Http::error('Unauthorized', 401);
        }
    }
}
