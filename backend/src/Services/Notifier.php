<?php
declare(strict_types=1);

/**
 * Fan-out for a *new* alert only (duplicates never reach here).
 * Every channel failure is non-fatal — /alert still returns 2xx.
 */
final class Notifier
{
    public static function alert(array $alert, array $device): void
    {
        $zone   = (int) $alert['zone'];
        $reason = $alert['reason'];
        $flow   = number_format((float) $alert['flow_lpm'], 2);
        $dev    = $device['name'] ?? $alert['device_id'];
        $when   = $alert['occurred_at'];

        $subject = "[LeakGuard] Zone $zone alert: $reason";
        $body = "LeakGuard detected a leak condition.\n\n"
              . "Device:  $dev ({$alert['device_id']})\n"
              . "Zone:    $zone\n"
              . "Reason:  $reason\n"
              . "Flow:    $flow L/min\n"
              . "Time:    $when (Asia/Manila)\n"
              . "Alarm:   buzzer + LED active on the device\n\n"
              . "Open the LeakGuard dashboard to acknowledge or reset the system.";

        try {
            $rows = DB::pdo()->query(
                'SELECT name, phone, email FROM notification_recipients WHERE active = 1'
            )->fetchAll();
        } catch (Throwable) {
            $rows = [];
        }

        $sms = Sms::gateway();
        foreach ($rows as $r) {
            if (!empty($r['email'])) {
                SmtpMailer::send($r['email'], $subject, $body);
            }
            if (!empty($r['phone'])) {
                $sms->send($r['phone'], "LeakGuard: Zone $zone $reason at $flow L/min. Alarm on device. $when");
            }
        }
    }
}
