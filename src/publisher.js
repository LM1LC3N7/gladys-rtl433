// -----------------------------------------------------------------------------
// The states sent to Gladys, within its 300 states per minute.
//
// rtl_433 hears every sensor of the street; only the devices the user created
// reach the publisher, but a weather station still sends 8 values every 16 s
// and an energy meter one every 6 s. The publisher keeps the LAST value of
// each feature, sends the pending ones every second within a per-minute
// budget, skips the unchanged ones (publishChangedStates) and spaces the
// measurements of a same feature by the configured interval.
//
// Button presses are events: every press is sent (publishStates, never
// deduplicated, a second click must trigger the scenes again) before the
// values, and only budgeted.
// -----------------------------------------------------------------------------

import { LIMITS, TIMINGS } from './constants.js';

export class StatePublisher {
  constructor({
    gladys,
    logger,
    now = Date.now,
    timers = globalThis,
    budget = LIMITS.statesPerMinute,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.budget = budget;
    /** featureId -> { state } */
    this.pending = new Map();
    /** [{ device_feature_external_id, state }] button presses, in order */
    this.events = [];
    /** featureId -> last send time */
    this.lastSent = new Map();
    /** send times of the last minute */
    this.window = [];
    this.interval = 0;
    this.isThrottled = () => false;
    this.timer = undefined;
    this.flushing = undefined;
  }

  /** @param {{ intervalSeconds: number, isThrottled: (featureId: string) => boolean }} options */
  configure({ intervalSeconds, isThrottled }) {
    this.interval = intervalSeconds * 1000;
    this.isThrottled = isThrottled ?? (() => false);
  }

  start() {
    this.stop();
    this.timer = this.timers.setInterval(() => {
      this.flush().catch((err) => this.logger.warn(`Sending the states failed: ${err.message}`));
    }, TIMINGS.flushInterval);
  }

  stop() {
    if (this.timer) {
      this.timers.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  push(featureId, value) {
    this.pending.set(featureId, value);
  }

  pushEvent(featureId, state) {
    // Bounded: a stuck remote cannot fill the memory.
    if (this.events.length < LIMITS.statesPerMinute) {
      this.events.push({ device_feature_external_id: featureId, state });
    }
  }

  /** Forget a device (deleted): its pending values are dropped. */
  forget(deviceId) {
    const mine = (key) => key === deviceId || key.startsWith(`${deviceId}:`);
    for (const map of [this.pending, this.lastSent]) {
      for (const key of map.keys()) {
        if (mine(key)) {
          map.delete(key);
        }
      }
    }
    this.events = this.events.filter((e) => !mine(e.device_feature_external_id));
  }

  flush() {
    if (!this.flushing) {
      this.flushing = this.doFlush().finally(() => {
        this.flushing = undefined;
      });
    }
    return this.flushing;
  }

  async doFlush() {
    const now = this.now();
    this.window = this.window.filter((t) => now - t < 60_000);
    let room = this.budget - this.window.length;
    let sent = 0;
    if (room > 0 && this.events.length > 0) {
      const batch = this.events.slice(0, Math.min(room, 100));
      try {
        await this.gladys.publishStates(batch);
      } catch (err) {
        // Refused for good (a device deleted meanwhile): drop. Otherwise retry next round.
        if (err.status === 400) {
          this.events.splice(0, batch.length);
        }
        throw err;
      }
      this.events.splice(0, batch.length);
      for (let i = 0; i < batch.length; i += 1) {
        this.window.push(now);
      }
      room -= batch.length;
      sent += batch.length;
    }
    if (room <= 0 || this.pending.size === 0) {
      return sent;
    }
    const batch = [];
    for (const [featureId, value] of this.pending) {
      if (room <= 0) {
        break;
      }
      const last = this.lastSent.get(featureId);
      if (this.isThrottled(featureId) && last !== undefined && now - last < this.interval) {
        continue;
      }
      this.pending.delete(featureId);
      batch.push({ device_feature_external_id: featureId, ...value });
      room -= 1;
    }
    if (batch.length === 0) {
      return sent;
    }
    try {
      const result = await this.gladys.publishChangedStates(batch, {
        heartbeat: TIMINGS.stateHeartbeat,
      });
      for (const entry of batch) {
        this.lastSent.set(entry.device_feature_external_id, now);
      }
      const count = result?.count ?? batch.length;
      for (let i = 0; i < count; i += 1) {
        this.window.push(now);
      }
      return sent + count;
    } catch (err) {
      // Keep the values for the next round, unless a newer one arrived meanwhile.
      for (const entry of batch) {
        const { device_feature_external_id: id, ...value } = entry;
        if (!this.pending.has(id)) {
          this.pending.set(id, value);
        }
      }
      throw err;
    }
  }
}
