// -----------------------------------------------------------------------------
// The integration: one connection to where rtl_433 publishes (the user's MQTT
// broker, or rtl_433's own HTTP server), the sensors heard, the Discovery list
// built from them, and the values, presses and alarms sent for the devices the
// user created. index.js only wires the SDK handlers to it.
//
// The SDR dongle is never plugged into Gladys: rtl_433 runs next to it (the
// integration containers get no USB access) and publishes JSON events.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { DEVICE_TYPE, LIMITS, SCENE_TRIGGERS, TIMINGS } from './constants.js';
import { buildDevices, sortKeys } from './devices.js';
import { identify, parseEvent, rawOf, rssiOf } from './events.js';
import { connectHttp } from './http.js';
import { T, ago, describeValues } from './i18n.js';
import { BUTTON_STATUS, buttonKey, isThrottled, readEvent } from './mapping.js';
import { connectBroker, errorReason, isRefusal, tooLarge } from './mqtt.js';
import { StatePublisher } from './publisher.js';

/** Where the events come from: the broker (mqtt://...) or rtl_433 itself (http://...). */
export const connectSource = (config) =>
  config.kind === 'http' ? connectHttp(config) : connectBroker(config);

/** The feature key of a feature external id (`<device>:<key>`). */
const keyOf = (featureId) => featureId.slice(featureId.lastIndexOf(':') + 1);
const isButton = (key) => key.startsWith('button_');
const cut = (text, max) => (text.length > max ? text.slice(0, max) : text);
const ACTION_OF = { [BUTTON_STATUS.ON]: 'on', [BUTTON_STATUS.OFF]: 'off' };

/** A device that measures on its own every minute or so (not a remote, a contact, a tyre). */
const isPeriodic = (keys) =>
  [...keys].some((k) => isThrottled(k) && k !== 'battery' && k !== 'tire_pressure');

export class Rtl433App {
  constructor({
    gladys,
    logger = createLogger({ name: 'rtl433' }),
    connect = connectSource,
    now = Date.now,
    timers = globalThis,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.connect = connect;
    this.now = now;
    this.timers = timers;
    this.config = normalizeConfig();
    /** device external id -> sensor heard, least recently heard first */
    this.sensors = new Map();
    /** TPMS left out of Discovery (passing cars), counted for the list button */
    this.tpmsLeftOut = new Set();
    this.createdDevices = new Set();
    this.createdFeatures = new Set();
    /** featureId -> timer setting a "detected only" alarm back to 0 */
    this.resetTimers = new Map();
    /** deviceId -> transport last published */
    this.transports = new Map();
    this.sceneWindow = [];
    this.client = null;
    this.linkUp = false;
    /** availability topic -> when rtl_433 said "offline" there (one per rtl_433 instance) */
    this.offline = new Map();
    this.lastEventAt = -Infinity;
    this.rebuildTimer = undefined;
    this.staleTimer = undefined;
    this.lastPublish = -Infinity;
    this.startedAt = undefined;
    this.generation = 0;
    this.lastStatus = undefined;
    this.warned = new Set();
    this.publisher = new StatePublisher({ gladys, logger, now, timers });
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    const generation = this.generation;
    this.config = normalizeConfig(raw);
    this.startedAt ??= this.now();
    this.offline.clear();
    this.refreshCreated();
    if (this.config.urlError) {
      await this.setStatus(
        false,
        this.config.urlError === 'empty' ? T.notConfigured : T.badUrl(this.config.urlError),
      );
      return;
    }
    await this.setStatus(false, T.connecting(this.config.kind));
    this.publisher.configure({
      intervalSeconds: this.config.sensorInterval,
      isThrottled: (featureId) => isThrottled(keyOf(featureId)),
    });
    this.publisher.start();
    this.staleTimer = this.timers.setInterval(() => {
      this.publishAllTransports().catch((err) =>
        this.logger.warn(`Transport badges failed: ${err.message}`),
      );
    }, TIMINGS.staleCheck);
    if (this.sensors.size > 0) {
      // The TPMS option may have changed: publish the list again.
      this.scheduleRebuild();
    }
    const client = this.connect(this.config);
    this.client = client;
    const current = () => generation === this.generation && this.client === client;
    client.on('connect', () => {
      if (current()) {
        this.onConnect(client).catch((err) =>
          this.logger.error(`After connection: ${err.message}`),
        );
      }
    });
    client.on('message', (topic, payload) => {
      if (current()) {
        this.onMessage(topic, payload);
      }
    });
    client.on('error', (err) => {
      if (current()) {
        const reason = errorReason(err);
        this.logger.warn(`${this.config.kind === 'http' ? 'rtl_433' : 'MQTT broker'}: ${reason}`);
        this.linkUp = false;
        this.setStatus(
          false,
          isRefusal(err) ? T.refused(reason) : T.unreachable(this.config.kind, reason),
        );
      }
    });
    client.on('close', () => {
      if (current()) {
        if (this.linkUp) {
          this.linkUp = false;
          this.setStatus(false, T.unreachable(this.config.kind, 'connection lost'));
        }
        this.publishAllTransports().catch(() => {});
      }
    });
  }

  stop() {
    this.generation += 1;
    this.timers.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = undefined;
    this.timers.clearInterval(this.staleTimer);
    this.staleTimer = undefined;
    for (const timer of this.resetTimers.values()) {
      this.timers.clearTimeout(timer);
    }
    this.resetTimers.clear();
    this.publisher.stop();
    if (this.client) {
      this.client.removeAllListeners?.();
      this.client.on?.('error', () => {});
      this.client.end(true);
      this.client = null;
    }
    this.linkUp = false;
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  warnOnce(key, message) {
    if (!this.warned.has(key) && this.warned.size < 1000) {
      this.warned.add(key);
      this.logger.warn(message);
    }
  }

  async onConnect(client) {
    this.logger.info(`Connected to ${this.config.url}`);
    if (this.config.kind === 'mqtt') {
      client.subscribe([this.config.topic], { qos: 0 }, (err) => {
        if (err) {
          this.logger.warn(`Subscription to ${this.config.topic} failed: ${err.message}`);
        }
      });
    }
    this.linkUp = true;
    await this.setStatus(true, this.statusMessage());
    await this.publishAllTransports();
  }

  /**
   * An rtl_433 said "offline" (its last will) and nothing was heard since: a
   * stale "offline" retained by the broker (a stopped second instance) does
   * not hide the events that keep coming.
   */
  isOffline() {
    return [...this.offline.values()].some((at) => at >= this.lastEventAt);
  }

  statusMessage() {
    if (this.isOffline()) {
      return T.offline;
    }
    const heard = this.offeredSensors().length;
    return heard === 0
      ? T.waiting(this.config.kind, this.config.topic)
      : T.connected(this.config.kind, heard, this.createdDevices.size);
  }

  // --- Messages --------------------------------------------------------------

  onMessage(topic, payload) {
    if (tooLarge(payload)) {
      this.warnOnce('large', `A message larger than ${LIMITS.payloadBytes} bytes was ignored`);
      return;
    }
    if (typeof topic === 'string' && topic.endsWith('/availability')) {
      this.onAvailability(topic, String(payload ?? ''));
      return;
    }
    const event = parseEvent(payload);
    if (event) {
      this.onEvent(event);
    }
  }

  /** rtl_433 publishes "online" (retained) on <base>/availability, "offline" as its last will. */
  onAvailability(topic, text) {
    const value = text.trim().toLowerCase();
    if (value === 'online') {
      this.offline.delete(topic);
    } else if (value === 'offline') {
      this.offline.set(topic, this.now());
      this.logger.warn(`rtl_433 is offline (${topic})`);
    } else {
      return;
    }
    this.refreshStatus();
  }

  onEvent(event) {
    const now = this.now();
    this.lastEventAt = now;
    if (this.offline.size > 0) {
      this.refreshStatus();
    }
    const identity = identify(event);
    const ids = this.gladys.externalIds(DEVICE_TYPE, identity.platformId);
    const created = this.createdDevices.has(ids.device);
    if (identity.tpms && !this.config.includeTpms && !created) {
      if (this.tpmsLeftOut.size < 1000) {
        this.tpmsLeftOut.add(ids.device);
      }
      return;
    }
    const { readings, button } = readEvent(event);
    const sensor = this.remember(ids.device, identity, event, now);
    let changed = false;
    for (const r of readings) {
      changed = this.addKey(sensor, r.key) || changed;
      sensor.values.set(r.key, r.state);
      const featureId = ids.feature(r.key);
      this.record(featureId, r.state);
      if (r.pulse) {
        if (r.state === 1) {
          this.scheduleReset(sensor, r.key, featureId);
        } else {
          this.cancelReset(featureId);
        }
      }
    }
    if (button) {
      changed = this.onButton(sensor, ids, button, event, now) || changed;
    }
    if (changed) {
      this.scheduleRebuild();
    }
    if (created && this.transports.get(ids.device) !== DEVICE_TRANSPORTS.LOCAL) {
      this.publishAllTransports().catch(() => {});
    }
  }

  /** The record of a sensor, moved to the end (most recently heard). */
  remember(deviceId, identity, event, now) {
    let sensor = this.sensors.get(deviceId);
    if (sensor) {
      this.sensors.delete(deviceId);
    } else {
      sensor = {
        ...identity,
        deviceId,
        keys: new Set(),
        values: new Map(),
        presses: new Map(),
        count: 0,
        firstSeen: now,
      };
    }
    this.sensors.set(deviceId, sensor);
    sensor.count += 1;
    sensor.lastSeen = now;
    sensor.rssi = rssiOf(event) ?? sensor.rssi;
    if (typeof event.protocol === 'number' || typeof event.protocol === 'string') {
      sensor.protocol = event.protocol;
    }
    this.evict();
    return sensor;
  }

  /** Over the limit: forget the sensors heard least recently, never a created one. */
  evict() {
    if (this.sensors.size <= LIMITS.sensors) {
      return;
    }
    for (const [deviceId] of this.sensors) {
      if (this.sensors.size <= LIMITS.sensors) {
        break;
      }
      if (!this.createdDevices.has(deviceId)) {
        this.forgetSensor(deviceId);
      }
    }
  }

  forgetSensor(deviceId) {
    this.sensors.delete(deviceId);
    for (const [featureId, timer] of this.resetTimers) {
      if (featureId.startsWith(`${deviceId}:`)) {
        this.timers.clearTimeout(timer);
        this.resetTimers.delete(featureId);
      }
    }
  }

  /** A feature the sensor never had: the Discovery list changes. */
  addKey(sensor, key) {
    if (sensor.keys.has(key)) {
      return false;
    }
    if (isButton(key) && [...sensor.keys].filter(isButton).length >= LIMITS.buttonsPerDevice) {
      this.warnOnce(
        `buttons:${sensor.deviceId}`,
        `${sensor.name}: more than ${LIMITS.buttonsPerDevice} codes heard, the next ones get no button feature`,
      );
      return false;
    }
    sensor.keys.add(key);
    return true;
  }

  /** Keeps the value; sends it if the device exists in Gladys. */
  record(featureId, state) {
    if (this.createdFeatures.has(featureId)) {
      this.publisher.push(featureId, { state });
    }
  }

  scheduleReset(sensor, key, featureId) {
    this.cancelReset(featureId);
    this.resetTimers.set(
      featureId,
      this.timers.setTimeout(() => {
        this.resetTimers.delete(featureId);
        sensor.values.set(key, 0);
        this.record(featureId, 0);
      }, TIMINGS.alarmReset),
    );
  }

  cancelReset(featureId) {
    const timer = this.resetTimers.get(featureId);
    if (timer) {
      this.timers.clearTimeout(timer);
      this.resetTimers.delete(featureId);
    }
  }

  /** A remote press: the button feature, and the scene trigger of a created remote. */
  onButton(sensor, ids, { code, status }, event, now) {
    const key = buttonKey(code);
    const press = `${key}|${status}`;
    const last = sensor.presses.get(press);
    if (sensor.presses.size > 64) {
      sensor.presses.clear();
    }
    sensor.presses.set(press, now);
    if (last !== undefined && now - last < TIMINGS.repeatWindow) {
      // The same frame, repeated by the remote: one press.
      return false;
    }
    const changed = this.addKey(sensor, key);
    if (!sensor.keys.has(key)) {
      return false;
    }
    sensor.values.set(key, status);
    const featureId = ids.feature(key);
    if (this.createdFeatures.has(featureId)) {
      this.publisher.pushEvent(featureId, status);
    }
    if (this.createdDevices.has(ids.device)) {
      this.fireButton(ids.device, code, status, event, now);
    }
    return changed;
  }

  fireButton(deviceId, code, status, event, now) {
    this.sceneWindow = this.sceneWindow.filter((t) => now - t < 60_000);
    if (this.sceneWindow.length >= LIMITS.eventsPerMinute) {
      this.warnOnce('scene-budget', 'Too many remote presses: scene events dropped for a minute');
      return;
    }
    this.sceneWindow.push(now);
    this.gladys
      .publishSceneEvent(SCENE_TRIGGERS.BUTTON, {
        device: deviceId,
        code: cut(code, LIMITS.eventText),
        action: ACTION_OF[status] ?? 'press',
        model: cut(event.model, LIMITS.eventText),
        payload: rawOf(event, LIMITS.eventText),
      })
      .catch((err) => this.logger.warn(`Scene event failed: ${err.message}`));
  }

  // --- Discovery -------------------------------------------------------------

  /** The sensors offered in Discovery: heard recently (TPMS on demand), or created. */
  offeredSensors(now = this.now()) {
    return [...this.sensors.values()].filter(
      (s) =>
        s.keys.size > 0 &&
        (this.createdDevices.has(s.deviceId) ||
          ((!s.tpms || this.config.includeTpms) && now - s.lastSeen < TIMINGS.forgetAfter)),
    );
  }

  /** New sensors arrive all the time (the neighbours): publish at most every 30 s. */
  scheduleRebuild() {
    if (this.rebuildTimer !== undefined) {
      return;
    }
    const generation = this.generation;
    const delay = Math.max(
      TIMINGS.publishDebounce,
      this.lastPublish + TIMINGS.publishMinGap - this.now(),
    );
    this.rebuildTimer = this.timers.setTimeout(() => {
      this.rebuildTimer = undefined;
      if (generation === this.generation) {
        this.rebuild().catch((err) =>
          this.logger.error(`Publishing the discovered devices failed: ${err.message}`),
        );
      }
    }, delay);
  }

  async rebuild() {
    this.timers.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = undefined;
    const now = this.now();
    this.lastPublish = now;
    for (const sensor of [...this.sensors.values()]) {
      if (
        !this.createdDevices.has(sensor.deviceId) &&
        now - sensor.lastSeen >= TIMINGS.forgetAfter
      ) {
        this.forgetSensor(sensor.deviceId);
      }
    }
    await this.gladys
      .publishDiscoveredDevices(buildDevices(this.gladys, this.offeredSensors(now)))
      .catch((err) => this.logger.warn(`Publishing the discovered devices failed: ${err.message}`));
    if (this.linkUp) {
      await this.setStatus(true, this.statusMessage());
    }
  }

  // --- Devices created by the user -------------------------------------------

  refreshCreated() {
    const devices = this.gladys.devices ?? [];
    this.createdDevices = new Set(devices.map((d) => d.external_id));
    this.createdFeatures = new Set(
      devices.flatMap((d) => (d.features ?? []).map((f) => f.external_id)),
    );
  }

  async deviceCreated(device) {
    this.refreshCreated();
    this.transports.delete(device?.external_id);
    const sensor = this.sensors.get(device?.external_id);
    for (const f of device?.features ?? []) {
      const key = keyOf(f.external_id);
      // The last values heard before the creation; a past press is not replayed.
      if (sensor?.values.has(key) && !isButton(key)) {
        this.publisher.push(f.external_id, { state: sensor.values.get(key) });
      }
    }
    await this.publishAllTransports().catch(() => {});
    await this.refreshStatus();
  }

  async deviceDeleted(device) {
    this.refreshCreated();
    if (device?.external_id) {
      this.transports.delete(device.external_id);
      this.publisher.forget(device.external_id);
    }
    await this.refreshStatus();
  }

  /** The status counts the devices in Gladys. */
  async refreshStatus() {
    if (this.linkUp) {
      await this.setStatus(true, this.statusMessage());
    }
  }

  /**
   * The badge of a created device: unreachable while the link is down, and for
   * a sensor that measures periodically but has been silent for an hour (a flat
   * battery, out of range). Remotes and contacts only speak when used.
   */
  transportOf(device, now) {
    if (!this.linkUp) {
      return DEVICE_TRANSPORTS.UNREACHABLE;
    }
    const keys = (device.features ?? []).map((f) => keyOf(f.external_id));
    if (!isPeriodic(keys)) {
      return DEVICE_TRANSPORTS.LOCAL;
    }
    const lastSeen = this.sensors.get(device.external_id)?.lastSeen ?? this.startedAt ?? now;
    return now - lastSeen < TIMINGS.staleAfter
      ? DEVICE_TRANSPORTS.LOCAL
      : DEVICE_TRANSPORTS.UNREACHABLE;
  }

  async publishAllTransports() {
    const now = this.now();
    const entries = [];
    for (const device of this.gladys.devices ?? []) {
      const transport = this.transportOf(device, now);
      if (this.transports.get(device.external_id) !== transport) {
        this.transports.set(device.external_id, transport);
        entries.push({ external_id: device.external_id, transport });
      }
    }
    for (let i = 0; i < entries.length; i += 100) {
      await this.gladys.publishTransports(entries.slice(i, i + 100));
    }
  }

  // --- Configuration screen buttons ------------------------------------------

  /** Connects with the saved configuration and waits for a first rtl_433 event. */
  testConnection() {
    const config = this.config;
    if (config.urlError) {
      return Promise.resolve(
        config.urlError === 'empty' ? T.notConfigured : T.badUrl(config.urlError),
      );
    }
    return new Promise((resolve) => {
      const started = this.now();
      let probe;
      let timer;
      const finish = (answer) => {
        this.timers.clearTimeout(timer);
        probe?.removeAllListeners?.();
        probe?.on?.('error', () => {});
        probe?.end(true);
        resolve(answer);
      };
      try {
        probe = this.connect({ ...config });
      } catch (err) {
        finish(T.unreachable(config.kind, errorReason(err)));
        return;
      }
      timer = this.timers.setTimeout(
        () => finish(T.unreachable(config.kind, 'timeout')),
        TIMINGS.connectTimeout + 1000,
      );
      probe.on('error', (err) => {
        const reason = errorReason(err);
        finish(isRefusal(err) ? T.refused(reason) : T.unreachable(config.kind, reason));
      });
      // Retained, maybe by an old instance: said only if no event comes.
      const offline = new Set();
      probe.on('message', (topic, payload) => {
        if (typeof topic === 'string' && topic.endsWith('/availability')) {
          if (String(payload ?? '').trim() === 'offline') {
            offline.add(topic);
          } else {
            offline.delete(topic);
          }
          return;
        }
        const event = tooLarge(payload) ? null : parseEvent(payload);
        if (event) {
          const seconds = Math.round((this.now() - started) / 1000);
          finish(T.test.ok(identify(event).name, seconds, this.offeredSensors().length));
        }
      });
      probe.on('connect', () => {
        if (config.kind === 'mqtt') {
          probe.subscribe([config.topic], { qos: 0 });
        }
        this.timers.clearTimeout(timer);
        timer = this.timers.setTimeout(
          () =>
            finish(
              offline.size > 0
                ? T.test.offline
                : T.test.silent(config.kind, config.topic, TIMINGS.testListen / 1000),
            ),
          TIMINGS.testListen,
        );
      });
    });
  }

  /** The sensors heard, most recent first, with their last values: which ones are mine? */
  listSensors() {
    const now = this.now();
    const sensors = [...this.sensors.values()]
      .filter((s) => !s.tpms || this.config.includeTpms || this.createdDevices.has(s.deviceId))
      .reverse();
    const lines = [];
    if (sensors.length === 0) {
      lines.push(T.list.empty);
    } else {
      const shown = sensors.slice(0, LIMITS.listed);
      lines.push(T.list.header(sensors.length, shown.length));
      for (const s of shown) {
        const values = describeValues(
          sortKeys(s.keys)
            .filter((k) => s.values.has(k))
            .map((k) => [k, s.values.get(k)]),
        );
        lines.push(
          T.list.line({
            name: s.name,
            values,
            count: s.count,
            since: ago(now - s.lastSeen),
            rssi: s.rssi,
            created: this.createdDevices.has(s.deviceId),
          }),
        );
      }
      if (shown.some((s) => s.rssi !== undefined)) {
        lines.push(T.list.hint);
      }
    }
    if (this.tpmsLeftOut.size > 0 && !this.config.includeTpms) {
      lines.push(T.list.tpms(this.tpmsLeftOut.size));
    }
    return {
      en: lines.map((l) => l.en).join('\n'),
      fr: lines.map((l) => l.fr).join('\n'),
    };
  }
}
