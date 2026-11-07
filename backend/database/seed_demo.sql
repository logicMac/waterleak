-- LeakGuard demo seed — a working account, one device, ~7 days of realistic
-- readings (1/min), daily reports, alerts and activity so the dashboard is
-- populated for the thesis defense.
-- Requires MySQL 8+ / MariaDB 10.2+ (window functions for cumulative totals).
-- Demo login: admin@leakguard.local / admin123  — change it after first login.

USE leakguard;

-- ── Users ────────────────────────────────────────────────────────────────────
INSERT INTO users (name, email, password_hash, role, is_active) VALUES
  ('Admin',        'admin@leakguard.local', '$2y$10$ff3drouH3TSUZnzXt3vaZucRI5IpSsvVHvMg09kVgt3n0nKdu/S1i', 'admin', 1),
  ('Valerie Rafales', 'staff@leakguard.local', '$2y$10$ff3drouH3TSUZnzXt3vaZucRI5IpSsvVHvMg09kVgt3n0nKdu/S1i', 'staff', 1)
ON DUPLICATE KEY UPDATE email = email;

-- ── Device ───────────────────────────────────────────────────────────────────
INSERT INTO devices (device_id, name, location, firmware_version) VALUES
  ('leakguard-01', 'LeakGuard Main Unit', 'Schola de San Jose, Polomolok', '1.0.0')
ON DUPLICATE KEY UPDATE name = VALUES(name), location = VALUES(location);

-- ── Settings (thresholds mirror leak_logic.h ZoneConfig; used by /config) ────
INSERT INTO settings (`key`, `value`) VALUES
  ('threshold.normal_max_lpm',     '12'),
  ('threshold.quiet_start',        '22:00'),
  ('threshold.quiet_end',          '05:00'),
  ('threshold.max_continuous_min', '30'),
  ('threshold.max_burst_lpm',      '15'),
  ('notify.email_enabled',         '1'),
  ('notify.sms_enabled',           '0'),
  ('notify.on_night_flow',         '1'),
  ('notify.on_long_flow',          '1'),
  ('notify.on_burst_rate',         '1'),
  ('ai.enabled',                   '0'),
  ('ai.model',                     'llama-3.3-70b-versatile'),
  ('device.name',                  'LeakGuard Main Unit'),
  ('device.location',              'Schola de San Jose, Polomolok')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- ── Notification recipients ──────────────────────────────────────────────────
INSERT INTO notification_recipients (name, phone, email, active) VALUES
  ('School Admin',  NULL,          'admin@scholadesanjose.edu.ph', 1),
  ('Maintenance',   '09171234567', NULL,                           0);

-- ── Readings: one row per minute for the last 7 days ─────────────────────────
-- Zone 1 = main supply line, Zone 2 = secondary line. Demand peaks in the
-- morning (06-08) and evening (17-20); near-silent overnight.
INSERT INTO readings
  (device_id, recorded_at, z1_flow, z1_total, z1_tripped,
   z2_flow, z2_total, z2_tripped, valve_open, rssi, received_at)
SELECT device_id, t,
       z1_flow, ROUND(z1_run, 2), 0,
       z2_flow, ROUND(z2_run, 2), 0, 1, rssi, t
FROM (
  SELECT t, f1 AS z1_flow, f2 AS z2_flow, rssi, 'leakguard-01' AS device_id,
         SUM(f1) OVER (ORDER BY t ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) / 60 AS z1_run,
         SUM(f2) OVER (ORDER BY t ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) / 60 AS z2_run
  FROM (
    SELECT
      DATE_FORMAT(DATE_SUB(NOW(), INTERVAL seq.n MINUTE), '%Y-%m-%d %H:%i:00') AS t,
      ROUND(LEAST(18, GREATEST(0, CASE
        WHEN HOUR(DATE_SUB(NOW(), INTERVAL seq.n MINUTE)) BETWEEN 6 AND 8
          THEN IF(RAND() < 0.50, 2.5 + RAND() * 4.5, 0)
        WHEN HOUR(DATE_SUB(NOW(), INTERVAL seq.n MINUTE)) BETWEEN 17 AND 20
          THEN IF(RAND() < 0.45, 2.0 + RAND() * 5.0, 0)
        WHEN HOUR(DATE_SUB(NOW(), INTERVAL seq.n MINUTE)) >= 22
          OR HOUR(DATE_SUB(NOW(), INTERVAL seq.n MINUTE)) <= 4
          THEN IF(RAND() < 0.03, 0.5 + RAND() * 1.5, 0)
        ELSE IF(RAND() < 0.18, 0.5 + RAND() * 2.5, 0)
      END)), 2) AS f1,
      ROUND(LEAST(14, GREATEST(0, CASE
        WHEN HOUR(DATE_SUB(NOW(), INTERVAL seq.n MINUTE)) BETWEEN 6 AND 8
          THEN IF(RAND() < 0.30, 1.0 + RAND() * 2.5, 0)
        WHEN HOUR(DATE_SUB(NOW(), INTERVAL seq.n MINUTE)) BETWEEN 17 AND 20
          THEN IF(RAND() < 0.28, 1.0 + RAND() * 2.5, 0)
        ELSE IF(RAND() < 0.08, 0.3 + RAND() * 1.2, 0)
      END)), 2) AS f2,
      -55 - FLOOR(RAND() * 20) AS rssi
    FROM (
      SELECT (u.n + t.n * 10 + h.n * 100 + th.n * 1000) AS n
      FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
            UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) u,
           (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
            UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t,
           (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
            UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) h,
           (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
            UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
            UNION ALL SELECT 10) th
    ) seq
    WHERE seq.n < 10080  -- 7 days × 1440 min
  ) raw
) agg
ORDER BY t;

-- ── Daily reports for the last 7 days ───────────────────────────────────────
INSERT INTO daily_reports
  (device_id, report_date, z1_daily_l, z1_peak_lpm, z2_daily_l, z2_peak_lpm, trips)
SELECT 'leakguard-01', DATE_SUB(CURDATE(), INTERVAL seq.d DAY),
       ROUND(280 + RAND() * 180, 2), ROUND(6 + RAND() * 4, 2),
       ROUND(70 + RAND() * 90, 2),  ROUND(2 + RAND() * 3, 2),
       seq.d % 3 = 0
FROM (SELECT 1 d UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
      UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) seq
ON DUPLICATE KEY UPDATE z1_daily_l = VALUES(z1_daily_l);

-- ── Sample alerts (all cleared) ──────────────────────────────────────────────
INSERT IGNORE INTO alerts (device_id, zone, reason, flow_lpm, occurred_at, status, acknowledged_by, resolved_at, resolved_source)
SELECT 'leakguard-01', 1, 'NIGHT FLOW', 2.35,
       DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 2 DAY), '%Y-%m-%d 02:14:09'),
       'resolved', 1, DATE_SUB(NOW(), INTERVAL 2 DAY), 'button'
UNION ALL
SELECT 'leakguard-01', 2, 'LONG FLOW', 3.10,
       DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 4 DAY), '%Y-%m-%d 11:42:00'),
       'acknowledged', 2, NULL, NULL
UNION ALL
SELECT 'leakguard-01', 1, 'BURST RATE', 16.40,
       DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 DAY), '%Y-%m-%d 15:03:22'),
       'resolved', 1, DATE_SUB(NOW(), INTERVAL 6 DAY), 'remote';

-- ── Matching activity log entries ───────────────────────────────────────────
INSERT IGNORE INTO activity_logs (device_id, occurred_at, type, source, message, dedupe_key)
SELECT 'leakguard-01', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 2 DAY), '%Y-%m-%d 02:14:09'),
       'alert', 'device', 'Zone 1 NIGHT FLOW at 2.35 L/min — valve closed',
       CONCAT('alert|leakguard-01|', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 2 DAY), '%Y-%m-%d 02:14:09'), '|1|NIGHT FLOW')
UNION ALL
SELECT 'leakguard-01', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 2 DAY), '%Y-%m-%d 02:30:00'),
       'reset', 'button', 'System reset (button) — alerts resolved, valve reopened',
       CONCAT('event|leakguard-01|', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 2 DAY), '%Y-%m-%d 02:30:00'), '|reset|button')
UNION ALL
SELECT 'leakguard-01', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 4 DAY), '%Y-%m-%d 11:42:00'),
       'alert', 'device', 'Zone 2 LONG FLOW at 3.10 L/min — valve closed',
       CONCAT('alert|leakguard-01|', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 4 DAY), '%Y-%m-%d 11:42:00'), '|2|LONG FLOW')
UNION ALL
SELECT 'leakguard-01', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 DAY), '%Y-%m-%d 15:03:22'),
       'alert', 'device', 'Zone 1 BURST RATE at 16.40 L/min — valve closed',
       CONCAT('alert|leakguard-01|', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 DAY), '%Y-%m-%d 15:03:22'), '|1|BURST RATE')
UNION ALL
SELECT 'leakguard-01', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 DAY), '%Y-%m-%d 15:20:00'),
       'reset', 'remote', 'System reset (remote) — alerts resolved, valve reopened',
       CONCAT('event|leakguard-01|', DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 DAY), '%Y-%m-%d 15:20:00'), '|reset|remote');
