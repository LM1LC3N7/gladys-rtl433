// -----------------------------------------------------------------------------
// One rtl_433 message -> an event and the identity of its sensor (pure).
//
// rtl_433 prints one flat JSON object per decoded radio message ("time",
// "model", "id", "channel", then the decoder's fields). Its MQTT output also
// publishes other things on nearby topics (one value per topic with
// `devices=`, receiver stats with `states=`, "online"/"offline" on
// `availability`): only a JSON object with a "model" is an event.
// -----------------------------------------------------------------------------

/** A JSON object with a model, or null (anything else rtl_433 publishes). */
export function parseEvent(payload) {
  const text = (Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload ?? '')).trim();
  if (!text.startsWith('{')) {
    return null;
  }
  let event;
  try {
    event = JSON.parse(text);
  } catch {
    return null;
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }
  return typeof event.model === 'string' && event.model.trim() !== '' ? event : null;
}

/** A value an identity can be made of: a number or a non-empty string. */
export const present = (v) =>
  (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '');

const part = (v) =>
  String(v)
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 40);

/**
 * The sensor an event comes from: one per model + id (+ channel).
 * `platformId` builds the external ids, FOREVER: "Nexus-TH:id201:ch3".
 */
export function identify(event) {
  const model = event.model.trim();
  const id = present(event.id) ? event.id : undefined;
  const channel = present(event.channel) ? event.channel : undefined;
  const platformId = [
    part(model),
    id !== undefined ? `id${part(id)}` : null,
    channel !== undefined ? `ch${part(channel)}` : null,
  ]
    .filter(Boolean)
    .join(':');
  const name = [model, id, channel !== undefined ? `ch${channel}` : undefined]
    .filter((p) => p !== undefined)
    .join(' ')
    .slice(0, 100);
  return { platformId, model, id, channel, name, tpms: event.type === 'TPMS' };
}

/** The signal level rtl_433 adds with `-M level` (dB), or undefined. */
export const rssiOf = (event) =>
  typeof event.rssi === 'number' && Number.isFinite(event.rssi)
    ? Math.round(event.rssi * 10) / 10
    : undefined;

/** The raw event, for a scene variable (bounded). */
export const rawOf = (event, max) => JSON.stringify(event).slice(0, max);
