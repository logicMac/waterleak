<?php
declare(strict_types=1);

/*
 * LeakGuard device simulator — exercises the real device API so the dashboard
 * can be demoed without hardware.
 *
 *   php simulate.php                     normal operation
 *   php simulate.php --leak=night        flow during quiet hours -> NIGHT FLOW
 *   php simulate.php --leak=burst        huge spike              -> BURST RATE
 *   php simulate.php --leak=long         sustained trickle       -> LONG FLOW
 *   php simulate.php --daily             post one /daily summary at start
 *   php simulate.php --base=http://localhost/waterleak/backend/public/api
 *   php simulate.php --key=<api key> --device=leakguard-01
 *
 * It behaves like the firmware (water_leak.ino): /report every 5 s, /commands
 * poll every 1 s, reacts to a "reset" command and posts the matching /event.
 */

if (PHP_SAPI !== 'cli') exit('CLI only');

// Device RTC holds Asia/Manila wall time — the simulator must too.
date_default_timezone_set('Asia/Manila');

$opt = getopt('', ['base::', 'key::', 'device::', 'leak::', 'daily']);
$BASE   = rtrim($opt['base']   ?? 'http://localhost:8899/api', '/');
$KEY    = $opt['key']    ?? 'a94c738c2f6b944537088cf4326a1e29ac650d89be167285';
$DEV    = $opt['device'] ?? 'leakguard-01';
$LEAK   = $opt['leak']   ?? null;        // null | night | burst | long

// ── device state ──
$state = [
    'trip1'  => false, 'trip2' => false,
    'f1'     => 0.0, 'f2' => 0.0,
    't1'     => 35.0, 't2' => 10.0,      // totals since boot
    'rssi'   => -58,
    'leakT'  => null,                     // when the leak scenario started
    'alertSent' => false,
];

function ts(): string { return date('Y-m-d H:i:s'); }

function request(string $method, string $path, ?array $body = null): array
{
    global $BASE, $KEY;
    $ch = curl_init($BASE . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', "X-API-Key: $KEY"],
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_POSTFIELDS     => $body !== null ? json_encode($body) : null,
    ]);
    $raw  = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$code, $raw === false ? '' : $raw];
}

function post(string $path, array $body): int
{
    [$code] = request('POST', $path, $body);
    return $code;
}

function sendAlert(int $zone, string $reason, float $flow): void
{
    post('/alert', [
        'device_id' => $GLOBALS['DEV'], 'timestamp' => ts(), 'zone' => $zone,
        'reason' => $reason, 'flow_lpm' => round($flow, 2),
    ]);
    echo '[' . ts() . "] !! ALERT zone $zone: $reason @ {$flow} L/min\n";
}

function sendEvent(string $event): void
{
    post('/event', [
        'device_id' => $GLOBALS['DEV'], 'timestamp' => ts(),
        'event' => $event, 'source' => 'remote',
    ]);
    echo '[' . ts() . "] >> event: $event\n";
}

// optional one-shot daily summary
if (isset($opt['daily'])) {
    post('/daily', [
        'device_id' => $DEV, 'timestamp' => ts(),
        'zone1' => ['daily_l' => 412.50, 'peak_lpm' => 9.80],
        'zone2' => ['daily_l' => 120.00, 'peak_lpm' => 4.10],
        'trips' => 1,
    ]);
    echo '[' . ts() . "] >> daily summary posted\n";
}

echo "LeakGuard simulator — $BASE device=$DEV leak=" . ($LEAK ?? 'none') . "\n";

$lastPoll = 0; $lastReport = 0;
while (true) {
    $now = microtime(true);
    $h = (int) date('G');

    // ── flow model (no valve — a tripped leak keeps flowing until reset) ──
    if ($LEAK === 'night' && $state['leakT']) {
        $state['f1'] = 2.0 + sin($now / 7) * 0.4;
        $state['f2'] = 0.0;
    } elseif ($LEAK === 'burst' && $state['leakT']) {
        $state['f1'] = 16.0 + sin($now / 3) * 1.5;
        $state['f2'] = 0.4;
    } elseif ($LEAK === 'long' && $state['leakT']) {
        $state['f1'] = 1.1;
        $state['f2'] = 0.0;
    } else {
        // normal demand: brief usage bursts, mostly zero
        $state['f1'] = (rand(0, 100) < 8) ? 1.5 + rand(0, 400) / 100 : 0.0;
        $state['f2'] = (rand(0, 100) < 4) ? 0.5 + rand(0, 200) / 100 : 0.0;
    }
    $state['t1'] += $state['f1'] / 60;
    $state['t2'] += $state['f2'] / 60;
    $state['rssi'] = -55 - rand(0, 12);

    // ── leak scenario: trip once, then stay tripped until reset ──
    if ($LEAK && $state['leakT'] === null) $state['leakT'] = $now;
    if ($LEAK && !$state['alertSent'] && $now - $state['leakT'] > ($LEAK === 'burst' ? 4 : 8)) {
        $reason = ['night' => 'NIGHT FLOW', 'burst' => 'BURST RATE', 'long' => 'LONG FLOW'][$LEAK];
        $zone = $LEAK === 'long' ? 1 : ($LEAK === 'burst' ? 1 : 1);
        sendAlert($zone, $reason, $state['f1']);
        $state['trip' . $zone] = true; // trip latches; LED + buzzer stay on
        $state['alertSent'] = true;
    }

    // ── /report every 5 s ──
    if ($now - $lastReport >= 5) {
        $lastReport = $now;
        $code = post('/report', [
            'device_id' => $DEV, 'timestamp' => ts(),
            'zone1' => ['flow_lpm' => round($state['f1'], 2), 'total_l' => round($state['t1'], 2), 'tripped' => $state['trip1']],
            'zone2' => ['flow_lpm' => round($state['f2'], 2), 'total_l' => round($state['t2'], 2), 'tripped' => $state['trip2']],
            'rssi' => $state['rssi'],
        ]);
        printf(
            '[%s] report %d z1=%.2fL/m%s z2=%.2fL/m%s rssi=%d',
            ts(), $code, $state['f1'], $state['trip1'] ? ' TRIPPED' : '',
            $state['f2'], $state['trip2'] ? ' TRIPPED' : '',
            $state['rssi']
        );
        echo PHP_EOL;
    }

    // ── /commands every 1 s ──
    if ($now - $lastPoll >= 1) {
        $lastPoll = $now;
        [$code, $body] = request('GET', '/commands?device_id=' . urlencode($DEV));
        if ($code >= 200 && $code < 300) {
            // Same substring match the firmware uses: only "reset" is acted on.
            if (str_contains($body, '"reset"')) {
                $state['trip1'] = $state['trip2'] = false;
                $state['alertSent'] = $state['leakT'] === null ? $state['alertSent'] : true;
                if ($LEAK) { $state['leakT'] = null; $state['alertSent'] = false; $LEAK = null; }
                sendEvent('reset');
            }
        }
    }

    usleep(200000); // 200 ms tick
}
