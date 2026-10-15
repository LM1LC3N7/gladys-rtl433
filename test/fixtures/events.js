// -----------------------------------------------------------------------------
// rtl_433 events as its MQTT output prints them (`events=` topic, doubles with
// the trailing zeros trimmed). The values come from the expected outputs of
// the rtl_433_tests repository (tests/<device>/...json), the keys and their
// order from the decoders (rtl_433 src/devices/*.c). Two are marked "synth":
// no test file exists, the keys come from the decoder, the values are made up.
// -----------------------------------------------------------------------------

const TIME = '2026-10-15 13:41:07';

// --- Thermometers / hygrometers ---

/** tests/nexus/03 (src/devices/nexus.c) */
export const NEXUS_TH = {
  time: TIME,
  model: 'Nexus-TH',
  id: 201,
  channel: 3,
  battery_ok: 1,
  temperature_C: 29.4,
  humidity: 30,
};

/** tests/lacrosse/tx141th-bv2 (src/devices/lacrosse_tx141x.c) */
export const LACROSSE_TX141 = {
  time: TIME,
  model: 'LaCrosse-TX141THBv2',
  id: 231,
  channel: 1,
  battery_ok: 1,
  temperature_C: -20,
  humidity: 10,
  test: 'No',
  mic: 'CRC',
};

/** tests/acurite/Acurite_592TXR: the channel is a letter. */
export const ACURITE_TOWER = {
  time: TIME,
  model: 'Acurite-Tower',
  id: 12053,
  channel: 'C',
  battery_ok: 1,
  temperature_C: 26.7,
  humidity: 74,
  mic: 'CHECKSUM',
};

/** tests/acurite/Acurite_986: Fahrenheit only, channel "1R". */
export const ACURITE_986 = {
  time: TIME,
  model: 'Acurite-986',
  id: 17021,
  channel: '1R',
  battery_ok: 1,
  temperature_F: 51.0,
  status: 0,
  mic: 'CRC',
};

/** tests/ambient_weather/01: Fahrenheit, battery LOW. */
export const AMBIENT_F007TH = {
  time: TIME,
  model: 'Ambientweather-F007TH',
  id: 37,
  channel: 5,
  battery_ok: 0,
  temperature_F: 67.8,
  humidity: 35,
  mic: 'CRC',
};

/** tests/thermopro-tp12: two probes. */
export const THERMOPRO_TP12 = {
  time: TIME,
  model: 'Thermopro-TP12',
  id: 56,
  temperature_1_C: 43.4,
  temperature_2_C: 24.3,
  mic: 'CRC',
};

// --- Weather stations ---

/** tests/fineoffset/fineoffset_wh65b: `uv` is raw, `uvi` the index. */
export const WH65B = {
  time: TIME,
  model: 'Fineoffset-WH65B',
  id: 80,
  battery_ok: 1,
  temperature_C: 24.7,
  humidity: 65,
  wind_dir_deg: 359,
  wind_avg_m_s: 0,
  wind_max_m_s: 0,
  rain_mm: 0.254,
  uv: 2,
  uvi: 0,
  light_lux: 0,
  mic: 'CRC',
};

/** tests/fineoffset/fineoffset_wh24 */
export const WH24 = {
  time: TIME,
  model: 'Fineoffset-WH24',
  id: 191,
  battery_ok: 1,
  temperature_C: 11.8,
  humidity: 78,
  wind_dir_deg: 266,
  wind_avg_m_s: 1.12,
  wind_max_m_s: 2.24,
  rain_mm: 22.2,
  uv: 1,
  uvi: 0,
  light_lux: 0,
  mic: 'CRC',
};

/** tests/fineoffset/fineoffset_wh1080: wind in km/h. */
export const WHX080 = {
  time: TIME,
  model: 'Fineoffset-WHx080',
  subtype: 0,
  id: 5,
  battery_ok: 1,
  temperature_C: 7.4,
  humidity: 82,
  wind_dir_deg: 315,
  wind_avg_km_h: 0,
  wind_max_km_h: 2.448,
  rain_mm: 183.9,
  mic: 'CRC',
};

/** tests/bresser_6in1/01/g002: the wind/temperature message... */
export const BRESSER_6IN1_A = {
  time: TIME,
  model: 'Bresser-6in1',
  id: 411042499,
  channel: 0,
  battery_ok: 0,
  temperature_C: 11.8,
  humidity: 81,
  sensor_type: 1,
  wind_max_m_s: 5.7,
  wind_avg_m_s: 4.0,
  wind_dir_deg: 276,
  uvi: 0,
  startup: 1,
  flags: 0,
  mic: 'CRC',
};

/** ...and tests/bresser_6in1/01/g004: the rain message of the same station. */
export const BRESSER_6IN1_B = {
  time: TIME,
  model: 'Bresser-6in1',
  id: 411042499,
  channel: 0,
  sensor_type: 1,
  wind_max_m_s: 5.7,
  wind_avg_m_s: 4.2,
  wind_dir_deg: 267,
  rain_mm: 0,
  startup: 1,
  flags: 1,
  mic: 'CRC',
};

/** synth (src/devices/bresser_7in1.c): light in klx AND lux, a decimal UV index. */
export const BRESSER_7IN1 = {
  time: TIME,
  model: 'Bresser-7in1',
  id: 11530,
  temperature_C: 12.3,
  humidity: 67,
  wind_max_m_s: 3.2,
  wind_avg_m_s: 2.1,
  wind_dir_deg: 225,
  rain_mm: 13.6,
  light_klx: 54.0,
  light_lux: 54000.0,
  uvi: 2.6,
  battery_ok: 1,
  mic: 'CRC',
};

/** tests/fineoffset/fineoffset_wh25: a barometer. */
export const WH25 = {
  time: TIME,
  model: 'Fineoffset-WH25',
  id: 80,
  battery_ok: 1,
  temperature_C: 23.2,
  humidity: 57,
  pressure_hPa: 1001.1,
  mic: 'CRC',
};

/** tests/EcoWitt-WH40: a rain gauge whose raw `data` is not a remote code. */
export const WH40 = {
  time: TIME,
  model: 'EcoWitt-WH40',
  id: 52591,
  battery_V: 1.6,
  battery_ok: 1.0,
  rain_mm: 0,
  data: '0001de00b0',
  mic: 'CRC',
};

/** tests/fineoffset/fineoffset_wh51: soil moisture, a fractional battery, a string id. */
export const WH51 = {
  time: TIME,
  model: 'Fineoffset-WH51',
  id: '00c4ae',
  battery_ok: 0.5,
  battery_mV: 1400,
  moisture: 81,
  boost: 0,
  ad_raw: 354,
  mic: 'CRC',
};

// --- Energy ---

/** tests/owl-cm180: OWL CM180. */
export const OWL_CM180 = {
  time: TIME,
  model: 'Oregon-CM180',
  id: 15488,
  battery_ok: 1,
  power_W: 370,
  energy_kWh: 155.784,
  sequence: 0,
  mic: 'CHECKSUM',
};

/** tests/owl-cm160/01 */
export const OWL_CM160 = {
  time: TIME,
  model: 'Oregon-CM160',
  id: 15,
  power_W: 273.7,
  energy_kWh: 273.641,
  mic: 'CHECKSUM',
};

/** tests/efergy_e2_classic/01: a current clamp, in amps. */
export const EFERGY_E2 = {
  time: TIME,
  model: 'Efergy-e2CT',
  id: 59956,
  battery_ok: 1,
  current: 0.62,
  interval: 6,
  learn: 'NO',
  mic: 'CHECKSUM',
};

// --- Security ---

/** tests/honeywell/01: a contact, its tamper switch, a raw `event` code. */
export const HONEYWELL = {
  time: TIME,
  model: 'Honeywell-Security',
  id: 698779,
  channel: 8,
  event: 192,
  state: 'open',
  contact_open: 1,
  reed_open: 0,
  alarm: 0,
  tamper: 1,
  battery_ok: 1,
  heartbeat: 0,
  mic: 'CRC',
};

/** The same contact, closed (the decoder's other state). */
export const HONEYWELL_CLOSED = {
  ...HONEYWELL,
  event: 128,
  state: 'closed',
  contact_open: 0,
  tamper: 0,
};

/** tests/Kerui-D026/01: a door contact (its `cmd` is not a button). */
export const KERUI_DOOR = {
  time: TIME,
  model: 'Kerui-Security',
  id: 413106,
  cmd: 14,
  opened: 1,
  state: 'open',
};

/** synth (src/devices/kerui.c, cmd 0xa): a PIR, which only says "motion". */
export const KERUI_PIR = {
  time: TIME,
  model: 'Kerui-Security',
  id: 413107,
  cmd: 10,
  motion: 1,
  state: 'motion',
};

/** tests/generic_motion/01: a code, and a model that says what it is. */
export const GENERIC_MOTION = { time: TIME, model: 'Generic-Motion', code: '800a2' };

/** tests/interlogix/04: battery only (the switches are not mapped yet). */
export const INTERLOGIX_CONTACT = {
  time: TIME,
  model: 'Interlogix-Security',
  subtype: 'contact',
  id: 'a7106d',
  battery_ok: 1,
  switch1: 'OPEN',
  switch2: 'OPEN',
  switch3: 'CLOSED',
  switch4: 'OPEN',
  switch5: 'OPEN',
  raw_message: 'cd15b8',
};

/** tests/smoke_gs558/01: a smoke alarm, which sends nothing but its codes. */
export const SMOKE_GS558 = {
  time: TIME,
  model: 'Smoke-GS558',
  id: 3403,
  unit: 12,
  learn: 0,
  code: 'c1a96c',
};

/** tests/govee_h5059: a water leak. */
export const GOVEE_LEAK = {
  time: TIME,
  model: 'Govee-H5059',
  id: '9cb29683',
  id_wire: '96839cb2',
  event: 'Water Leak',
  msg_class: 17,
  subtype: 6,
  detect_wet: 1,
  leak_top: 1,
  leak_bottom: 0,
  mic: 'CRC',
};

// --- Remotes ---

/** tests/Microchip/HCS200/01: a garage remote, button 1. */
export const HCS200 = {
  time: TIME,
  model: 'Microchip-HCS200',
  id: '00D0921',
  battery_ok: 1,
  button: 1,
  learn: 0,
  repeat: 1,
  encrypted: '528F2DB8',
};

/** tests/generic_remote/01: a cheap EV1527/PT2262 remote. */
export const GENERIC_REMOTE = {
  time: TIME,
  model: 'Generic-Remote',
  id: 5069,
  cmd: 192,
  tristate: '0Z01101Z1000',
};

/** tests/nexa_LMST-606: an ON/OFF remote, unit 2. */
export const NEXA = {
  time: TIME,
  model: 'Nexa-Security',
  id: 25140614,
  channel: 1,
  state: 'OFF',
  unit: 2,
  group: 0,
};

/** tests/newkaku/01: KlikAanKlikUit, the command is "On". */
export const KAKU = {
  time: TIME,
  model: 'KlikAanKlikUit-Switch',
  id: 19529034,
  unit: 0,
  group_call: 'No',
  command: 'On',
  dim: 'No',
  dim_value: 0,
};

/** tests/waveman/01: a string id, button + state. */
export const WAVEMAN = {
  time: TIME,
  model: 'Waveman-Switch',
  id: 'A',
  channel: 1,
  button: 1,
  state: 'ON',
};

// --- Tyres (TPMS) ---

/** tests/Toyota_TPMS/02: PSI. */
export const TOYOTA_TPMS = {
  time: TIME,
  model: 'Toyota',
  type: 'TPMS',
  id: 'f0d5aee3',
  status: 128,
  pressure_PSI: 34.25,
  temperature_C: 29.0,
  mic: 'CRC',
};

/** tests/Renault_TPMS: kPa. */
export const RENAULT_TPMS = {
  time: TIME,
  model: 'Renault',
  type: 'TPMS',
  id: '87f293',
  flags: '34',
  pressure_kPa: 202.5,
  temperature_C: 25.0,
  mic: 'CRC',
};

/** As rtl_433's MQTT output publishes it. */
export const json = (event) => JSON.stringify(event);

/** Other messages rtl_433 publishes next to the events (devices=, states=, availability). */
export const NOT_EVENTS = [
  ['rtl_433/pi/devices/Nexus-TH/3/201/temperature_C', '29.4'],
  ['rtl_433/pi/devices/Nexus-TH/3/201/time', '2026-10-15 13:41:07'],
  [
    'rtl_433/pi/states',
    '{"time":"2026-10-15 13:41:07","enabled":277,"since":"2026-10-15T13:00:00","frames":{"count":12,"fsk":0,"events":12}}',
  ],
  ['rtl_433/pi/events', '[1,2,3]'],
  ['rtl_433/pi/events', '{"model":""}'],
  ['rtl_433/pi/events', 'not json'],
];
