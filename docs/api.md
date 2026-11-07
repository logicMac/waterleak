# LeakGuard API

Base URL = `SERVER_BASE` in the firmware, e.g. `https://your-domain/api`.
Under WAMP locally: `http://localhost/waterleak/backend/public/api`.

All bodies are JSON. Errors return `{"ok":false,"error":"…"}` with a matching
HTTP status. Device requests carry `X-API-Key`; admin requests use a session
cookie + `X-CSRF-Token` on writes.

## Device endpoints (firmware contract — do not change)

Every device request needs the header `X-API-Key: <DEVICE_API_KEY>`.
Device timestamps are `YYYY-MM-DD HH:MM:SS` in Asia/Manila, no timezone.

### POST /report — every 5 s, not retried

```json
{"device_id":"leakguard-01","timestamp":"2026-03-10 14:22:05",
 "zone1":{"flow_lpm":1.20,"total_l":35.40,"tripped":false},
 "zone2":{"flow_lpm":0.00,"total_l":10.10,"tripped":false},
 "valve_open":true,"rssi":-58}
```

Updates the device live row and appends to `readings`. `total_l` is cumulative
since boot (resets on reboot) — dashboard "today" figures are computed
server-side. Response `200 {"ok":true}`.

### POST /alert — important, retried until 2xx

```json
{"device_id":"leakguard-01","timestamp":"2026-03-10 02:14:09","zone":1,
 "reason":"NIGHT FLOW","flow_lpm":2.35,"valve_open":false}
```

`reason` ∈ `NIGHT FLOW` | `LONG FLOW` | `BURST RATE`. Inserts an `active`
alert, marks the zone tripped, logs an activity entry and fires notifications.
Idempotent on `UNIQUE(device_id, occurred_at, zone, reason)` — retries return
`200 {"ok":true,"duplicate":true}` without duplicating.

### POST /event — important

```json
{"device_id":"leakguard-01","timestamp":"…","event":"reset","source":"button"}
```

`event` ∈ `reset` | `valve_closed` | `valve_opened`; `source` ∈ `button` |
`remote`. A `reset` resolves all active alerts (time + source stored) and
reopens the valve. Dedupe via the log's unique `dedupe_key`.

### POST /daily — important, once at midnight rollover

```json
{"device_id":"leakguard-01","timestamp":"2026-03-11 00:00:01",
 "zone1":{"daily_l":412.50,"peak_lpm":9.80},
 "zone2":{"daily_l":120.00,"peak_lpm":4.10},"trips":2}
```

Describes the **previous** day — stored at `report_date = DATE(timestamp) - 1`.
Upsert on `(device_id, report_date)`.

### GET /commands?device_id=leakguard-01 — polled every 1 s

- pending: `{"command":"reset"}` (or `"close_valve"` / `"open_valve"`)
- none: `{"command":null}`

The body contains at most one quoted command word — the firmware matches by
substring (`indexOf("\"reset\"")` etc.), so no descriptive text may contain
those strings. The oldest pending command is marked `delivered` in the same
transaction (exactly-once). Pending commands older than 30 s are `expired`.

### GET /config?device_id=… (future firmware)

Returns the thresholds saved in Settings:

```json
{"ok":true,"config":{"normal_max_lpm":12,"quiet_start":"22:00",
 "quiet_end":"05:00","max_continuous_min":30,"max_burst_lpm":15}}
```

The current firmware does not call this — see Settings → Detection.

## Admin endpoints (`/api/admin/*`)

Session cookie (`LGSESS`, HttpOnly, SameSite=Lax). Writes require
`X-CSRF-Token` (issued at login / `me`).

| Method | Route | Notes |
|---|---|---|
| POST | `/auth/login` | `{email,password}` → `{user,csrf_token}`; 5 fails/10 min → 429 |
| POST | `/auth/logout` | destroys session |
| GET | `/auth/me` | current user + csrf |
| GET | `/status` | device, online (>15 s silent = offline), rssi, valve, zones, active alerts, today's KPIs |
| GET | `/readings?range=15m|1h|24h|7d&zone=1|2|all` | downsampled server-side on 24h/7d |
| GET | `/alerts?status=&zone=&from=&to=&page=` | 20/page |
| GET | `/alerts/export.csv` | same filters |
| POST | `/alerts/{id}/acknowledge` | staff + admin |
| GET | `/logs?type=&from=&to=&q=&page=` | 25/page |
| GET | `/logs/export.csv` | same filters |
| GET | `/reports/daily?from=&to=` | daily reports |
| GET | `/reports/daily/export.csv` | |
| POST | `/control` `{command}` | admin only; `open_valve` rejected 409 while tripped |
| GET | `/commands/{id}` | delivery status for the control UI |
| GET / PUT | `/settings` | admin writes; whitelisted keys |
| GET / POST | `/users` · PUT/DELETE `/users/{id}` | admin only |
| GET / POST | `/recipients` · PUT/DELETE `/recipients/{id}` | notification recipients |

## curl examples

```bash
KEY=<DEVICE_API_KEY>
BASE=http://localhost/waterleak/backend/public/api   # or :8899 via php -S

# report
curl -X POST "$BASE/report" -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"device_id":"leakguard-01","timestamp":"2026-03-10 14:22:05","zone1":{"flow_lpm":1.20,"total_l":35.40,"tripped":false},"zone2":{"flow_lpm":0.00,"total_l":10.10,"tripped":false},"valve_open":true,"rssi":-58}'

# alert (send twice — second returns duplicate:true)
curl -X POST "$BASE/alert" -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"device_id":"leakguard-01","timestamp":"2026-03-10 02:14:09","zone":1,"reason":"NIGHT FLOW","flow_lpm":2.35,"valve_open":false}'

# event / daily / commands / config
curl -X POST "$BASE/event" -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"device_id":"leakguard-01","timestamp":"2026-03-10 08:00:00","event":"reset","source":"remote"}'
curl -X POST "$BASE/daily" -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"device_id":"leakguard-01","timestamp":"2026-03-11 00:00:01","zone1":{"daily_l":412.50,"peak_lpm":9.80},"zone2":{"daily_l":120.00,"peak_lpm":4.10},"trips":2}'
curl "$BASE/commands?device_id=leakguard-01" -H "X-API-Key: $KEY"
curl "$BASE/config?device_id=leakguard-01" -H "X-API-Key: $KEY"

# admin login + control
curl -c jar -X POST "$BASE/admin/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@leakguard.local","password":"admin123"}'
CSRF=<csrf_token from login>
curl -b jar -X POST "$BASE/admin/control" -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"command":"close_valve"}'
```

## Test checklist (acceptance)

| Test | How | Expected |
|---|---|---|
| Duplicate alert retry | POST `/alert` twice, same payload | Both 200; exactly 1 alert + 1 log row |
| Command exactly-once | POST `/admin/control`, poll `/commands` twice | First poll `{"command":"…"}`, second `{"command":null}` |
| Offline detection | Stop reports > 15 s | `/status.online=false`; dashboard greys live numbers |
| Expired commands | Issue command with device stopped, wait 30 s | `status='expired'`; device never receives it |
| open_valve while tripped | Trip a zone, POST `{"command":"open_valve"}` | 409 with "use Reset" message |
| Bad API key | Any device call without/with wrong key | 401 |
| Zone out of range | `"zone":3` in `/alert` | 400 |
