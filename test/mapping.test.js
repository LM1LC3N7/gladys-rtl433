// -----------------------------------------------------------------------------
// rtl_433 events -> Gladys readings, on events shaped like the real decoders.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import {
  BUTTON_STATUS,
  FEATURES,
  buttonKey,
  buttonOf,
  featureSpec,
  isThrottled,
  readEvent,
} from '../src/mapping.js';
import * as F from './fixtures/events.js';

/** { key: state } of an event, and its button. */
function read(event) {
  const { readings, button } = readEvent(event);
  return { values: Object.fromEntries(readings.map((r) => [r.key, r.state])), button, readings };
}

test('a thermometer: temperature, humidity, battery', () => {
  assert.deepEqual(read(F.NEXUS_TH).values, { temperature: 29.4, humidity: 30, battery: 100 });
  assert.deepEqual(read(F.LACROSSE_TX141).values, {
    temperature: -20,
    humidity: 10,
    battery: 100,
  });
  assert.equal(read(F.ACURITE_TOWER).button, undefined);
});

test('Fahrenheit is converted to Celsius, a LOW battery is 0 %', () => {
  assert.deepEqual(read(F.ACURITE_986).values, { temperature: 10.556, battery: 100 });
  assert.deepEqual(read(F.AMBIENT_F007TH).values, {
    temperature: 19.889,
    humidity: 35,
    battery: 0,
  });
});

test('numbered probes get numbered features', () => {
  assert.deepEqual(read(F.THERMOPRO_TP12).values, { temperature_1: 43.4, temperature_2: 24.3 });
  assert.equal(featureSpec('temperature_2').name, 'Temperature 2');
  assert.equal(featureSpec('temperature_2').category, C.TEMPERATURE_SENSOR);
});

test('weather stations: wind in km/h, rain, light, the UV index (never the raw uv)', () => {
  assert.deepEqual(read(F.WH24).values, {
    temperature: 11.8,
    humidity: 78,
    wind_speed: 4.032,
    wind_gust: 8.064,
    wind_direction: 266,
    rain: 22.2,
    light: 0,
    uv: 0,
    battery: 100,
  });
  assert.equal(read(F.WH65B).values.uv, 0, 'uvi, not the raw uv of 2');
  assert.equal(read(F.WH65B).values.wind_speed, 0, 'a calm 0 is a value');
  const whx080 = read(F.WHX080).values;
  assert.equal(whx080.wind_speed, 0);
  assert.equal(whx080.wind_gust, 2.448, 'km/h stays km/h');
  assert.equal(whx080.rain, 183.9);
  const bresser = read(F.BRESSER_7IN1).values;
  assert.equal(bresser.light, 54000, 'light_lux first, never light_klx on top');
  assert.equal(bresser.uv, 3, 'the UV feature is an integer index');
});

test('a station alternating two messages gives part of its values each time', () => {
  assert.deepEqual(Object.keys(read(F.BRESSER_6IN1_A).values).sort(), [
    'battery',
    'humidity',
    'temperature',
    'uv',
    'wind_direction',
    'wind_gust',
    'wind_speed',
  ]);
  assert.deepEqual(read(F.BRESSER_6IN1_B).values, {
    wind_speed: 15.12,
    wind_gust: 20.52,
    wind_direction: 267,
    rain: 0,
  });
});

test('a barometer, a soil probe with a fractional battery', () => {
  assert.equal(read(F.WH25).values.pressure, 1001.1);
  assert.deepEqual(read(F.WH51).values, { moisture: 81, battery: 50 });
});

test('energy meters: power, an energy index, a current clamp', () => {
  assert.deepEqual(read(F.OWL_CM180).values, { power: 370, energy: 155.784, battery: 100 });
  assert.deepEqual(read(F.OWL_CM160).values, { power: 273.7, energy: 273.641 });
  assert.deepEqual(read(F.EFERGY_E2).values, { current: 0.62, battery: 100 });
  assert.equal(featureSpec('energy').type, T.ENERGY_SENSOR.INDEX);
});

test('contacts: 1 = open (the Gladys convention), a tamper switch, no button', () => {
  const honeywell = read(F.HONEYWELL);
  assert.deepEqual(honeywell.values, { opening: 1, battery: 100, tamper: 1 });
  assert.equal(honeywell.button, undefined, 'its raw "event" code is not a press');
  assert.deepEqual(read(F.HONEYWELL_CLOSED).values, { opening: 0, battery: 100, tamper: 0 });
  const kerui = read(F.KERUI_DOOR);
  assert.deepEqual(kerui.values, { opening: 1 });
  assert.equal(kerui.button, undefined, 'the cmd of a contact is not a press');
  assert.deepEqual(read({ ...F.KERUI_DOOR, cmd: 7, opened: 0, state: 'close' }).values, {
    opening: 0,
  });
});

test('detectors that only say "detected" are pulses (set back to 0 later)', () => {
  const pir = read(F.KERUI_PIR);
  assert.deepEqual(pir.readings, [{ key: 'motion', state: 1, pulse: true }]);
  assert.equal(pir.values.opening, undefined, 'state "motion" is not a contact');
  assert.deepEqual(read(F.GENERIC_MOTION).readings, [{ key: 'motion', state: 1, pulse: true }]);
  assert.deepEqual(read(F.SMOKE_GS558).readings, [{ key: 'smoke', state: 1, pulse: true }]);
  assert.equal(read(F.SMOKE_GS558).button, undefined, 'its code is not a remote press');
  assert.deepEqual(read(F.GOVEE_LEAK).values, { leak: 1 });
  assert.deepEqual(read({ ...F.GOVEE_LEAK, detect_wet: 0 }).values, { leak: 0 });
});

test('remotes: one button per code, ON/OFF for switches', () => {
  assert.deepEqual(read(F.HCS200), {
    values: { battery: 100 },
    readings: [{ key: 'battery', state: 100 }],
    button: { code: '1', status: BUTTON_STATUS.CLICK },
  });
  assert.deepEqual(read(F.GENERIC_REMOTE).button, { code: '192', status: BUTTON_STATUS.CLICK });
  assert.deepEqual(read(F.NEXA).button, { code: '2', status: BUTTON_STATUS.OFF });
  assert.deepEqual(read(F.KAKU).button, { code: '0', status: BUTTON_STATUS.ON });
  assert.deepEqual(read(F.WAVEMAN).button, { code: '1', status: BUTTON_STATUS.ON });
  assert.deepEqual(buttonOf({ ...F.NEXA, group: 1 }), { code: 'group', status: BUTTON_STATUS.OFF });
  assert.equal(read(F.WH40).button, undefined, 'the raw data of a rain gauge is not a press');
  assert.equal(read(F.INTERLOGIX_CONTACT).button, undefined);
  assert.equal(buttonKey('1'), 'button_1');
  assert.equal(buttonKey(' 0Z01:x/y '), 'button_0Z01_x_y');
  assert.equal(featureSpec('button_192').category, C.BUTTON);
  assert.equal(featureSpec('button_192').name, 'Button 192');
});

test('TPMS: the tyre pressure in bar, never a barometer', () => {
  assert.deepEqual(read(F.TOYOTA_TPMS).values, { temperature: 29, tire_pressure: 2.361 });
  assert.deepEqual(read(F.RENAULT_TPMS).values, { temperature: 25, tire_pressure: 2.025 });
  assert.equal(featureSpec('tire_pressure').unit, U.BAR);
  // pressure_kPa without the TPMS type is a barometer, in hPa.
  assert.equal(read({ model: 'X', id: 1, pressure_kPa: 101.3 }).values.pressure, 1013);
});

test('implausible values are dropped, strings are read as numbers', () => {
  assert.deepEqual(read({ model: 'X', id: 1, humidity: 255, temperature_C: -3276.8 }).values, {});
  assert.deepEqual(read({ model: 'X', id: 1, temperature_C: '21.5', battery_ok: 1.7 }).values, {
    temperature: 21.5,
  });
  assert.deepEqual(read({ model: 'X', id: 1 }), { values: {}, readings: [], button: undefined });
});

test('measurements are throttled, events never', () => {
  for (const key of ['temperature', 'temperature_2', 'wind_speed', 'power', 'battery']) {
    assert.equal(isThrottled(key), true, key);
  }
  for (const key of ['opening', 'motion', 'leak', 'smoke', 'tamper', 'button_1']) {
    assert.equal(isThrottled(key), false, key);
  }
});

test('every feature is a valid, read-only Gladys feature', () => {
  const categories = Object.values(C);
  const types = Object.values(T).flatMap((group) => Object.values(group));
  const units = Object.values(U);
  for (const key of [...Object.keys(FEATURES), 'temperature_1', 'power_2', 'button_x']) {
    const f = featureSpec(key);
    assert.ok(categories.includes(f.category), `${key}: ${f.category}`);
    assert.ok(types.includes(f.type), `${key}: ${f.type}`);
    assert.ok(f.unit === undefined || units.includes(f.unit), `${key}: ${f.unit}`);
    assert.equal(f.read_only, true);
    assert.ok(f.min < f.max);
  }
  assert.equal(featureSpec('unknown_key'), undefined);
});
