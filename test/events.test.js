import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identify, parseEvent, rawOf, rssiOf } from '../src/events.js';
import * as F from './fixtures/events.js';

test('only a JSON object with a model is an event', () => {
  assert.deepEqual(parseEvent(Buffer.from(F.json(F.NEXUS_TH))), F.NEXUS_TH);
  assert.deepEqual(parseEvent(` ${F.json(F.WH24)}\r\n`), F.WH24);
  for (const [, payload] of F.NOT_EVENTS) {
    assert.equal(parseEvent(Buffer.from(payload)), null, payload);
  }
  assert.equal(parseEvent('{"model":"X",'), null);
  assert.equal(parseEvent(undefined), null);
});

test('one sensor per model + id (+ channel), for ever', () => {
  assert.deepEqual(identify(F.NEXUS_TH), {
    platformId: 'Nexus-TH:id201:ch3',
    model: 'Nexus-TH',
    id: 201,
    channel: 3,
    name: 'Nexus-TH 201 ch3',
    tpms: false,
  });
  assert.equal(identify(F.ACURITE_TOWER).platformId, 'Acurite-Tower:id12053:chC');
  assert.equal(identify(F.OWL_CM180).platformId, 'Oregon-CM180:id15488');
  assert.equal(identify(F.OWL_CM180).name, 'Oregon-CM180 15488');
  assert.equal(identify(F.GENERIC_MOTION).platformId, 'Generic-Motion');
  assert.equal(identify(F.BRESSER_6IN1_A).platformId, 'Bresser-6in1:id411042499:ch0');
  assert.equal(
    identify(F.BRESSER_6IN1_A).platformId,
    identify(F.BRESSER_6IN1_B).platformId,
    'both messages of a station are one sensor',
  );
  assert.equal(identify(F.TOYOTA_TPMS).tpms, true);
  assert.equal(identify({ model: 'A b/c', id: 'x:y' }).platformId, 'A_b_c:idx_y');
  assert.equal(identify({ model: 'X', id: '', channel: null }).platformId, 'X');
});

test('signal level and raw payload', () => {
  assert.equal(rssiOf({ rssi: -12.345 }), -12.3);
  assert.equal(rssiOf({}), undefined);
  assert.equal(rawOf(F.NEXUS_TH, 20), F.json(F.NEXUS_TH).slice(0, 20));
});
