<?php
declare(strict_types=1);

/**
 * Minimal SMTP client (AUTH LOGIN, optional STARTTLS / ssl) so alerts can be
 * emailed without Composer. If PHPMailer is installed (vendor/autoload.php),
 * it is used instead. Returns false silently when SMTP is not configured.
 */
final class SmtpMailer
{
    public static function send(string $to, string $subject, string $body): bool
    {
        $host = Env::get('SMTP_HOST');
        if (!$host) {
            return false; // email disabled — never fatal
        }
        try {
            if (class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
                $m = new PHPMailer\PHPMailer\PHPMailer(true);
                $m->isSMTP();
                $m->Host       = $host;
                $m->Port       = Env::int('SMTP_PORT', 587);
                $m->SMTPAuth   = (bool) Env::get('SMTP_USER');
                $m->Username   = (string) Env::get('SMTP_USER', '');
                $m->Password   = (string) Env::get('SMTP_PASS', '');
                $m->SMTPSecure = Env::get('SMTP_SECURE', 'tls');
                $m->setFrom(Env::get('SMTP_FROM', 'leakguard@localhost'), Env::get('SMTP_FROM_NAME', 'LeakGuard'));
                $m->addAddress($to);
                $m->Subject = $subject;
                $m->Body    = $body;
                $m->send();
                return true;
            }
            return self::rawSend($to, $subject, $body, $host);
        } catch (Throwable $e) {
            error_log('LeakGuard mail error: ' . $e->getMessage());
            return false;
        }
    }

    private static function rawSend(string $to, string $subject, string $body, string $host): bool
    {
        $port   = Env::int('SMTP_PORT', 587);
        $secure = strtolower((string) Env::get('SMTP_SECURE', 'tls'));
        $user   = Env::get('SMTP_USER');
        $pass   = Env::get('SMTP_PASS');
        $from   = Env::get('SMTP_FROM', 'leakguard@localhost');
        $fromName = Env::get('SMTP_FROM_NAME', 'LeakGuard');

        $remote = ($secure === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
        $fp = @fsockopen($remote, $errno, $errstr, 8);
        if (!$fp) {
            return false;
        }
        stream_set_timeout($fp, 8);

        $read = function () use ($fp): string {
            $out = '';
            while (($line = fgets($fp, 512)) !== false) {
                $out .= $line;
                if (strlen($line) >= 4 && $line[3] === ' ') {
                    break;
                }
            }
            return $out;
        };
        $cmd = function (string $c, array $expect) use ($fp, $read): bool {
            fwrite($fp, $c . "\r\n");
            $r = $read();
            $code = (int) substr($r, 0, 3);
            return in_array($code, $expect, true);
        };

        $read();
        $ehlo = gethostname() ?: 'localhost';
        if (!$cmd("EHLO $ehlo", [250])) { fclose($fp); return false; }
        if ($secure === 'tls') {
            if (!$cmd('STARTTLS', [220])) { fclose($fp); return false; }
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { fclose($fp); return false; }
            $cmd("EHLO $ehlo", [250]);
        }
        if ($user) {
            if (!$cmd('AUTH LOGIN', [334])) { fclose($fp); return false; }
            $cmd(base64_encode($user), [334]);
            if (!$cmd(base64_encode((string) $pass), [235])) { fclose($fp); return false; }
        }
        if (!$cmd("MAIL FROM:<$from>", [250])) { fclose($fp); return false; }
        if (!$cmd("RCPT TO:<$to>", [250, 251])) { fclose($fp); return false; }
        if (!$cmd('DATA', [354])) { fclose($fp); return false; }

        $headers = implode("\r\n", [
            'From: ' . self::encName($fromName) . " <$from>",
            "To: <$to>",
            'Subject: ' . self::encName($subject),
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=utf-8',
            'Content-Transfer-Encoding: 8bit',
            'Date: ' . date(DATE_RFC2822),
        ]);
        // Dot-stuff the body per RFC 5321.
        $data = preg_replace('/^\./m', '..', str_replace("\r\n", "\n", $body));
        fwrite($fp, $headers . "\r\n\r\n" . $data . "\r\n.\r\n");
        $ok = str_starts_with($read(), '250');
        $cmd('QUIT', [221]);
        fclose($fp);
        return $ok;
    }

    private static function encName(string $s): string
    {
        return preg_match('/[\x80-\xFF]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
    }
}
