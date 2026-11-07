# LeakGuard Web Dashboard

Real-time monitoring and remote control for the LeakGuard ESP32 water-leak
detection device — undergraduate thesis project, BS Information Technology,
Notre Dame-Siena College of Polomolok (researchers: Louise Nathaniel V.
Pajarillo, Valerie C. Rafales).

**Stack:** React (Vite) + Tailwind + Recharts · plain PHP 8 + PDO REST API ·
MySQL/MariaDB · Poppins UI font.

```
waterleak/
  backend/    PHP API (public/ is the docroot), schema + demo seed, cron
  frontend/   React + Tailwind app
  simulator/  PHP device simulator (demo without hardware)
  docs/api.md Full API contract + curl examples + test checklist
```

## Local setup (WAMP/XAMPP)

1. **Database**

   ```bash
   mysql -u root < backend/database/schema.sql
   mysql -u root < backend/database/seed_demo.sql
   ```

   Requires MySQL 8+ / MariaDB 10.2+ (the seed uses window functions).

2. **Backend config** — copy `backend/config/.env.example` → `backend/config/.env`
   and set `DEVICE_API_KEY` (a long random string — you'll paste the same value
   into the firmware) and DB credentials.

3. **Serve the API** — Apache already exposes it at
   `http://localhost/waterleak/backend/public/api` (mod_rewrite routes
   `/api/*` to `index.php`; ensure `AllowOverride All` for the directory).
   No Apache? Use PHP's built-in server:

   ```bash
   php -S 127.0.0.1:8899 -t backend/public backend/public/index.php
   # API base becomes http://127.0.0.1:8899/api
   ```

4. **Frontend**

   ```bash
   cd frontend
   npm install
   npm run dev          # http://localhost:5173
   ```

   The dev server proxies `/api` → `http://localhost/waterleak/backend/public`.
   Point it elsewhere with `VITE_API_PROXY=http://127.0.0.1:8899 npm run dev`.

5. **Sign in** — demo account `admin@leakguard.local` / `admin123`
   (staff: `staff@leakguard.local` / `admin123`). Change these after first login.

## Demo without hardware

```bash
php simulator/simulate.php --base=http://localhost/waterleak/backend/public/api --key=<DEVICE_API_KEY>
php simulator/simulate.php --leak=night    # trip zone 1 with a NIGHT FLOW alert
php simulator/simulate.php --leak=burst    # BURST RATE spike
php simulator/simulate.php --leak=long     # LONG FLOW sustained flow
php simulator/simulate.php --daily         # also post one daily summary
```

The simulator behaves like the firmware: reports every 5 s, polls commands
every 1 s, reacts to Close/Open/Reset and posts the matching events.

## Pointing the firmware at this backend

In the `.ino`:

```cpp
const char *SERVER_BASE = "https://your-domain/api";   // no trailing slash
const char *API_KEY     = "<same as DEVICE_API_KEY in .env>";
const char *DEVICE_ID   = "leakguard-01";
```

The firmware uses `setInsecure()` while developing; for production, pin your
server's root CA via `sec.setCACert(ROOT_CA)` (see the comment in `doRequest`).

## Production deployment

1. Import `schema.sql` (and optionally `seed_demo.sql`) on the MySQL server.
2. Upload `backend/`; set the docroot to `backend/public/` and fill `.env`
   (`APP_ENV=production`, real DB creds, strong `DEVICE_API_KEY`, `APP_ORIGIN`
   = your site origin, SMTP settings for email alerts).
3. `cd frontend && npm run build`, then copy `frontend/dist/*` into
   `backend/public/` — the `.htaccess` routes `/api/*` to PHP and serves the
   built SPA (with client-side route fallback) from the same origin.
4. Force HTTPS at the virtual host; HSTS recommended.
5. Schedule `php backend/cron/cleanup.php` nightly (Task Scheduler on Windows,
   cron on Linux) to trim readings older than `READING_RETENTION_DAYS` (30).

## Notes

- **Commands are exactly-once:** `/commands` marks the oldest pending command
  `delivered` inside the same transaction it is read; pending commands expire
  after 30 s so a stale `close_valve` never executes after an outage.
- **Idempotent alerts/events:** retry-safe via `UNIQUE(device_id, occurred_at,
  zone, reason)` and the log `dedupe_key`.
- **Thresholds:** saved in Settings and served at `GET /api/config`, but the
  current firmware hard-codes them (`ZoneConfig` in `leak_logic.h`) — they take
  effect once firmware config sync is enabled.
- **Roles:** staff views + acknowledges; admin controls the valve, edits
  settings, manages users.
