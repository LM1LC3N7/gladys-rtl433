// -----------------------------------------------------------------------------
// The fallback without a broker: rtl_433's own HTTP server (`-F http`), whose
// `/events` endpoint streams the JSON events, one per line (chunked, CRLF, a
// bare CRLF every 60 s as a keep-alive).
//
// The client mimics the surface of an mqtt.js client (connect, message, error
// and close events, `connected`, `end()`), so the app reads both the same way.
// It reconnects by itself, and drops a link that stays silent too long.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { LIMITS, TIMINGS } from './constants.js';

export class HttpStreamClient extends EventEmitter {
  constructor(url, { fetch = globalThis.fetch, timers = globalThis } = {}) {
    super();
    this.url = url;
    this.fetch = fetch;
    this.timers = timers;
    this.connected = false;
    this.ended = false;
    this.controller = undefined;
    this.idleTimer = undefined;
    this.retryTimer = undefined;
    this.run();
  }

  /** mqtt.js compatibility: the stream needs no subscription. */
  subscribe(_topics, _options, callback) {
    callback?.(null, []);
  }

  end() {
    this.ended = true;
    this.connected = false;
    this.timers.clearTimeout(this.idleTimer);
    this.timers.clearTimeout(this.retryTimer);
    this.controller?.abort();
  }

  armIdle() {
    this.timers.clearTimeout(this.idleTimer);
    this.idleTimer = this.timers.setTimeout(() => {
      this.controller?.abort(new Error(`no data for ${TIMINGS.httpIdle / 1000} s`));
    }, TIMINGS.httpIdle);
  }

  async run() {
    const controller = new AbortController();
    this.controller = controller;
    try {
      this.armIdle();
      const res = await this.fetch(this.url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}`), { code: `HTTP ${res.status}` });
      }
      if (this.ended) {
        return;
      }
      this.connected = true;
      this.emit('connect');
      await this.read(res.body);
      throw new Error('rtl_433 closed the stream');
    } catch (err) {
      if (!this.ended) {
        // fetch() wraps the socket error (ECONNREFUSED, ENOTFOUND...) in `cause`.
        this.emit('error', controller.signal.reason ?? err.cause ?? err);
      }
    } finally {
      this.timers.clearTimeout(this.idleTimer);
    }
    if (this.ended) {
      return;
    }
    if (this.connected) {
      this.connected = false;
      this.emit('close');
    }
    this.retryTimer = this.timers.setTimeout(() => this.run(), TIMINGS.reconnectPeriod);
  }

  async read(body) {
    const decoder = new TextDecoder();
    let buffer = '';
    let skipping = false;
    for await (const chunk of body) {
      if (this.ended) {
        return;
      }
      this.armIdle();
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      let end = buffer.indexOf('\n');
      while (end >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (skipping) {
          skipping = false;
        } else if (line !== '') {
          this.emit('message', null, Buffer.from(line));
        }
        end = buffer.indexOf('\n');
      }
      if (buffer.length > LIMITS.payloadBytes) {
        // Not an rtl_433 event: drop it up to the next line.
        buffer = '';
        skipping = true;
      }
    }
  }
}

export const connectHttp = (config, options) => new HttpStreamClient(config.url, options);
