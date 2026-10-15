// -----------------------------------------------------------------------------
// The HTTP stream of `rtl_433 -F http` (/events: one JSON event per line, CRLF,
// a bare CRLF as keep-alive), read through a fake fetch.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMINGS } from '../src/constants.js';
import { HttpStreamClient } from '../src/http.js';
import { settle } from './helpers/fakeMqtt.js';
import * as F from './fixtures/events.js';

/** A response body fed by the test, chunk by chunk. */
function controllableBody() {
  const queue = [];
  let wake;
  let done = false;
  const body = {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (queue.length > 0) {
          yield queue.shift();
        } else if (done) {
          return;
        } else {
          await new Promise((resolve) => {
            wake = resolve;
          });
        }
      }
    },
  };
  return {
    body,
    push(text) {
      queue.push(new TextEncoder().encode(text));
      wake?.();
    },
    end() {
      done = true;
      wake?.();
    },
  };
}

function fakeFetch(responses) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (next instanceof Error) {
      throw next;
    }
    options.signal.addEventListener('abort', () => next.stream?.end());
    return { ok: next.status === 200, status: next.status, body: next.stream?.body };
  };
  return { fetch, calls };
}

function collect(client) {
  const seen = { connect: 0, close: 0, messages: [], errors: [] };
  client.on('connect', () => (seen.connect += 1));
  client.on('close', () => (seen.close += 1));
  client.on('error', (err) => seen.errors.push(err));
  client.on('message', (topic, payload) => seen.messages.push([topic, payload.toString()]));
  return seen;
}

test('events split across chunks, CRLF and keep-alives', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stream = controllableBody();
  const { fetch, calls } = fakeFetch([{ status: 200, stream }]);
  const client = new HttpStreamClient('http://10.0.0.2:8433/events', { fetch });
  const seen = collect(client);
  await settle();
  assert.equal(calls[0].url, 'http://10.0.0.2:8433/events');
  assert.equal(client.connected, true);
  assert.equal(seen.connect, 1);
  const line = F.json(F.NEXUS_TH);
  stream.push(line.slice(0, 20));
  stream.push(`${line.slice(20)}\r\n\r\n`);
  stream.push(`${F.json(F.WH24)}\r\n${F.json(F.OWL_CM180).slice(0, 10)}`);
  await settle();
  assert.deepEqual(seen.messages, [
    [null, line],
    [null, F.json(F.WH24)],
  ]);
  client.end();
});

test('an oversized line is skipped, the next one is read', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stream = controllableBody();
  const { fetch } = fakeFetch([{ status: 200, stream }]);
  const client = new HttpStreamClient('http://x/events', { fetch });
  const seen = collect(client);
  await settle();
  stream.push('x'.repeat(20_000));
  stream.push(`yyy\r\n${F.json(F.NEXUS_TH)}\r\n`);
  await settle();
  assert.deepEqual(seen.messages, [[null, F.json(F.NEXUS_TH)]]);
  client.end();
});

test('errors are reported, and the client reconnects by itself', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const refused = Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
  });
  const stream = controllableBody();
  const { fetch, calls } = fakeFetch([refused, { status: 404 }, { status: 200, stream }]);
  const client = new HttpStreamClient('http://x/events', { fetch });
  const seen = collect(client);
  await settle();
  assert.equal(seen.errors[0].code, 'ECONNREFUSED', 'the socket error, not "fetch failed"');
  t.mock.timers.tick(TIMINGS.reconnectPeriod);
  await settle();
  assert.equal(seen.errors[1].code, 'HTTP 404');
  t.mock.timers.tick(TIMINGS.reconnectPeriod);
  await settle();
  assert.equal(calls.length, 3);
  assert.equal(seen.connect, 1);
  stream.end();
  await settle();
  assert.equal(seen.close, 1, 'rtl_433 stopped: closed, then retried');
  assert.match(seen.errors[2].message, /closed the stream/);
  client.end();
});

test('a silent link is dropped after the idle delay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stream = controllableBody();
  const { fetch } = fakeFetch([{ status: 200, stream }, new Error('stop')]);
  const client = new HttpStreamClient('http://x/events', { fetch });
  const seen = collect(client);
  await settle();
  t.mock.timers.tick(TIMINGS.httpIdle);
  await settle();
  assert.match(seen.errors[0].message, /no data for 150 s/);
  assert.equal(seen.close, 1);
  client.end();
});

test('end() stops for good', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stream = controllableBody();
  const { fetch, calls } = fakeFetch([{ status: 200, stream }]);
  const client = new HttpStreamClient('http://x/events', { fetch });
  const seen = collect(client);
  await settle();
  client.end();
  await settle();
  t.mock.timers.tick(TIMINGS.reconnectPeriod * 2);
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(seen.errors.length, 0);
  assert.equal(client.connected, false);
});
