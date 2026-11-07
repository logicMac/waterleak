<?php
declare(strict_types=1);

/**
 * Pluggable SMS gateway. The SIM900A module lives on the device (planned);
 * a hosted provider (e.g. Semaphore PH) can be enabled via .env without
 * touching call sites. Failures are always non-fatal.
 */
interface SmsGateway
{
    public function send(string $phone, string $message): bool;
}

final class NullSmsGateway implements SmsGateway
{
    public function send(string $phone, string $message): bool
    {
        return false;
    }
}

/** Semaphore (semaphore.co) HTTP API — uncomment when SMS_PROVIDER=semaphore. */
final class SemaphoreSmsGateway implements SmsGateway
{
    public function send(string $phone, string $message): bool
    {
        $key = Env::get('SMS_API_KEY');
        if (!$key) {
            return false;
        }
        $payload = http_build_query([
            'apikey'     => $key,
            'number'     => $phone,
            'message'    => $message,
            'sendername' => Env::get('SMS_SENDER', 'LeakGuard'),
        ]);
        $ctx = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $payload,
            'timeout' => 8,
        ]]);
        $res = @file_get_contents('https://api.semaphore.co/api/v4/messages', false, $ctx);
        return $res !== false;
    }
}

final class Sms
{
    public static function gateway(): SmsGateway
    {
        return match (Env::get('SMS_PROVIDER', 'none')) {
            'semaphore' => new SemaphoreSmsGateway(),
            default     => new NullSmsGateway(),
        };
    }
}
