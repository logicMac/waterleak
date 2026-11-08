#pragma once
// Leak-detection logic, no Arduino dependencies.
#include <stdint.h>

enum TripReason { TRIP_NONE = 0, TRIP_QUIET_HOURS, TRIP_CONTINUOUS, TRIP_OVER_RATE };

struct ZoneConfig {
  float    flowThresholdLpm   = 0.1f;      // below this = no flow
  float    maxRateLpm         = 30.0f;     // above this = burst, trip at once
  uint32_t continuousLimitSec = 30 * 60;   // running this long = trip
  int      quietStartMin      = 23 * 60;   // quiet window, minutes since midnight
  int      quietEndMin        = 5 * 60;
  uint32_t quietGraceSec      = 10;        // flow this long in quiet window = trip
};

class ZoneMonitor {
 public:
  explicit ZoneMonitor(const ZoneConfig &c) : cfg(c) {}

  // Call once per tick. Trip stays latched until reset().
  TripReason update(float flowLpm, int minuteOfDay, uint32_t dtSec) {
    if (reason != TRIP_NONE) return reason;

    if (flowLpm > cfg.maxRateLpm) return reason = TRIP_OVER_RATE;

    if (flowLpm >= cfg.flowThresholdLpm) {
      flowingSec += dtSec;
      if (inQuietWindow(minuteOfDay)) quietFlowSec += dtSec; else quietFlowSec = 0;
      if (quietFlowSec >= cfg.quietGraceSec)      return reason = TRIP_QUIET_HOURS;
      if (flowingSec >= cfg.continuousLimitSec)   return reason = TRIP_CONTINUOUS;
    } else {
      flowingSec = 0;
      quietFlowSec = 0;
    }
    return reason;
  }

  bool       isTripped() const { return reason != TRIP_NONE; }
  TripReason tripReason() const { return reason; }
  void       reset() { reason = TRIP_NONE; flowingSec = 0; quietFlowSec = 0; }

 private:
  bool inQuietWindow(int m) const {
    if (cfg.quietStartMin <= cfg.quietEndMin) return m >= cfg.quietStartMin && m < cfg.quietEndMin;
    return m >= cfg.quietStartMin || m < cfg.quietEndMin;   // crosses midnight
  }
  ZoneConfig cfg;
  TripReason reason = TRIP_NONE;
  uint32_t flowingSec = 0;
  uint32_t quietFlowSec = 0;
};
