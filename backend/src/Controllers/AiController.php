<?php
declare(strict_types=1);

/**
 * POST /admin/ai/summary — Groq chat completion over the last 7 days of
 * alerts, daily reports and live device state. Staff + admin.
 * Requires GROQ_API_KEY in .env; toggle + model in Settings.
 */
final class AiController
{
    public static function summary(): void
    {
        $u   = AdminAuth::requireUser();
        $pdo = DB::pdo();

        $settings = $pdo->query('SELECT `key`, `value` FROM settings')->fetchAll(PDO::FETCH_KEY_PAIR);
        if (($settings['ai.enabled'] ?? '0') !== '1') {
            Http::error('AI summaries are disabled in Settings', 403);
        }
        // Key is stored in settings (DB); .env GROQ_API_KEY is only a fallback.
        $apiKey = $settings['ai.api_key'] ?? '';
        if ($apiKey === '' || str_starts_with($apiKey, '••••')) {
            $apiKey = (string) Env::get('GROQ_API_KEY', '');
        }
        if ($apiKey === '') {
            Http::error('Groq API key is not configured (Settings → AI)', 501);
        }
        $model = $settings['ai.model'] ?? Env::get('GROQ_MODEL', 'llama-3.3-70b-versatile');

        $device = $pdo->query('SELECT * FROM devices ORDER BY device_id LIMIT 1')->fetch();
        $alerts = $pdo->query(
            "SELECT zone, reason, flow_lpm, occurred_at, status FROM alerts
             WHERE occurred_at >= (NOW() - INTERVAL 7 DAY) ORDER BY occurred_at DESC LIMIT 20"
        )->fetchAll();
        $daily = $pdo->query(
            "SELECT report_date, z1_daily_l, z1_peak_lpm, z2_daily_l, z2_peak_lpm, trips
             FROM daily_reports WHERE report_date >= (CURDATE() - INTERVAL 7 DAY) ORDER BY report_date"
        )->fetchAll();

        $facts = [
            'device' => $device ? [
                'id' => $device['device_id'], 'valve_open' => (bool) $device['valve_open'],
                'zone1_tripped' => (bool) $device['z1_tripped'], 'zone1_reason' => $device['z1_reason'],
                'zone2_tripped' => (bool) $device['z2_tripped'], 'zone2_reason' => $device['z2_reason'],
            ] : null,
            'alerts_last_7d' => $alerts,
            'daily_reports_last_7d' => $daily,
        ];

        $body = json_encode([
            'model' => $model,
            'temperature' => 0.3,
            'max_tokens' => 350,
            'messages' => [
                ['role' => 'system', 'content' =>
                    'You are LeakGuard AI, an assistant for a two-zone water leak detection system ' .
                    'at a school. Summarize the supplied telemetry for non-technical staff in 3-5 ' .
                    'plain sentences: what happened, whether it looks like real leaks, and one ' .
                    'concrete recommendation. Use liters and L/min. No markdown headers.'],
                ['role' => 'user', 'content' => json_encode($facts)],
            ],
        ]);

        $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS     => $body,
        ]);
        $raw  = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($raw === false || $code < 200 || $code >= 300) {
            Http::error('Groq request failed', 502);
        }
        $json = json_decode($raw, true);
        $text = $json['choices'][0]['message']['content'] ?? null;
        if (!is_string($text) || $text === '') {
            Http::error('Empty response from Groq', 502);
        }

        $pdo->prepare(
            "INSERT INTO activity_logs (device_id, occurred_at, type, source, message, user_id)
             VALUES (?, NOW(), 'system', 'web', ?, ?)"
        )->execute([$device['device_id'] ?? null, "{$u['name']} generated an AI summary", $u['id']]);

        Http::json(['ok' => true, 'model' => $model, 'summary' => $text]);
    }
}
