// -----------------------------------------------------------------------------
// The sensors heard -> the Gladys devices of the Discovery tab (pure).
//
// A sensor record (kept by the app) carries its identity and the feature keys
// its events ever carried: a weather station alternating two messages, or a
// remote whose buttons are pressed one after the other, gathers them all.
// -----------------------------------------------------------------------------

import { DEVICE_TYPE } from './constants.js';
import { featureSpec } from './mapping.js';

/** Feature order on the device card: measurements first, buttons last. */
const ORDER = [
  'temperature',
  'humidity',
  'moisture',
  'pressure',
  'tire_pressure',
  'wind_speed',
  'wind_gust',
  'wind_direction',
  'rain',
  'rain_rate',
  'light',
  'uv',
  'power',
  'energy',
  'current',
  'voltage',
  'opening',
  'motion',
  'leak',
  'smoke',
  'tamper',
  'battery',
];

const rank = (key) => {
  const base = key.replace(/_\d+$/, '');
  const i = ORDER.indexOf(base);
  return i >= 0 ? i : ORDER.length;
};

export const sortKeys = (keys) =>
  [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en', { numeric: true }));

const param = (name, value) =>
  value === undefined || value === null ? [] : [{ name, value: String(value).slice(0, 100) }];

/** The external ids of a sensor. */
export const idsOf = (gladys, sensor) => gladys.externalIds(DEVICE_TYPE, sensor.platformId);

/** One Gladys device per sensor that has at least one supported feature. */
export function buildDevices(gladys, sensors) {
  const devices = [];
  for (const sensor of sensors) {
    const ids = idsOf(gladys, sensor);
    const features = [];
    for (const key of sortKeys(sensor.keys)) {
      const spec = featureSpec(key);
      if (spec) {
        features.push({ ...spec, external_id: ids.feature(key) });
      }
    }
    if (features.length === 0) {
      continue;
    }
    devices.push({
      name: sensor.name,
      external_id: ids.device,
      features,
      params: [
        ...param('model', sensor.model),
        ...param('id', sensor.id),
        ...param('channel', sensor.channel),
        ...param('protocol', sensor.protocol),
      ],
      should_poll: false,
    });
  }
  return devices.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}
