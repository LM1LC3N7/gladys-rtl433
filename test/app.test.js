// -----------------------------------------------------------------------------
// End to end: the real SDK wiring (src/handlers.js) against the SDK's fake
// Gladys, and a fake broker delivering real-looking rtl_433 events. Timers are
// mocked: the Discovery publication, the state flush, the alarm resets and
// the transport checks run when the test ticks.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { Rtl433App } from '../src/app.js';
import { ACTIONS, LIMITS, SCENE_TRIGGERS, TIMINGS } from '../src/constants.js';
import { registerHandlers } from '../src/handlers.js';
import * as F from './fixtures/events.js';
import { fakeConnector, settle } from './helpers/fakeMqtt.js';

const NEXUS = 'ext:test-integration:rtl433:Nexus-TH:id201:ch3';
const REMOTE = 'ext:test-integration:rtl433:Microchip-HCS200:id00D0921';
const TOPIC = 'rtl_433/pi/events';

async function setup(t, config = { server_url: '192.168.1.10' }, devices = []) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_760_000_000_000 });
  const gladys = createFakeGladys({ config, devices });
  const broker = fakeConnector();
  const app = new Rtl433App({
    gladys,
    connect: broker.connect,
    now: () => Date.now(),
    logger: createLogger({ level: 'silent' }),
  });
  registerHandlers(gladys, app);
  await gladys.connect();
  t.after(() => app.stop());
  const tick = async (ms) => {
    t.mock.timers.tick(ms);
    await settle();
  };
  const client = broker.clients[0];
  const hear = async (...events) => {
    for (const event of events) {
      client.deliver(TOPIC, F.json(event));
    }
    await settle();
  };
  return { gladys, app, broker, client, tick, hear };
}

/** Connects the broker, hears the events, lets the Discovery publication run. */
async function discover(ctx, ...events) {
  ctx.client.open();
  await settle();
  await ctx.hear(...events);
  await ctx.tick(TIMINGS.publishDebounce);
}

const deviceNamed = (gladys, name) => gladys.fake.discoveredDevices.find((d) => d.name === name);
const status = (gladys) => gladys.fake.connectionStatus.message.en;
const publications = (gladys) =>
  gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
const statesOf = (gladys, id) =>
  gladys.fake.states.filter((s) => s.device_feature_external_id === id).map((s) => s.state);

test('the sensors heard are offered in Discovery, values flow once created', async (t) => {
  const ctx = await setup(t);
  const { gladys, client } = ctx;
  assert.equal(client.config.url, 'mqtt://192.168.1.10');
  client.open();
  await settle();
  assert.deepEqual([...client.subscriptions], ['rtl_433/#']);
  assert.match(status(gladys), /Waiting for the first rtl_433 event on "rtl_433\/#"/);

  for (const [topic, payload] of F.NOT_EVENTS) {
    client.deliver(topic, payload);
  }
  await ctx.hear(F.NEXUS_TH, F.WH24, F.HONEYWELL);
  client.deliver('rtl_433/Oregon-CM180/15488', F.json(F.OWL_CM180)); // events=rtl_433[/model][/id]
  await ctx.tick(TIMINGS.publishDebounce);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    [
      'Fineoffset-WH24 191',
      'Honeywell-Security 698779 ch8',
      'Nexus-TH 201 ch3',
      'Oregon-CM180 15488',
    ],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(status(gladys), /4 sensors heard, 0 in Gladys/);

  // Before the device exists in Gladys, nothing is sent; its last values are kept.
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.states.length, 0);
  await gladys.fake.deviceCreated(deviceNamed(gladys, 'Nexus-TH 201 ch3'));
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.lastState(`${NEXUS}:temperature`), 29.4, 'the value heard before');
  assert.equal(gladys.fake.lastState(`${NEXUS}:battery`), 100);

  await ctx.hear({ ...F.NEXUS_TH, temperature_C: 30.1 });
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(
    gladys.fake.lastState(`${NEXUS}:temperature`),
    29.4,
    'a measurement waits for the sensor interval',
  );
  await ctx.tick(30_000);
  assert.equal(gladys.fake.lastState(`${NEXUS}:temperature`), 30.1);

  const contact = deviceNamed(gladys, 'Honeywell-Security 698779 ch8');
  await gladys.fake.deviceCreated(contact);
  await ctx.tick(TIMINGS.flushInterval);
  const opening = `${contact.external_id}:opening`;
  assert.equal(gladys.fake.lastState(opening), 1);
  await ctx.hear(F.HONEYWELL_CLOSED);
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.lastState(opening), 0, 'a contact is never delayed');
  assert.match(status(gladys), /4 sensors heard, 2 in Gladys/);
});

test('the Discovery list is published at most every 30 s', async (t) => {
  const ctx = await setup(t);
  const { gladys } = ctx;
  await discover(ctx, F.NEXUS_TH);
  assert.equal(publications(gladys), 1);
  await ctx.hear(F.NEXUS_TH, F.NEXUS_TH);
  await ctx.tick(TIMINGS.publishMinGap);
  assert.equal(publications(gladys), 1, 'nothing new: nothing published');
  await ctx.hear(F.WH25);
  await ctx.tick(TIMINGS.publishDebounce);
  assert.equal(publications(gladys), 2, 'the last one was long ago: published at once');
  await ctx.hear(F.WH51, { ...F.BRESSER_6IN1_B, id: 1 });
  await ctx.tick(TIMINGS.publishDebounce);
  await ctx.hear({ ...F.NEXUS_TH, id: 7 });
  await ctx.tick(TIMINGS.publishDebounce);
  assert.equal(publications(gladys), 2, 'the new sensors of the next 30 s wait...');
  await ctx.tick(TIMINGS.publishMinGap);
  assert.equal(publications(gladys), 3, '...and share one publication');
  assert.equal(gladys.fake.discoveredDevices.length, 5);
  // A scan from the Discovery screen publishes right away.
  await gladys.fake.scanRequest();
  assert.equal(publications(gladys), 4);
});

test('a sensor gains the features of its later messages', async (t) => {
  const ctx = await setup(t);
  const { gladys } = ctx;
  await discover(ctx, F.BRESSER_6IN1_A);
  const before = gladys.fake.discoveredDevices[0].features.length;
  await ctx.hear(F.BRESSER_6IN1_B);
  await ctx.tick(TIMINGS.publishMinGap);
  assert.equal(gladys.fake.discoveredDevices[0].features.length, before + 1, 'rain added');
});

test('a remote: one press per transmission, a button feature, the scene trigger', async (t) => {
  const ctx = await setup(t);
  const { gladys } = ctx;
  await discover(ctx, F.HCS200, F.HCS200, F.HCS200);
  const remote = deviceNamed(gladys, 'Microchip-HCS200 00D0921');
  assert.deepEqual(
    remote.features.map((f) => f.name),
    ['Battery', 'Button 1'],
  );
  assert.equal(gladys.fake.sceneEvents.length, 0, 'a remote not added fires nothing');

  await gladys.fake.deviceCreated(remote);
  await ctx.tick(TIMINGS.repeatWindow);
  await ctx.hear(F.HCS200, F.HCS200);
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.BUTTON,
      data: {
        device: REMOTE,
        code: '1',
        action: 'press',
        model: 'Microchip-HCS200',
        payload: F.json(F.HCS200),
      },
    },
  ]);
  await ctx.tick(TIMINGS.flushInterval);
  assert.deepEqual(statesOf(gladys, `${REMOTE}:button_1`), [1]);
  await ctx.tick(TIMINGS.repeatWindow);
  await ctx.hear(F.HCS200);
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.sceneEvents.length, 2);
  assert.deepEqual(statesOf(gladys, `${REMOTE}:button_1`), [1, 1], 'a second click is sent too');

  // A new button of a created remote: a new feature offered, the scene trigger at once.
  await ctx.hear({ ...F.HCS200, button: 2 });
  assert.equal(gladys.fake.sceneEvents.at(-1).data.code, '2');
  await ctx.tick(TIMINGS.publishMinGap);
  assert.deepEqual(
    deviceNamed(gladys, 'Microchip-HCS200 00D0921').features.map((f) => f.name),
    ['Battery', 'Button 1', 'Button 2'],
  );
});

test('ON/OFF switches give the action of the press', async (t) => {
  const ctx = await setup(t);
  const { gladys } = ctx;
  await discover(ctx, F.NEXA);
  await gladys.fake.deviceCreated(deviceNamed(gladys, 'Nexa-Security 25140614 ch1'));
  await ctx.hear(F.NEXA, { ...F.NEXA, state: 'ON' });
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => [e.data.code, e.data.action]),
    [
      ['2', 'off'],
      ['2', 'on'],
    ],
    'OFF then ON are two presses',
  );
  await ctx.tick(TIMINGS.flushInterval);
  const id = 'ext:test-integration:rtl433:Nexa-Security:id25140614:ch1:button_2';
  assert.deepEqual(statesOf(gladys, id), [8, 7]);
});

test('motion and smoke detectors go back to 0 by themselves', async (t) => {
  const ctx = await setup(t);
  const { gladys } = ctx;
  await discover(ctx, F.KERUI_PIR, F.SMOKE_GS558);
  const pir = deviceNamed(gladys, 'Kerui-Security 413107');
  await gladys.fake.deviceCreated(pir);
  await gladys.fake.deviceCreated(deviceNamed(gladys, 'Smoke-GS558 3403'));
  await ctx.hear(F.KERUI_PIR, F.SMOKE_GS558);
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.lastState(`${pir.external_id}:motion`), 1);
  await ctx.tick(TIMINGS.alarmReset / 2);
  await ctx.hear(F.KERUI_PIR);
  await ctx.tick(TIMINGS.alarmReset / 2);
  assert.equal(gladys.fake.lastState(`${pir.external_id}:motion`), 1, 'a new detection restarts');
  await ctx.tick(TIMINGS.alarmReset / 2);
  await ctx.tick(TIMINGS.flushInterval); // the flushes of one mocked tick share a promise
  assert.equal(gladys.fake.lastState(`${pir.external_id}:motion`), 0);
  assert.equal(gladys.fake.lastState('ext:test-integration:rtl433:Smoke-GS558:id3403:smoke'), 0);
});

test('tyre sensors are left out unless asked for', async (t) => {
  const ctx = await setup(t);
  const { gladys } = ctx;
  await discover(ctx, F.TOYOTA_TPMS, F.RENAULT_TPMS, F.NEXUS_TH);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Nexus-TH 201 ch3'],
  );
  const list = await gladys.fake.action(ACTIONS.LIST, {});
  assert.match(list.data.message.en, /2 tyre pressure sensors \(TPMS\) were left out/);

  await gladys.fake.configUpdated({ server_url: '192.168.1.10', include_tpms: true });
  const client = ctx.broker.clients.at(-1);
  client.open();
  client.deliver(TOPIC, F.json(F.TOYOTA_TPMS));
  await ctx.tick(TIMINGS.publishMinGap);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Nexus-TH 201 ch3', 'Toyota f0d5aee3'],
    'the sensors heard before the change are kept',
  );
  const toyota = deviceNamed(gladys, 'Toyota f0d5aee3');
  assert.deepEqual(
    toyota.features.map((f) => f.name),
    ['Temperature', 'Tyre pressure'],
  );
});

test('the list of the sensors heard helps to find yours', async (t) => {
  const ctx = await setup(t);
  const { gladys } = ctx;
  const empty = await gladys.fake.action(ACTIONS.LIST, {});
  assert.match(empty.data.message.en, /No sensor heard yet/);
  await discover(ctx, { ...F.NEXUS_TH, rssi: -0.123 });
  await ctx.tick(60_000);
  await ctx.hear(F.HCS200, { model: 'Mystery-Thing', id: 3, foo: 1 });
  await gladys.fake.deviceCreated(deviceNamed(gladys, 'Nexus-TH 201 ch3'));
  const { message: data } = (await gladys.fake.action(ACTIONS.LIST, {})).data;
  assert.deepEqual(data.en.split('\n'), [
    '3 sensors heard, most recent first:',
    '• Mystery-Thing 3: nothing supported yet. 1 message, last 0 s ago.',
    '• Microchip-HCS200 00D0921: battery 100 %, button 1. 1 message, last 0 s ago.',
    '• Nexus-TH 201 ch3: 29.4 °C, humidity 30 %, battery 100 %. 1 message, last 1 min ago, -0.1 dB, in Gladys.',
    'The strongest signal (dB closest to 0) is usually the nearest sensor: yours.',
  ]);
  assert.match(data.fr, /• Nexus-TH 201 ch3 : 29,4 °C, humidité 30 %, batterie 100 %\. 1 message/);
});

test('the connection test waits for a first rtl_433 event', async (t) => {
  const ctx = await setup(t);
  const { gladys, broker } = ctx;
  const probe = async (play) => {
    const pending = gladys.fake.action(ACTIONS.TEST, {});
    await settle();
    await play(broker.clients.at(-1));
    return (await pending).data.message.en;
  };
  assert.match(
    await probe(async (c) => {
      c.open();
      await ctx.tick(3000);
      c.deliver('rtl_433/pi/availability', 'online');
      c.deliver(TOPIC, F.json(F.NEXUS_TH));
    }),
    /^Connection OK: rtl_433 is sending \(Nexus-TH 201 ch3 heard after 3 s\)/,
  );
  assert.ok(broker.clients.at(-1).ended, 'the probe is closed');
  assert.ok(broker.clients.at(-1).subscriptions.has('rtl_433/#'));
  assert.match(
    await probe(async (c) => {
      c.open();
      await ctx.tick(TIMINGS.testListen);
    }),
    /no rtl_433 event on "rtl_433\/#" in 20 s/,
  );
  assert.match(
    await probe(async (c) => {
      c.open();
      c.deliver('rtl_433/pi/availability', 'offline');
      await ctx.tick(TIMINGS.testListen);
    }),
    /no event and rtl_433 says it is offline/,
  );
  assert.match(
    await probe(async (c) => {
      c.open();
      c.deliver('rtl_433/old/availability', 'offline');
      c.deliver(TOPIC, F.json(F.WH25));
    }),
    /^Connection OK/,
    'a stale "offline" of an old instance does not hide the events',
  );
  assert.match(
    await probe(async (c) => c.fail(Object.assign(new Error('Not authorized'), { code: 5 }))),
    /refused the connection: not authorized/,
  );
  assert.match(
    await probe(async () => ctx.tick(TIMINGS.connectTimeout + 1000)),
    /unreachable: timeout/,
  );
});

test('a missing or wrong address is said, nothing connects', async (t) => {
  const ctx = await setup(t, {});
  assert.equal(ctx.broker.clients.length, 0);
  assert.match(status(ctx.gladys), /Type the address of your MQTT broker/);
  const ack = await ctx.gladys.fake.action(ACTIONS.TEST, {});
  assert.match(ack.data.message.en, /Type the address/);
  await ctx.gladys.fake.configUpdated({ server_url: 'mqtt://me:secret@broker' });
  assert.match(status(ctx.gladys), /in their own fields/);
  assert.doesNotMatch(JSON.stringify(ctx.gladys.fake.connectionStatuses), /secret/);
});

test('the link status and the transport badges of the created devices', async (t) => {
  const devices = [
    { external_id: NEXUS, features: [{ external_id: `${NEXUS}:temperature` }] },
    { external_id: REMOTE, features: [{ external_id: `${REMOTE}:button_1` }] },
  ];
  const ctx = await setup(t, { server_url: '192.168.1.10' }, devices);
  const { gladys, client } = ctx;
  const badge = (id) => gladys.fake.transports.filter((e) => e.device_external_id === id).at(-1);
  client.fail(
    Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
      address: '192.168.1.10',
      port: 1883,
    }),
  );
  await settle();
  assert.match(status(gladys), /The MQTT broker is unreachable: ECONNREFUSED 192\.168\.1\.10:1883/);
  client.open();
  await ctx.hear(F.NEXUS_TH);
  assert.equal(badge(NEXUS).transport, DEVICE_TRANSPORTS.LOCAL);
  assert.equal(badge(REMOTE).transport, DEVICE_TRANSPORTS.LOCAL);
  await ctx.tick(TIMINGS.staleAfter + TIMINGS.staleCheck);
  assert.equal(badge(NEXUS).transport, DEVICE_TRANSPORTS.UNREACHABLE, 'silent for an hour');
  assert.equal(badge(REMOTE).transport, DEVICE_TRANSPORTS.LOCAL, 'a remote speaks when used');
  await ctx.hear(F.NEXUS_TH);
  assert.equal(badge(NEXUS).transport, DEVICE_TRANSPORTS.LOCAL);
  client.close();
  await settle();
  assert.equal(badge(REMOTE).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.match(status(gladys), /unreachable: connection lost/);
});

test('rtl_433 going offline shows in the status', async (t) => {
  const ctx = await setup(t);
  const { gladys, client } = ctx;
  await discover(ctx, F.NEXUS_TH);
  client.deliver('rtl_433/pi/availability', 'offline');
  await settle();
  assert.match(status(gladys), /rtl_433 says it is offline/);
  client.deliver('rtl_433/pi/availability', 'online');
  await settle();
  assert.match(status(gladys), /1 sensor heard/);
  // A second instance stopped for good (its last will stays retained), the first one goes on.
  client.deliver('rtl_433/attic/availability', 'offline');
  await settle();
  assert.match(status(gladys), /rtl_433 says it is offline/);
  await ctx.tick(1000);
  await ctx.hear(F.NEXUS_TH);
  assert.match(status(gladys), /1 sensor heard/, 'the events that keep coming win');
});

test('the HTTP fallback reads the same events, without subscribing', async (t) => {
  const ctx = await setup(t, { server_url: 'http://192.168.1.20:8433' });
  const { gladys, client } = ctx;
  assert.equal(client.config.kind, 'http');
  assert.equal(client.config.url, 'http://192.168.1.20:8433/events');
  client.open();
  client.deliver(null, F.json(F.WH25));
  await ctx.tick(TIMINGS.publishDebounce);
  assert.equal(client.subscriptions.size, 0);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Fineoffset-WH25 80'],
  );
  assert.match(status(gladys), /^Connected to rtl_433: 1 sensor heard/);
});

test('the memory stays bounded, a created sensor is never forgotten', async (t) => {
  const devices = [{ external_id: NEXUS, features: [{ external_id: `${NEXUS}:temperature` }] }];
  const ctx = await setup(t, { server_url: '192.168.1.10' }, devices);
  ctx.client.open();
  await ctx.hear(F.NEXUS_TH);
  for (let id = 0; id < LIMITS.sensors + 20; id += 1) {
    ctx.client.deliver(TOPIC, F.json({ ...F.WH25, id }));
  }
  await settle();
  assert.equal(ctx.app.sensors.size, LIMITS.sensors);
  assert.ok(ctx.app.sensors.has(NEXUS));
  // A day later, the sensors not heard again leave Discovery.
  await ctx.tick(TIMINGS.forgetAfter);
  await ctx.gladys.fake.scanRequest();
  assert.deepEqual(
    ctx.gladys.fake.discoveredDevices.map((d) => d.name),
    ['Nexus-TH 201 ch3'],
  );
});

test('a deleted device gets no more values', async (t) => {
  const ctx = await setup(t);
  const { gladys } = ctx;
  await discover(ctx, F.NEXUS_TH);
  const device = deviceNamed(gladys, 'Nexus-TH 201 ch3');
  await gladys.fake.deviceCreated(device);
  await gladys.fake.deviceDeleted(device);
  await ctx.hear({ ...F.NEXUS_TH, temperature_C: 12 });
  await ctx.tick(60_000);
  assert.equal(gladys.fake.lastState(`${NEXUS}:temperature`), undefined);
});
