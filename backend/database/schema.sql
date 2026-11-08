-- LeakGuard schema — MySQL 8+ / MariaDB 10.3+, utf8mb4, InnoDB.
-- Import order: schema.sql, then seed_demo.sql.

CREATE DATABASE IF NOT EXISTS leakguard
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE leakguard;

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ── Device live state (one row per device, updated by /report) ───────────────
CREATE TABLE devices (
  device_id        VARCHAR(64)  NOT NULL,
  name             VARCHAR(120) NOT NULL DEFAULT '',
  location         VARCHAR(190) NULL,
  last_seen        DATETIME     NULL,
  rssi             SMALLINT     NULL,
  z1_flow          DECIMAL(7,2) NOT NULL DEFAULT 0,
  z1_total         DECIMAL(12,2) NOT NULL DEFAULT 0,
  z1_tripped       TINYINT(1)   NOT NULL DEFAULT 0,
  z1_reason        VARCHAR(32)  NULL,
  z2_flow          DECIMAL(7,2) NOT NULL DEFAULT 0,
  z2_total         DECIMAL(12,2) NOT NULL DEFAULT 0,
  z2_tripped       TINYINT(1)   NOT NULL DEFAULT 0,
  z2_reason        VARCHAR(32)  NULL,
  firmware_version VARCHAR(40)  NULL,
  PRIMARY KEY (device_id)
) ENGINE=InnoDB;

-- ── Raw readings (every /report; thinned by cron after 30 days) ──────────────
CREATE TABLE readings (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id   VARCHAR(64)  NOT NULL,
  recorded_at DATETIME     NOT NULL,           -- device RTC time, Asia/Manila
  z1_flow     DECIMAL(7,2) NOT NULL DEFAULT 0,
  z1_total    DECIMAL(12,2) NOT NULL DEFAULT 0,
  z1_tripped  TINYINT(1)   NOT NULL DEFAULT 0,
  z2_flow     DECIMAL(7,2) NOT NULL DEFAULT 0,
  z2_total    DECIMAL(12,2) NOT NULL DEFAULT 0,
  z2_tripped  TINYINT(1)   NOT NULL DEFAULT 0,
  rssi        SMALLINT     NULL,
  received_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_readings_dev_ts (device_id, recorded_at),
  CONSTRAINT fk_readings_dev FOREIGN KEY (device_id)
    REFERENCES devices (device_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Alerts (one per device trip; UNIQUE key = retry dedupe) ──────────────────
CREATE TABLE alerts (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id        VARCHAR(64) NOT NULL,
  zone             TINYINT UNSIGNED NOT NULL,
  reason           ENUM('NIGHT FLOW','LONG FLOW','BURST RATE') NOT NULL,
  flow_lpm         DECIMAL(7,2) NOT NULL DEFAULT 0,
  occurred_at      DATETIME NOT NULL,
  status           ENUM('active','acknowledged','resolved') NOT NULL DEFAULT 'active',
  acknowledged_by  INT UNSIGNED NULL,
  resolved_at      DATETIME NULL,
  resolved_source  VARCHAR(16) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alert_dedupe (device_id, occurred_at, zone, reason),
  KEY ix_alerts_status (status, occurred_at),
  CONSTRAINT fk_alerts_dev FOREIGN KEY (device_id)
    REFERENCES devices (device_id) ON DELETE CASCADE,
  CONSTRAINT fk_alerts_user FOREIGN KEY (acknowledged_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Activity log (device events dedupe on dedupe_key; NULLs stay distinct) ──
CREATE TABLE activity_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id   VARCHAR(64) NULL,
  occurred_at DATETIME NOT NULL,
  type        ENUM('alert','reset','valve_closed','valve_opened','command','system','login') NOT NULL,
  source      VARCHAR(16) NULL,                -- device | button | remote | web | cron
  message     VARCHAR(255) NOT NULL,
  user_id     INT UNSIGNED NULL,
  dedupe_key  VARCHAR(190) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_log_dedupe (dedupe_key),
  KEY ix_logs_ts (occurred_at),
  KEY ix_logs_type (type, occurred_at),
  CONSTRAINT fk_logs_dev FOREIGN KEY (device_id)
    REFERENCES devices (device_id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Daily summaries posted by the device at midnight rollover ───────────────
CREATE TABLE daily_reports (
  device_id    VARCHAR(64) NOT NULL,
  report_date  DATE NOT NULL,
  z1_daily_l   DECIMAL(10,2) NOT NULL DEFAULT 0,
  z1_peak_lpm  DECIMAL(7,2)  NOT NULL DEFAULT 0,
  z2_daily_l   DECIMAL(10,2) NOT NULL DEFAULT 0,
  z2_peak_lpm  DECIMAL(7,2)  NOT NULL DEFAULT 0,
  trips        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, report_date),
  CONSTRAINT fk_daily_dev FOREIGN KEY (device_id)
    REFERENCES devices (device_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Remote commands (exactly-once delivery to the device) ────────────────────
CREATE TABLE commands (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id    VARCHAR(64) NOT NULL,
  command      ENUM('reset') NOT NULL,
  status       ENUM('pending','delivered','expired') NOT NULL DEFAULT 'pending',
  issued_by    INT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_commands_poll (device_id, status, created_at),
  CONSTRAINT fk_commands_user FOREIGN KEY (issued_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Key-value settings (thresholds, notification toggles) ───────────────────
CREATE TABLE settings (
  `key`   VARCHAR(64) NOT NULL,
  `value` TEXT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB;

-- ── Notification recipients (email live; SMS planned via SIM900A) ───────────
CREATE TABLE notification_recipients (
  id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name   VARCHAR(120) NOT NULL,
  phone  VARCHAR(32)  NULL,
  email  VARCHAR(190) NULL,
  active TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ── Login throttle ──────────────────────────────────────────────────────────
CREATE TABLE login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email        VARCHAR(190) NOT NULL,
  ip           VARCHAR(45)  NOT NULL,
  attempted_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_attempts (email, attempted_at)
) ENGINE=InnoDB;
