# LeakGuard — product context

- **What:** Web dashboard for an ESP32-based water-leak detection and alert device (undergraduate thesis project).
- **Thesis:** "Embedded IoT Device for Water Leak Detection and Alert System for Schola de San Jose of Polomolok" — BS Information Technology, Notre Dame-Siena College of Polomolok. Researchers: Louise Nathaniel V. Pajarillo, Valerie C. Rafales.
- **Users:** school staff (view + acknowledge alerts) and admins (reset device, settings, users). Used on phones and desktops, on campus.
- **Jobs:** see live flow for 2 zones, get alerted on leaks (NIGHT FLOW / LONG FLOW / BURST RATE), remotely reset the device, review daily reports and activity logs.
- **Device contract:** ESP32 posts JSON over HTTP every 5s (`/report`), polls `/commands` every 1s, retries important messages (`/alert`, `/event`, `/daily`) every 3s until 2xx. Auth via `X-API-Key`. Timestamps are Asia/Manila wall time, no timezone.
- **Stack:** React (Vite) + Tailwind + Recharts + lucide-react; plain PHP 8 PDO REST API on Apache (WAMP/XAMPP); MySQL/MariaDB.
- **Platform:** web, responsive 320px+, light/dark.
