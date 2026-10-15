import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GladysApiError } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { StatePublisher } from '../src/publisher.js';

const silent = { warn() {}, info() {}, debug() {}, error() {} };
const ID = (key) => `ext:test-integration:rtl433:X:${key}`;

async function setup({ budget, interval = 30, throttled = () => true } = {}) {
  const gladys = createFakeGladys();
  await gladys.connect();
  let now = 1_000_000;
  const publisher = new StatePublisher({ gladys, logger: silent, now: () => now, budget });
  publisher.configure({ intervalSeconds: interval, isThrottled: throttled });
  return { gladys, publisher, advance: (ms) => (now += ms) };
}

test('the last value of a feature is sent, then spaced by the interval', async () => {
  const { gladys, publisher, advance } = await setup();
  publisher.push(ID('temperature'), { state: 20 });
  publisher.push(ID('temperature'), { state: 21 });
  assert.equal(await publisher.flush(), 1);
  assert.equal(gladys.fake.lastState(ID('temperature')), 21);
  publisher.push(ID('temperature'), { state: 22 });
  advance(10_000);
  assert.equal(await publisher.flush(), 0, 'within the interval: kept pending');
  advance(20_000);
  assert.equal(await publisher.flush(), 1);
  assert.equal(gladys.fake.lastState(ID('temperature')), 22);
  publisher.push(ID('temperature'), { state: 22 });
  advance(30_000);
  assert.equal(await publisher.flush(), 0, 'unchanged: not sent again');
});

test('presses are all sent, never deduplicated, before the values', async () => {
  const { gladys, publisher } = await setup();
  publisher.push(ID('battery'), { state: 100 });
  publisher.pushEvent(ID('button_1'), 1);
  publisher.pushEvent(ID('button_1'), 1);
  assert.equal(await publisher.flush(), 3);
  const sent = gladys.fake.states.map((s) => [s.device_feature_external_id, s.state]);
  assert.deepEqual(sent, [
    [ID('button_1'), 1],
    [ID('button_1'), 1],
    [ID('battery'), 100],
  ]);
});

test('the budget per minute is shared by presses and values', async () => {
  const { gladys, publisher, advance } = await setup({ budget: 2 });
  publisher.pushEvent(ID('button_1'), 1);
  publisher.push(ID('a'), { state: 1 });
  publisher.push(ID('b'), { state: 2 });
  assert.equal(await publisher.flush(), 2);
  assert.equal(await publisher.flush(), 0, 'budget spent');
  advance(60_000);
  assert.equal(await publisher.flush(), 1);
  assert.equal(gladys.fake.states.length, 3);
});

test('a failed request keeps the values; a refused press is dropped', async (t) => {
  const { gladys, publisher } = await setup();
  const fail = t.mock.method(gladys, 'publishChangedStates', async () => {
    throw new GladysApiError(429, 'TOO_MANY_REQUESTS', 'RATE_LIMIT_EXCEEDED');
  });
  publisher.push(ID('a'), { state: 1 });
  await assert.rejects(publisher.flush());
  fail.mock.restore();
  assert.equal(await publisher.flush(), 1);
  t.mock.method(gladys, 'publishStates', async () => {
    throw new GladysApiError(400, 'BAD_REQUEST', 'unknown feature');
  });
  publisher.pushEvent(ID('button_1'), 1);
  await assert.rejects(publisher.flush());
  assert.equal(publisher.events.length, 0);
});

test('forgetting a deleted device drops its pending values and presses', async () => {
  const { publisher } = await setup();
  publisher.push(ID('a'), { state: 1 });
  publisher.push('ext:test-integration:rtl433:Y:a', { state: 1 });
  publisher.pushEvent(ID('button_1'), 1);
  publisher.forget('ext:test-integration:rtl433:X');
  assert.deepEqual([...publisher.pending.keys()], ['ext:test-integration:rtl433:Y:a']);
  assert.equal(publisher.events.length, 0);
});
