# gladys-rtl433

[Gladys Assistant](https://gladysassistant.com) external integration for the
**433/868 MHz radio sensors decoded by [rtl_433](https://github.com/merbanan/rtl_433)**
with a 25 € SDR dongle: weather stations, thermometers, soil probes, energy
meters (OWL), door contacts, motion and smoke detectors, remotes, tyre sensors…
rtl_433 runs next to the dongle (the Gladys integration containers get no USB
access) and publishes what it hears to the user's MQTT broker, or serves it
over HTTP; the integration offers every sensor heard in the Discovery tab.
Not affiliated with the rtl_433 project.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

> Work in progress (0.1, not published to the store yet): announced on the
> [Gladys forum](https://community.gladysassistant.com/t/integrations-home-assistant-les-plus-populaires-candidates-pour-des-integrations-externes-gladys/10385/159).

## How it works

```
SDR dongle -> rtl_433 (hertzg/rtl_433) -> MQTT broker, or rtl_433's HTTP server
                                                  |
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (Rtl433App) ⇄ src/mqtt.js | src/http.js
                                   ├─ src/events.js    JSON event -> sensor identity (pure)
                                   ├─ src/mapping.js   rtl_433 fields -> Gladys features (pure)
                                   ├─ src/devices.js   sensors heard -> Discovery devices (pure)
                                   └─ src/publisher.js states within 300/min, sensor throttling
```

- **Input**: subscribes to `rtl_433/#` (configurable) and keeps the JSON
  objects with a `model`: rtl_433's default `events` topic and
  `events=rtl_433[/model][/id]` both work; the per-field `devices` topics and
  the `states` are ignored, `availability` feeds the status. Without a broker,
  the `/events` stream of `rtl_433 -F http` (one JSON event per line).
- **Devices**: one per model + id (+ channel), external id
  `rtl433:<model>:id<id>:ch<channel>`. A sensor gathers the fields of all its
  messages; a remote gets one button feature per code heard (max 16). The
  Discovery list is published 2 s after a new sensor or field, at most every
  30 s (the neighbours never stop), and forgets the sensors silent for 24 h.
  Tyre sensors (TPMS) are left out unless the user asks for them.
- **Fields**: temperature (°F converted), humidity, battery (`battery_ok`
  fraction -> %), wind speed/gust (km/h), direction, rain, rain rate,
  pressure (hPa), tyre pressure (bar), light, UV index (`uvi`), power, energy
  index, current, voltage, soil moisture, opening, motion, water leak, smoke,
  tamper, numbered probes (`temperature_1_C`…). Implausible values are dropped.
- **States**: only for the devices the user created, the last values heard
  sent at creation; deduplicated, budgeted at 250/min, measurements throttled
  to the configured interval. Button presses are events (`publishStates`, a
  second click is sent too); the repeats of one radio transmission (1.5 s) are
  merged. Motion and smoke detectors, which only say "detected", go back to 0
  after 60 s.
- **Scene trigger** `button_pressed` (device, code, action press/on/off) for
  the created remotes; **transport badge**: unreachable while the link is
  down, or when a sensor that measures periodically is silent for an hour.
- **Buttons**: "Test the connection" waits for a first event; "List the
  sensors heard" shows the last ones with their values and signal level (dB).

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit
npx github:GladysAssistant/integration-store .  # store admission checks
```

`test/fixtures/events.js` holds rtl_433 events taken from the expected
outputs of the [rtl_433_tests](https://github.com/merbanan/rtl_433_tests)
recordings (keys and order checked against the decoders). The integration was
also run against the real rtl_433 (hertzg/rtl_433 25.12) fed with those
recordings through a fake rtl_tcp server: default MQTT topics,
`events=rtl_433[/model][/id]` and the HTTP server, with a real Mosquitto 2.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release. The
`gladys-assistant-integration` topic is added at the first real release only.

## License

Apache-2.0.
