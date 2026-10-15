import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalizeConfig, normalizeTopic, parseServerUrl } from '../src/config.js';
import { SENSOR_INTERVAL } from '../src/constants.js';

test('the address: a broker by default, rtl_433 itself over http', () => {
  assert.deepEqual(parseServerUrl('192.168.1.10'), { kind: 'mqtt', url: 'mqtt://192.168.1.10' });
  assert.deepEqual(parseServerUrl(' mqtts://broker.lan:8883 '), {
    kind: 'mqtt',
    url: 'mqtts://broker.lan:8883',
  });
  assert.deepEqual(parseServerUrl('ws://10.0.0.2:9001/mqtt'), {
    kind: 'mqtt',
    url: 'ws://10.0.0.2:9001/mqtt',
  });
  assert.deepEqual(parseServerUrl('http://192.168.1.20:8433'), {
    kind: 'http',
    url: 'http://192.168.1.20:8433/events',
  });
  assert.deepEqual(parseServerUrl('http://192.168.1.20:8433/stream'), {
    kind: 'http',
    url: 'http://192.168.1.20:8433/stream',
  });
  assert.deepEqual(parseServerUrl(''), { error: 'empty' });
  assert.deepEqual(parseServerUrl('ftp://x'), { error: 'invalid' });
  assert.deepEqual(parseServerUrl('mqtt://'), { error: 'invalid' });
  assert.deepEqual(parseServerUrl('mqtt://u:p@host'), { error: 'credentials' });
});

test('the topic filter', () => {
  assert.equal(normalizeTopic('rtl_433/+/events'), 'rtl_433/+/events');
  assert.equal(normalizeTopic(' rtl_433/# '), 'rtl_433/#');
  assert.equal(normalizeTopic('#'), '#');
  for (const bad of ['', 'rtl_433/#/x', 'rtl_433/a+', 'rtl#', null]) {
    assert.equal(normalizeTopic(bad), DEFAULTS.topic, String(bad));
  }
});

test('the configuration, normalized', () => {
  assert.deepEqual(normalizeConfig(), {
    kind: undefined,
    url: undefined,
    urlError: 'empty',
    username: '',
    password: '',
    topic: 'rtl_433/#',
    verifyCertificate: true,
    includeTpms: false,
    sensorInterval: SENSOR_INTERVAL.default,
  });
  const c = normalizeConfig({
    server_url: '10.0.0.5',
    username: ' me ',
    password: ' s3cret ',
    topic: null,
    verify_certificate: false,
    include_tpms: true,
    sensor_interval: '99999',
  });
  assert.equal(c.url, 'mqtt://10.0.0.5');
  assert.equal(c.username, 'me');
  assert.equal(c.password, ' s3cret ', 'a password is never trimmed');
  assert.equal(c.topic, 'rtl_433/#');
  assert.equal(c.verifyCertificate, false);
  assert.equal(c.includeTpms, true);
  assert.equal(c.sensorInterval, SENSOR_INTERVAL.max);
  assert.equal(normalizeConfig({ sensor_interval: 'abc' }).sensorInterval, 30);
  assert.equal(normalizeConfig({ sensor_interval: -5 }).sensorInterval, 0);
});
