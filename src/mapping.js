// -----------------------------------------------------------------------------
// rtl_433 fields -> Gladys features and values (pure).
//
// rtl_433's decoders share a naming convention (docs/DATA_FORMAT.md):
// `<measure>_<unit>` in the sensor's native unit (temperature_C or _F,
// wind_avg_m_s or _km_h...). Each Gladys feature has ONE unit, so the values
// are converted to it, whatever unit the decoder (or rtl_433's -C option)
// uses. The first field present, in the order listed, gives the value.
//
// `readEvent` returns the readings of one event:
//   { key, state }        a feature value (`pulse`: an alarm that only says
//                         "detected", the app sets it back to 0 later),
//   button { code, status } a remote press, when the event measures nothing.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { present } from './events.js';

/** Gladys BUTTON_STATUS values used here (server/utils/constants.js). */
export const BUTTON_STATUS = { CLICK: 1, ON: 7, OFF: 8 };

// --- Value conversions ---------------------------------------------------------

const same = (v) => v;
const fToC = (v) => ((v - 32) * 5) / 9;
const msToKmh = (v) => v * 3.6;
const mihToKmh = (v) => v * 1.609344;
const inToMm = (v) => v * 25.4;
const kPaToHpa = (v) => v * 10;
const inHgToHpa = (v) => v * 33.8639;
const kPaToBar = (v) => v / 100;
const psiToBar = (v) => v * 0.0689476;
const kToUnit = (v) => v * 1000;
const milli = (v) => v / 1000;
const fraction = (v) => (v >= 0 && v <= 1 ? Math.round(v * 100) : undefined);

/** A number, from a number or a numeric string. */
const num = (v) => {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : undefined;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const TRUE_WORDS = /^(1|true|yes|on|open|opened|alarm|wet|detected|motion|leak)$/i;
const FALSE_WORDS = /^(0|false|no|off|close|closed|dry|clear|normal|ok|none)$/i;

/** 1 / 0 from a number or a word, undefined otherwise. */
const bin = (v) => {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? (v ? 1 : 0) : undefined;
  }
  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  if (typeof v === 'string') {
    return TRUE_WORDS.test(v.trim()) ? 1 : FALSE_WORDS.test(v.trim()) ? 0 : undefined;
  }
  return undefined;
};

/** The `state` of a contact ("open" / "closed"); other states (ON, motion) are not one. */
const openWord = (v) =>
  typeof v === 'string' && /^(open|opened|close|closed)$/i.test(v.trim())
    ? /^open/i.test(v.trim())
      ? 1
      : 0
    : undefined;

const round = (v) => Math.round(v * 1000) / 1000;

// --- The features --------------------------------------------------------------
//
// kind: 'measure' (throttled to the sensor interval) or 'state' (an event,
// never delayed); aux: battery and tamper, which never make a remote a sensor.

const measure = (name, category, type, unit, min, max, sources, extra = {}) => ({
  name,
  category,
  type,
  unit,
  min,
  max,
  sources,
  kind: 'measure',
  convert: num,
  ...extra,
});

const binary = (name, category, type, sources, kind = 'state', extra = {}) => ({
  name,
  category,
  type,
  min: 0,
  max: 1,
  sources,
  kind,
  convert: (v) => v,
  ...extra,
});

export const FEATURES = {
  temperature: measure('Temperature', C.TEMPERATURE_SENSOR, T.SENSOR.DECIMAL, U.CELSIUS, -80, 150, [
    ['temperature_C', same],
    ['temperature_F', fToC],
  ]),
  humidity: measure('Humidity', C.HUMIDITY_SENSOR, T.SENSOR.DECIMAL, U.PERCENT, 0, 100, [
    ['humidity', same],
  ]),
  moisture: measure('Soil moisture', C.SOIL_MOISTURE_SENSOR, T.SENSOR.DECIMAL, U.PERCENT, 0, 100, [
    ['moisture', same],
  ]),
  wind_speed: measure(
    'Wind speed',
    C.SPEED_SENSOR,
    T.SPEED_SENSOR.DECIMAL,
    U.KILOMETER_PER_HOUR,
    0,
    400,
    [
      ['wind_avg_km_h', same],
      ['wind_avg_m_s', msToKmh],
      ['wind_avg_mi_h', mihToKmh],
    ],
  ),
  wind_gust: measure(
    'Wind gust',
    C.SPEED_SENSOR,
    T.SPEED_SENSOR.DECIMAL,
    U.KILOMETER_PER_HOUR,
    0,
    400,
    [
      ['wind_max_km_h', same],
      ['wind_max_m_s', msToKmh],
      ['wind_max_mi_h', mihToKmh],
    ],
  ),
  wind_direction: measure('Wind direction', C.ANGLE_SENSOR, T.SENSOR.DECIMAL, U.DEGREE, 0, 360, [
    ['wind_dir_deg', same],
  ]),
  rain: measure('Rain', C.PRECIPITATION_SENSOR, T.PRECIPITATION_SENSOR.DECIMAL, U.MM, 0, 1e6, [
    ['rain_mm', same],
    ['rain_in', inToMm],
  ]),
  rain_rate: measure(
    'Rain rate',
    C.PRECIPITATION_SENSOR,
    T.PRECIPITATION_SENSOR.DECIMAL,
    U.MILLIMETER_PER_HOUR,
    0,
    2000,
    [
      ['rain_rate_mm_h', same],
      ['rain_rate_in_h', inToMm],
    ],
  ),
  // A barometer; a tyre's pressure (type TPMS) is `tire_pressure`.
  pressure: measure(
    'Pressure',
    C.PRESSURE_SENSOR,
    T.SENSOR.DECIMAL,
    U.HECTO_PASCAL,
    300,
    1200,
    [
      ['pressure_hPa', same],
      ['pressure_inHg', inHgToHpa],
      ['pressure_kPa', kPaToHpa],
    ],
    { tpms: false },
  ),
  tire_pressure: measure(
    'Tyre pressure',
    C.PRESSURE_SENSOR,
    T.SENSOR.DECIMAL,
    U.BAR,
    0,
    20,
    [
      ['pressure_kPa', kPaToBar],
      ['pressure_PSI', psiToBar],
      ['pressure_psi', psiToBar],
      ['pressure_bar', same],
    ],
    { tpms: true },
  ),
  light: measure('Light', C.LIGHT_SENSOR, T.SENSOR.DECIMAL, U.LUX, 0, 300_000, [
    ['light_lux', same],
    ['lux', same],
    ['light_klx', kToUnit],
  ]),
  // `uvi` is the index; Fine Offset's `uv` is a raw reading (0-20000), never used.
  uv: measure('UV index', C.UV_SENSOR, T.UV_SENSOR.INTEGER, U.UV_INDEX, 0, 20, [
    ['uvi', Math.round],
    ['uv_index', Math.round],
  ]),
  power: measure('Power', C.ENERGY_SENSOR, T.ENERGY_SENSOR.POWER, U.WATT, -1e6, 1e6, [
    ['power_W', same],
    ['power_kW', kToUnit],
  ]),
  // A cumulated total (OWL CM180/CM160): an index for the Gladys energy views.
  energy: measure('Energy', C.ENERGY_SENSOR, T.ENERGY_SENSOR.INDEX, U.KILOWATT_HOUR, 0, 1e9, [
    ['energy_kWh', same],
    ['energy_Wh', milli],
  ]),
  current: measure('Current', C.ENERGY_SENSOR, T.ENERGY_SENSOR.CURRENT, U.AMPERE, 0, 1000, [
    ['current_A', same],
    ['current', same],
  ]),
  voltage: measure('Voltage', C.ENERGY_SENSOR, T.ENERGY_SENSOR.VOLTAGE, U.VOLT, 0, 1e5, [
    ['voltage_V', same],
  ]),
  // battery_ok: a fraction (1 = full), or 1/0 for the sensors that only say OK/LOW.
  battery: measure(
    'Battery',
    C.BATTERY,
    T.BATTERY.INTEGER,
    U.PERCENT,
    0,
    100,
    [
      ['battery_ok', fraction],
      ['battery_pct', Math.round],
    ],
    { aux: true },
  ),
  opening: binary('Opening', C.OPENING_SENSOR, T.SENSOR.BINARY, [
    ['state', openWord],
    ['contact_open', bin],
    ['reed_open', bin],
    ['opened', bin],
  ]),
  motion: binary('Motion', C.MOTION_SENSOR, T.SENSOR.BINARY, [['motion', bin]], 'state', {
    pulse: true,
  }),
  leak: binary('Water leak', C.LEAK_SENSOR, T.SENSOR.BINARY, [
    ['detect_wet', bin],
    ['water', bin],
  ]),
  smoke: binary('Smoke', C.SMOKE_SENSOR, T.SENSOR.BINARY, [['smoke', bin]], 'state', {
    pulse: true,
  }),
  tamper: binary('Tamper', C.TAMPER, T.TAMPER.BINARY, [['tamper', bin]], 'state', { aux: true }),
};

/** Numbered probes: temperature_1_C -> temperature_1 (the spec of `temperature`). */
const PROBES = [
  [/^temperature_(\d{1,2})_C$/, 'temperature', same],
  [/^temperature_(\d{1,2})_F$/, 'temperature', fToC],
  [/^humidity_(\d{1,2})$/, 'humidity', same],
  [/^power_?(\d{1,2})_W$/, 'power', same],
  [/^current_?(\d{1,2})_A$/, 'current', same],
];

/** Model-specific fields: [model pattern, field, feature, conversion]. */
const MODEL_FIELDS = [[/^Fineoffset-WH55/, 'alarm', 'leak', bin]];

/** Detectors that send a message only when they detect, nothing else: the model says what. */
const MODEL_ALARMS = [
  [/smoke/i, 'smoke'],
  [/motion|(^|[^a-z])pir/i, 'motion'],
  [/leak/i, 'leak'],
];

/** Fields that tell which button of a remote was pressed, by priority. */
const CODE_FIELDS = ['button', 'cmd', 'command', 'code', 'key', 'tristate', 'data'];

// --- Features ------------------------------------------------------------------

const BUTTON_PREFIX = 'button_';

/** The feature key of a button code: "button_1", "button_c1a96c". */
export const buttonKey = (code) =>
  `${BUTTON_PREFIX}${String(code)
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 24)}`;

/** The base feature of a key: "temperature_2" -> ["temperature", "2"]. */
function baseOf(key) {
  if (FEATURES[key]) {
    return [key, undefined];
  }
  const m = /^([a-z_]+?)_(\d{1,2})$/.exec(key);
  return m && FEATURES[m[1]] ? [m[1], m[2]] : [undefined, undefined];
}

/** The Gladys feature of a key (without its external_id), or undefined. */
export function featureSpec(key) {
  if (key.startsWith(BUTTON_PREFIX)) {
    return {
      name: `Button ${key.slice(BUTTON_PREFIX.length)}`.slice(0, 100),
      category: C.BUTTON,
      type: T.BUTTON.CLICK,
      min: 0,
      max: 100,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    };
  }
  const [base, probe] = baseOf(key);
  if (!base) {
    return undefined;
  }
  const f = FEATURES[base];
  return {
    name: probe ? `${f.name} ${probe}` : f.name,
    category: f.category,
    type: f.type,
    unit: f.unit,
    min: f.min,
    max: f.max,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

/** Measurements are throttled to the sensor interval; events and alarms never are. */
export const isThrottled = (key) => FEATURES[baseOf(key)[0]]?.kind === 'measure';

/** A value within the feature bounds, rounded; undefined otherwise. */
function bounded(base, value) {
  const f = FEATURES[base];
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  const v =
    f.type === T.UV_SENSOR.INTEGER || f.type === T.BATTERY.INTEGER
      ? Math.round(value)
      : round(value);
  return v >= f.min && v <= f.max ? v : undefined;
}

function readFeature(base, event) {
  const f = FEATURES[base];
  for (const [field, conversion] of f.sources) {
    if (event[field] === undefined || event[field] === null) {
      continue;
    }
    const raw = f.convert(event[field]);
    const value = bounded(base, raw === undefined ? undefined : conversion(raw));
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

// --- Buttons -------------------------------------------------------------------

/** The button of a remote: ON/OFF switches (Nexa, KlikAanKlikUit, Waveman), or a code. */
export function buttonOf(event) {
  const onOff = [event.state, event.command].find(
    (v) => typeof v === 'string' && /^(on|off)$/i.test(v.trim()),
  );
  if (onOff) {
    const group = event.group === 1 || /^yes$/i.test(String(event.group_call ?? ''));
    const code = present(event.button)
      ? event.button
      : group
        ? 'group'
        : present(event.unit)
          ? event.unit
          : 'switch';
    return {
      code: String(code),
      status: /^on$/i.test(onOff.trim()) ? BUTTON_STATUS.ON : BUTTON_STATUS.OFF,
    };
  }
  const field = CODE_FIELDS.find((k) => present(event[k]));
  return field ? { code: String(event[field]).trim(), status: BUTTON_STATUS.CLICK } : undefined;
}

// --- One event -----------------------------------------------------------------

/**
 * The readings of one rtl_433 event.
 * @returns {{ readings: Array<{ key: string, state: number, pulse?: boolean }>,
 *   button?: { code: string, status: number } }}
 */
export function readEvent(event) {
  const tpms = event.type === 'TPMS';
  const readings = [];
  const seen = new Set();
  const add = (key, state, pulse = false) => {
    if (state !== undefined && !seen.has(key)) {
      seen.add(key);
      readings.push(pulse ? { key, state, pulse } : { key, state });
    }
  };
  for (const [key, f] of Object.entries(FEATURES)) {
    if (f.tpms === undefined || f.tpms === tpms) {
      add(key, readFeature(key, event), f.pulse);
    }
  }
  for (const field of Object.keys(event)) {
    for (const [pattern, base, conversion] of PROBES) {
      const m = pattern.exec(field);
      if (m) {
        const raw = num(event[field]);
        add(
          `${base}_${Number(m[1])}`,
          bounded(base, raw === undefined ? undefined : conversion(raw)),
        );
      }
    }
  }
  for (const [pattern, field, key, conversion] of MODEL_FIELDS) {
    if (pattern.test(event.model) && event[field] !== undefined) {
      add(key, conversion(event[field]));
    }
  }
  const sensing = readings.some((r) => !FEATURES[baseOf(r.key)[0]].aux);
  if (sensing) {
    return { readings };
  }
  const alarm = MODEL_ALARMS.find(([pattern]) => pattern.test(event.model));
  if (alarm) {
    add(alarm[1], 1, true);
    return { readings };
  }
  const button = buttonOf(event);
  return button ? { readings, button } : { readings };
}
