// -----------------------------------------------------------------------------
// The configuration of the manifest `config_schema`, normalized.
// -----------------------------------------------------------------------------

import { SENSOR_INTERVAL } from './constants.js';

/** Defaults, mirrored by the manifest (checked by test/manifest.test.js). */
export const DEFAULTS = {
  server_url: '',
  username: '',
  password: '',
  topic: 'rtl_433/#',
  verify_certificate: true,
  include_tpms: false,
  sensor_interval: SENSOR_INTERVAL.default,
};

const MQTT_SCHEMES = ['mqtt:', 'mqtts:', 'ws:', 'wss:', 'tcp:', 'ssl:'];
const HTTP_SCHEMES = ['http:', 'https:'];

/**
 * Where rtl_433 is read: an MQTT broker ("192.168.1.10" -> "mqtt://192.168.1.10"),
 * or rtl_433's own HTTP server ("http://192.168.1.20:8433" -> ".../events").
 * @returns {{ kind: 'mqtt' | 'http', url: string } | { error: string }}
 */
export function parseServerUrl(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') {
    return { error: 'empty' };
  }
  const withScheme = /^[a-z]+:\/\//i.test(text) ? text : `mqtt://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: 'invalid' };
  }
  const kind = MQTT_SCHEMES.includes(url.protocol)
    ? 'mqtt'
    : HTTP_SCHEMES.includes(url.protocol)
      ? 'http'
      : undefined;
  if (!kind || !url.hostname) {
    return { error: 'invalid' };
  }
  if (url.username || url.password) {
    // Credentials belong to their own fields (the secret one is never shown again).
    return { error: 'credentials' };
  }
  if (kind === 'http' && (url.pathname === '' || url.pathname === '/')) {
    // The chunked stream of JSON events (one per line) of `rtl_433 -F http`.
    url.pathname = '/events';
  }
  return { kind, url: url.toString().replace(/\/$/, '') };
}

/** An MQTT topic filter: `+` alone in its level, `#` last. Anything else -> the default. */
export function normalizeTopic(raw) {
  const text = String(raw ?? '').trim();
  const levels = text.split('/');
  const valid =
    text !== '' &&
    levels.every(
      (level, i) =>
        (!level.includes('+') || level === '+') &&
        (!level.includes('#') || (level === '#' && i === levels.length - 1)),
    );
  return valid ? text : DEFAULTS.topic;
}

export function normalizeConfig(raw = {}) {
  const given = Object.fromEntries(
    Object.entries(raw ?? {}).filter(([, v]) => v !== null && v !== undefined),
  );
  const c = { ...DEFAULTS, ...given };
  const server = parseServerUrl(c.server_url);
  const interval = Number(c.sensor_interval);
  return {
    kind: server.kind,
    url: server.url,
    urlError: server.error,
    username: String(c.username ?? '').trim(),
    password: String(c.password ?? ''),
    topic: normalizeTopic(c.topic),
    verifyCertificate: c.verify_certificate !== false,
    includeTpms: c.include_tpms === true,
    sensorInterval: Number.isFinite(interval)
      ? Math.max(SENSOR_INTERVAL.min, Math.min(SENSOR_INTERVAL.max, Math.round(interval)))
      : SENSOR_INTERVAL.default,
  };
}
