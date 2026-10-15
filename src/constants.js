// -----------------------------------------------------------------------------
// Keys shared with the manifest (frozen: users store them in their scenes and
// configuration) and the tuning of the integration.
// -----------------------------------------------------------------------------

/** Manifest `actions` keys. */
export const ACTIONS = {
  TEST: 'test_connection',
  LIST: 'list_sensors',
};

/** Manifest `scene_triggers` keys. */
export const SCENE_TRIGGERS = {
  BUTTON: 'button_pressed',
};

/** The `type` part of the external ids: ext:<selector>:rtl433:<model>... (forever). */
export const DEVICE_TYPE = 'rtl433';

/** Sensor throttling bounds (seconds), mirrored by the manifest. */
export const SENSOR_INTERVAL = { min: 0, max: 3600, default: 30 };

export const LIMITS = {
  /** Gladys accepts 300 states per minute: keep a margin for the other paths. */
  statesPerMinute: 250,
  /** Gladys accepts 300 scene events per minute. */
  eventsPerMinute: 250,
  /** Sensors kept in memory (the neighbours' ones and passing cars included). */
  sensors: 500,
  /** rtl_433 prints an event in at most 2 KB (its MQTT buffer); anything far larger is not one. */
  payloadBytes: 16 * 1024,
  /** Scene event strings. */
  eventText: 1000,
  /** Button features of one remote (one per code heard). */
  buttonsPerDevice: 16,
  /** Sensors described by the "list the sensors heard" button. */
  listed: 20,
};

export const TIMINGS = {
  /** A new sensor or field is published to Discovery after this pause... */
  publishDebounce: 2000,
  /** ...and the Discovery list at most this often (the neighbours never stop). */
  publishMinGap: 30_000,
  /** The pending states are sent at this pace. */
  flushInterval: 1000,
  /** An unchanged value is re-sent this often, so it stays recently dated in Gladys. */
  stateHeartbeat: 30 * 60_000,
  /** A remote repeats its frame several times per press: one press within this window. */
  repeatWindow: 1500,
  /** Motion and smoke detectors only say "detected": back to 0 after this delay. */
  alarmReset: 60_000,
  /** A sensor not heard for this long leaves the Discovery list. */
  forgetAfter: 24 * 3600_000,
  /** A created sensor that measures (every minute or so) and is silent this long: unreachable. */
  staleAfter: 3600_000,
  /** How often the transport badges of the created devices are checked. */
  staleCheck: 60_000,
  /** How long the connection test waits for a first rtl_433 event. */
  testListen: 20_000,
  /** Broker connection timeout. */
  connectTimeout: 10_000,
  /** Delay between two reconnection attempts. */
  reconnectPeriod: 5000,
  /** rtl_433's HTTP server sends a keep-alive every 60 s: silence past this is a dead link. */
  httpIdle: 150_000,
};
