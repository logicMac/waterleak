// Water leak guard - ESP32-S3, 2 zones
// Libraries: Adafruit SSD1306 (+GFX), Rtc by Makuna
// Keep this file and leak_logic.h in a folder named "water_leak".

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <RtcDS1307.h>
#include "leak_logic.h"

// ---------- Pins ----------
#define PIN_I2C_SDA    8      // OLED + RTC
#define PIN_I2C_SCL    9      // OLED + RTC
#define PIN_FLOW1      11
#define PIN_FLOW2      10
#define PIN_BUTTON     1
#define PIN_LED        4
#define PIN_BUZZER     21

// ---------- Settings ----------
const char *WIFI_SSID = "Ramirez";
const char *WIFI_PASS = "AEFD39C3";

const float    PULSES_PER_SEC_PER_LPM = 7.5f;
const uint32_t RESET_HOLD_MS          = 2000;
const uint32_t SCREEN_TIMEOUT_MS      = 7000;
const uint32_t DEBOUNCE_MS            = 30;
const uint32_t WIFI_RETRY_MS          = 15000;

// =====================================================================
//  WEBSITE CONNECTION - FILL IN THESE TWO LINES
//  SERVER_BASE: your API URL, no trailing slash.
//    The sketch calls: POST /report, /alert, /daily, /event
//                      GET  /commands?device_id=...
//  API_KEY: must match the key your server checks (X-API-Key header).
// =====================================================================
const char *SERVER_BASE = "http://192.168.100.111/waterleak/backend/public/api/leak";
const char *API_KEY     = "0490ca8b2cb9b1fdf0df635494d817eaea6e98f1eb6615ee";

const char *DEVICE_ID = "leakguard-01";

const uint32_t REPORT_INTERVAL_S = 5;
const uint32_t COMMAND_POLL_MS   = 1000;
const bool     USE_INSECURE_TLS  = true;    // true = skip certificate check (testing only)

ZoneConfig zoneCfg;
ZoneMonitor zone1(zoneCfg), zone2(zoneCfg);

Adafruit_SSD1306 oled(128, 64, &Wire, -1);
RtcDS1307<TwoWire> rtc(Wire);

// ---------- Flow ----------
volatile uint32_t pulses1 = 0, pulses2 = 0;
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
void IRAM_ATTR isr1() { portENTER_CRITICAL_ISR(&mux); pulses1++; portEXIT_CRITICAL_ISR(&mux); }
void IRAM_ATTR isr2() { portENTER_CRITICAL_ISR(&mux); pulses2++; portEXIT_CRITICAL_ISR(&mux); }

float flow1 = 0, flow2 = 0;
float total1 = 0, total2 = 0;
uint32_t lastTick = 0;

// ---------- Daily report ----------
float    daily1 = 0, daily2 = 0;
float    peak1 = 0, peak2 = 0;
uint16_t tripsToday = 0;
uint8_t  lastDay = 0;

// ---------- Screens ----------
enum Screen { SCR_MAIN, SCR_REPORT, SCR_WIFI, SCR_ALARM_Z1, SCR_ALARM_Z2 };
Screen      screen = SCR_MAIN;
uint32_t    screenSince = 0;
bool        needRedraw = true;
RtcDateTime lastNow;

// ---------- Buttons ----------
bool     btnRaw = false, btnStable = false, btnConsumed = false;
uint32_t btnChangedAt = 0, btnDownAt = 0, holdStartAt = 0;

// ---------- Network ----------
struct NetMsg {
  char path[16];
  char body[400];
  bool important;     // retried until the server accepts it
};
QueueHandle_t netQueue = nullptr;
volatile bool serverOk = false;
volatile bool cmdReset = false;

bool anyTripped() { return zone1.isTripped() || zone2.isTripped(); }

// int on purpose: Arduino auto-prototypes are placed before "enum Screen"
void gotoScreen(int s) {
  screen = (Screen)s;
  screenSince = millis();
  needRedraw = true;
}

const char *reasonText(TripReason r) {
  switch (r) {
    case TRIP_QUIET_HOURS: return "NIGHT FLOW";
    case TRIP_CONTINUOUS:  return "LONG FLOW";
    case TRIP_OVER_RATE:   return "BURST RATE";
    default:               return "OK";
  }
}

// ---------- WiFi diagnostics ----------
void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("WiFi: associated with AP"); break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.printf("WiFi: got IP %s\n", WiFi.localIP().toString().c_str()); break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.printf("WiFi: disconnected, reason=%d\n", info.wifi_sta_disconnected.reason); break;
    default: break;
  }
}

// ---------- Website ----------
void fmtTime(const RtcDateTime &t, char *out, size_t n) {
  snprintf(out, n, "%04u-%02u-%02u %02u:%02u:%02u",
           (unsigned)t.Year(), (unsigned)t.Month(), (unsigned)t.Day(),
           (unsigned)t.Hour(), (unsigned)t.Minute(), (unsigned)t.Second());
}

// Never blocks; drops the oldest message if the queue is full.
void queueSend(const char *path, const char *body, bool important) {
  if (!netQueue) return;
  NetMsg m;
  strlcpy(m.path, path, sizeof(m.path));
  strlcpy(m.body, body, sizeof(m.body));
  m.important = important;
  if (xQueueSend(netQueue, &m, 0) != pdTRUE) {
    NetMsg old;
    xQueueReceive(netQueue, &old, 0);
    xQueueSend(netQueue, &m, 0);
  }
}

void sendReading() {
  char ts[24], body[400];
  fmtTime(lastNow, ts, sizeof(ts));
  snprintf(body, sizeof(body),
    "{\"device_id\":\"%s\",\"timestamp\":\"%s\","
    "\"zone1\":{\"flow_lpm\":%.2f,\"total_l\":%.2f,\"tripped\":%s},"
    "\"zone2\":{\"flow_lpm\":%.2f,\"total_l\":%.2f,\"tripped\":%s},"
    "\"rssi\":%d}",
    DEVICE_ID, ts,
    flow1, total1, zone1.isTripped() ? "true" : "false",
    flow2, total2, zone2.isTripped() ? "true" : "false",
    WiFi.status() == WL_CONNECTED ? (int)WiFi.RSSI() : 0);
  queueSend("/report", body, false);
}

void sendAlert(int zone, TripReason r) {
  char ts[24], body[300];
  fmtTime(lastNow, ts, sizeof(ts));
  snprintf(body, sizeof(body),
    "{\"device_id\":\"%s\",\"timestamp\":\"%s\",\"zone\":%d,"
    "\"reason\":\"%s\",\"flow_lpm\":%.2f}",
    DEVICE_ID, ts, zone, reasonText(r), zone == 1 ? flow1 : flow2);
  queueSend("/alert", body, true);
}

// Totals of the day that just ended.
void sendDaily() {
  char ts[24], body[300];
  fmtTime(lastNow, ts, sizeof(ts));
  snprintf(body, sizeof(body),
    "{\"device_id\":\"%s\",\"timestamp\":\"%s\","
    "\"zone1\":{\"daily_l\":%.2f,\"peak_lpm\":%.2f},"
    "\"zone2\":{\"daily_l\":%.2f,\"peak_lpm\":%.2f},"
    "\"trips\":%u}",
    DEVICE_ID, ts, daily1, peak1, daily2, peak2, (unsigned)tripsToday);
  queueSend("/daily", body, true);
}

void sendEvent(const char *event, const char *source) {
  char ts[24], body[240];
  fmtTime(lastNow, ts, sizeof(ts));
  snprintf(body, sizeof(body),
    "{\"device_id\":\"%s\",\"timestamp\":\"%s\",\"event\":\"%s\",\"source\":\"%s\"}",
    DEVICE_ID, ts, event, source);
  queueSend("/event", body, true);
}

// Returns the HTTP status code (<=0 on failure).
int doRequest(bool post, const char *url, const char *body, String *out) {
  bool https = (strncmp(url, "https", 5) == 0);
  WiFiClientSecure sec;
  WiFiClient plain;
  if (https && USE_INSECURE_TLS) sec.setInsecure();
  // production: sec.setCACert(ROOT_CA);

  HTTPClient http;
  bool began = https ? http.begin(sec, url) : http.begin(plain, url);
  if (!began) return -1;
  http.setConnectTimeout(4000);
  http.setTimeout(4000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  int code = post ? http.POST((uint8_t *)body, strlen(body)) : http.GET();
  if (code > 0 && out) *out = http.getString();
  http.end();
  return code;
}

// Core 0: sends queued messages, polls for the "reset" command.
void netTask(void *) {
  uint32_t lastPoll = 0;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      serverOk = false;
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    NetMsg m;
    if (xQueueReceive(netQueue, &m, pdMS_TO_TICKS(200)) == pdTRUE) {
      char url[200];
      snprintf(url, sizeof(url), "%s%s", SERVER_BASE, m.path);
      int code = doRequest(true, url, m.body, nullptr);
      bool ok = (code >= 200 && code < 300);
      serverOk = ok;
      if (!ok && m.important) {
        xQueueSendToFront(netQueue, &m, 0);
        vTaskDelay(pdMS_TO_TICKS(3000));
      }
      continue;
    }

    if (millis() - lastPoll >= COMMAND_POLL_MS) {
      lastPoll = millis();
      char url[200];
      snprintf(url, sizeof(url), "%s/commands?device_id=%s", SERVER_BASE, DEVICE_ID);
      String resp;
      int code = doRequest(false, url, nullptr, &resp);
      serverOk = (code >= 200 && code < 300);
      // server answers e.g. {"command":"reset"} and then clears it
      if (serverOk && resp.indexOf("\"reset\"") >= 0) cmdReset = true;
    }
  }
}

void handleRemoteCommands() {
  if (cmdReset) {
    cmdReset = false;
    zone1.reset(); zone2.reset();
    sendEvent("reset", "remote");
    needRedraw = true;
  }
}

// Retries WiFi every WIFI_RETRY_MS while disconnected.
// Uses reconnect() so it doesn't fight the auto-reconnect.
void wifiWatchdog() {
  static uint32_t lastTry = 0;
  if (WiFi.status() == WL_CONNECTED) { lastTry = millis(); return; }
  if (millis() - lastTry >= WIFI_RETRY_MS) {
    lastTry = millis();
    Serial.println("WiFi: retrying...");
    WiFi.reconnect();
  }
}

// ---------- Drawing ----------
void drawHeader(const char *tag) {
  char buf[32];
  snprintf(buf, sizeof(buf), "%02u:%02u:%02u  %s", lastNow.Hour(), lastNow.Minute(), lastNow.Second(), tag);
  oled.setCursor(0, 0);
  oled.print(buf);
}

void drawMain() {
  char buf[32];
  drawHeader("ARMED");
  snprintf(buf, sizeof(buf), "Z1 %5.1f L/m %6.1f L", flow1, total1);
  oled.setCursor(0, 20); oled.print(buf);
  snprintf(buf, sizeof(buf), "Z2 %5.1f L/m %6.1f L", flow2, total2);
  oled.setCursor(0, 36); oled.print(buf);
}

void drawReport() {
  char buf[32];
  drawHeader("REPORT");
  oled.setCursor(0, 14); oled.print("Today  (pk = L/min)");
  snprintf(buf, sizeof(buf), "Z1 %6.1f L pk %4.1f", daily1, peak1);
  oled.setCursor(0, 28); oled.print(buf);
  snprintf(buf, sizeof(buf), "Z2 %6.1f L pk %4.1f", daily2, peak2);
  oled.setCursor(0, 40); oled.print(buf);
  snprintf(buf, sizeof(buf), "Trips today: %u", (unsigned)tripsToday);
  oled.setCursor(0, 54); oled.print(buf);
}

void drawWifi() {
  char buf[32];
  bool ok = (WiFi.status() == WL_CONNECTED);
  drawHeader("WIFI");
  oled.setTextSize(2);
  oled.setCursor(0, 14);
  oled.print(ok ? "CONNECTED" : "OFFLINE");
  oled.setTextSize(1);
  if (ok) {
    snprintf(buf, sizeof(buf), "SSID: %.14s", WiFi.SSID().c_str());
    oled.setCursor(0, 36); oled.print(buf);
    snprintf(buf, sizeof(buf), "IP: %s", WiFi.localIP().toString().c_str());
    oled.setCursor(0, 46); oled.print(buf);
    snprintf(buf, sizeof(buf), "Srv:%s %ddBm", serverOk ? "OK" : "ERR", (int)WiFi.RSSI());
    oled.setCursor(0, 56); oled.print(buf);
  } else {
    snprintf(buf, sizeof(buf), "SSID: %.14s", WIFI_SSID);
    oled.setCursor(0, 36); oled.print(buf);
    oled.setCursor(0, 46); oled.print("Retrying...");
  }
}

void drawAlarm(int zone) {
  TripReason r = (zone == 1) ? zone1.tripReason() : zone2.tripReason();
  bool both = zone1.isTripped() && zone2.isTripped();
  drawHeader("ALARM");
  oled.setTextSize(2);
  oled.setCursor(0, 14);
  oled.print(zone == 1 ? "Z1 TRIPPED" : "Z2 TRIPPED");
  oled.setTextSize(1);
  oled.setCursor(0, 36);
  oled.print(reasonText(r));
  if (both) oled.print(zone == 1 ? "  [btn:Z2]" : "  [btn:Z1]");
  oled.setCursor(0, 56); oled.print("hold btn=reset");
}

void drawScreen() {
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);
  switch (screen) {
    case SCR_MAIN:     drawMain();   break;
    case SCR_REPORT:   drawReport(); break;
    case SCR_WIFI:     drawWifi();   break;
    case SCR_ALARM_Z1: drawAlarm(1); break;
    case SCR_ALARM_Z2: drawAlarm(2); break;
  }
  oled.display();
}

// ---------- Input ----------
void onClick() {
  switch (screen) {
    case SCR_MAIN:     gotoScreen(SCR_REPORT); break;
    case SCR_REPORT:   gotoScreen(SCR_WIFI);   break;
    case SCR_WIFI:     gotoScreen(SCR_MAIN);   break;
    case SCR_ALARM_Z1: if (zone2.isTripped()) gotoScreen(SCR_ALARM_Z2); break;
    case SCR_ALARM_Z2: if (zone1.isTripped()) gotoScreen(SCR_ALARM_Z1); break;
  }
}

// Short press = next screen. Long press during an alarm = reset.
void handleButton() {
  uint32_t ms = millis();
  bool raw = (digitalRead(PIN_BUTTON) == LOW);
  if (raw != btnRaw) { btnRaw = raw; btnChangedAt = ms; }

  if ((ms - btnChangedAt) >= DEBOUNCE_MS && btnRaw != btnStable) {
    btnStable = btnRaw;
    if (btnStable) {
      btnDownAt = ms;
      btnConsumed = false;
    } else if (!btnConsumed && (ms - btnDownAt) < RESET_HOLD_MS) {
      onClick();
    }
  }

  if (!anyTripped()) holdStartAt = ms;
  if (btnStable && !btnConsumed && anyTripped() && (ms - holdStartAt) >= RESET_HOLD_MS) {
    zone1.reset(); zone2.reset();
    sendEvent("reset", "button");
    btnConsumed = true;
  }
}

// Force alarm screens while tripped; back to main once cleared.
void syncAlarmScreen() {
  bool t1 = zone1.isTripped(), t2 = zone2.isTripped();
  if (!t1 && !t2) {
    if (screen == SCR_ALARM_Z1 || screen == SCR_ALARM_Z2) gotoScreen(SCR_MAIN);
    return;
  }
  if ((screen == SCR_ALARM_Z1 && t1) || (screen == SCR_ALARM_Z2 && t2)) return;
  gotoScreen(t1 ? SCR_ALARM_Z1 : SCR_ALARM_Z2);
}

void updateAlerts() {
  bool alarm = anyTripped();
  digitalWrite(PIN_LED, alarm ? HIGH : LOW);
  bool beep = alarm && ((millis() / 400) % 2 == 0);
  digitalWrite(PIN_BUZZER, beep ? HIGH : LOW);
}

// ---------- Measurement ----------
void measureTick() {
  static uint32_t reportCounter = 0;

  uint32_t p1, p2;
  portENTER_CRITICAL(&mux); p1 = pulses1; p2 = pulses2; pulses1 = pulses2 = 0; portEXIT_CRITICAL(&mux);

  flow1 = p1 / PULSES_PER_SEC_PER_LPM;
  flow2 = p2 / PULSES_PER_SEC_PER_LPM;

  lastNow = rtc.GetDateTime();
  if (lastNow.Day() != lastDay) {
    sendDaily();
    lastDay = lastNow.Day();
    daily1 = daily2 = 0; peak1 = peak2 = 0; tripsToday = 0;
  }

  total1 += flow1 / 60.0f;  total2 += flow2 / 60.0f;
  daily1 += flow1 / 60.0f;  daily2 += flow2 / 60.0f;
  if (flow1 > peak1) peak1 = flow1;
  if (flow2 > peak2) peak2 = flow2;

  int minuteOfDay = lastNow.Hour() * 60 + lastNow.Minute();
  bool was1 = zone1.isTripped(), was2 = zone2.isTripped();
  zone1.update(flow1, minuteOfDay, 1);
  zone2.update(flow2, minuteOfDay, 1);
  if (!was1 && zone1.isTripped()) { tripsToday++; sendAlert(1, zone1.tripReason()); }
  if (!was2 && zone2.isTripped()) { tripsToday++; sendAlert(2, zone2.tripReason()); }

  if (++reportCounter >= REPORT_INTERVAL_S) {
    reportCounter = 0;
    sendReading();
  }
  needRedraw = true;
}

// ---------- Main ----------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);    digitalWrite(PIN_LED, LOW);
  pinMode(PIN_BUZZER, OUTPUT); digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_FLOW1, INPUT);
  pinMode(PIN_FLOW2, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW1), isr1, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW2), isr2, FALLING);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  // last arg false: don't let the library call Wire.begin() again (it resets the pins)
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C, true, false)) Serial.println("OLED not found");
  else Serial.println("OLED init done");

  RtcDateTime compiled(__DATE__, __TIME__);
  if (!rtc.IsDateTimeValid()) rtc.SetDateTime(compiled);
  if (!rtc.GetIsRunning()) rtc.SetIsRunning(true);
  if (rtc.GetDateTime() < compiled) rtc.SetDateTime(compiled);
  lastNow = rtc.GetDateTime();
  lastDay = lastNow.Day();
  char ts[24];
  fmtTime(lastNow, ts, sizeof(ts));
  Serial.printf("RTC time: %s\n", ts);

  // ---- WiFi with diagnostics ----
  WiFi.persistent(false);
  WiFi.onEvent(onWifiEvent);
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);   // main fix: lower TX power
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);

  int n = WiFi.scanNetworks();
  Serial.printf("Found %d networks\n", n);
  for (int i = 0; i < n; i++)
    Serial.printf("  [%s] ch%d %ddBm\n", WiFi.SSID(i).c_str(), WiFi.channel(i), WiFi.RSSI(i));

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  netQueue = xQueueCreate(10, sizeof(NetMsg));
  xTaskCreatePinnedToCore(netTask, "net", 10240, NULL, 1, NULL, 0);

  lastTick = screenSince = millis();
}

void loop() {
  uint32_t ms = millis();
  handleButton();
  handleRemoteCommands();
  wifiWatchdog();

  if (ms - lastTick >= 1000) {
    lastTick += 1000;
    measureTick();
  }

  syncAlarmScreen();
  if ((screen == SCR_REPORT || screen == SCR_WIFI) && (ms - screenSince) >= SCREEN_TIMEOUT_MS)
    gotoScreen(SCR_MAIN);

  if (needRedraw) { drawScreen(); needRedraw = false; }
  updateAlerts();
}