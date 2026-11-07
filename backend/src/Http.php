<?php
declare(strict_types=1);

final class Http
{
    public const MAX_BODY = 16384;

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function json(mixed $data, int $code = 200): never
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error(string $message, int $code, array $extra = []): never
    {
        self::json(['ok' => false, 'error' => $message] + $extra, $code);
    }

    /** Decoded JSON request body as an associative array. */
    public static function body(): array
    {
        $len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($len > self::MAX_BODY) {
            self::error('Request body too large', 413);
        }
        $raw = file_get_contents('php://input');
        if ($raw === false || strlen($raw) > self::MAX_BODY) {
            self::error('Request body too large', 413);
        }
        if (trim((string) $raw) === '') {
            return [];
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            self::error('Malformed JSON body', 400);
        }
        return $data;
    }

    public static function query(string $key, ?string $default = null): ?string
    {
        $v = $_GET[$key] ?? null;
        return is_string($v) && $v !== '' ? $v : $default;
    }
}
