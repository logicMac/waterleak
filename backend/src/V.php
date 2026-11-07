<?php
declare(strict_types=1);

/**
 * Strict request-payload validation. Every failure throws a 400 via Http::error
 * so the device gets a clean JSON error and can log it.
 */
final class V
{
    public static function req(array $a, string $key): mixed
    {
        if (!array_key_exists($key, $a)) {
            Http::error("Missing field: $key", 400);
        }
        return $a[$key];
    }

    public static function str(array $a, string $key, int $max = 128): string
    {
        $v = self::req($a, $key);
        if (!is_string($v) || $v === '' || strlen($v) > $max) {
            Http::error("Invalid field: $key", 400);
        }
        return $v;
    }

    public static function num(array $a, string $key, float $min, float $max): float
    {
        $v = self::req($a, $key);
        if (!is_numeric($v) || !is_finite((float) $v) || (float) $v < $min || (float) $v > $max) {
            Http::error("Invalid field: $key", 400);
        }
        return (float) $v;
    }

    public static function int(array $a, string $key, int $min, int $max): int
    {
        $v = self::req($a, $key);
        if (!is_int($v) || $v < $min || $v > $max) {
            Http::error("Invalid field: $key", 400);
        }
        return $v;
    }

    public static function boolv(array $a, string $key): bool
    {
        $v = self::req($a, $key);
        if (!is_bool($v)) {
            Http::error("Invalid field: $key", 400);
        }
        return $v;
    }

    public static function oneOf(array $a, string $key, array $allowed): string
    {
        $v = self::str($a, $key, 64);
        if (!in_array($v, $allowed, true)) {
            Http::error("Invalid value for $key", 400);
        }
        return $v;
    }

    /** Device timestamps: "YYYY-MM-DD HH:MM:SS" in Asia/Manila, no timezone. */
    public static function ts(array $a, string $key): string
    {
        $v = self::str($a, $key, 32);
        $d = DateTime::createFromFormat('Y-m-d H:i:s', $v, new DateTimeZone('Asia/Manila'));
        if ($d === false || $d->format('Y-m-d H:i:s') !== $v) {
            Http::error("Invalid timestamp: $key", 400);
        }
        return $v;
    }

    /** A nested zone object {"flow_lpm":…,"total_l":…,"tripped":…}. */
    public static function zone(array $a, string $key): array
    {
        $z = self::req($a, $key);
        if (!is_array($z)) {
            Http::error("Invalid field: $key", 400);
        }
        return [
            'flow_lpm' => self::num($z, 'flow_lpm', 0, 200),
            'total_l'  => self::num($z, 'total_l', 0, 10000000),
            'tripped'  => self::boolv($z, 'tripped'),
        ];
    }
}
