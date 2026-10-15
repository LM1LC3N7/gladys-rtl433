import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDevices, sortKeys } from '../src/devices.js';
import { identify } from '../src/events.js';
import { buttonKey, readEvent } from '../src/mapping.js';
import * as F from './fixtures/events.js';

/** A sensor record as the app keeps it, from its events. */
function sensorOf(...events) {
  const keys = new Set();
  for (const event of events) {
    const { readings, button } = readEvent(event);
    readings.forEach((r) => keys.add(r.key));
    if (button) {
      keys.add(buttonKey(button.code));
    }
  }
  return { ...identify(events[0]), keys };
}

test('one device per sensor, valid for Gladys, features in a stable order', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  const sensors = [
    sensorOf(F.NEXUS_TH),
    sensorOf(F.BRESSER_6IN1_A, F.BRESSER_6IN1_B),
    sensorOf(F.OWL_CM180),
    sensorOf(F.HONEYWELL),
    sensorOf(F.NEXA, { ...F.NEXA, unit: 3, state: 'ON' }),
    sensorOf(F.TOYOTA_TPMS),
    sensorOf(F.INTERLOGIX_CONTACT),
    sensorOf(F.THERMOPRO_TP12),
    { ...identify({ model: 'Unknown-Thing', id: 1 }), keys: new Set() },
  ];
  const devices = buildDevices(gladys, sensors);
  // The fake Gladys checks the categories, types and units like the core does.
  await gladys.publishDiscoveredDevices(devices);
  assert.deepEqual(
    devices.map((d) => d.name),
    [
      'Bresser-6in1 411042499 ch0',
      'Honeywell-Security 698779 ch8',
      'Interlogix-Security a7106d',
      'Nexa-Security 25140614 ch1',
      'Nexus-TH 201 ch3',
      'Oregon-CM180 15488',
      'Thermopro-TP12 56',
      'Toyota f0d5aee3',
    ],
    'a sensor without any supported feature is not offered',
  );
  const nexus = devices.find((d) => d.name === 'Nexus-TH 201 ch3');
  assert.equal(nexus.external_id, 'ext:test-integration:rtl433:Nexus-TH:id201:ch3');
  assert.deepEqual(
    nexus.features.map((f) => f.external_id.split(':').pop()),
    ['temperature', 'humidity', 'battery'],
  );
  assert.deepEqual(nexus.params, [
    { name: 'model', value: 'Nexus-TH' },
    { name: 'id', value: '201' },
    { name: 'channel', value: '3' },
  ]);
  assert.equal(nexus.should_poll, false);
  const bresser = devices.find((d) => d.name.startsWith('Bresser'));
  assert.equal(bresser.features.length, 8, 'both messages of the station, gathered');
  const nexa = devices.find((d) => d.name.startsWith('Nexa'));
  assert.deepEqual(
    nexa.features.map((f) => f.name),
    ['Button 2', 'Button 3'],
  );
});

test('the feature order: measurements, states, battery, then buttons', () => {
  assert.deepEqual(
    sortKeys(['button_10', 'battery', 'button_2', 'opening', 'temperature_2', 'temperature', 'x']),
    ['temperature', 'temperature_2', 'opening', 'battery', 'button_2', 'button_10', 'x'],
  );
});
