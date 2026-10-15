# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors. Read **[TODO.md](./TODO.md) first**: status, decisions
already taken and the next milestones.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It reads
the JSON events of [rtl_433](https://github.com/merbanan/rtl_433) (433/868 MHz
sensors decoded with an SDR dongle) from the user's MQTT broker, or from
rtl_433's HTTP server, and turns them into Gladys devices, states and a
`button_pressed` scene trigger. rtl_433 runs next to the dongle: the
integration container has no USB access. Not affiliated with rtl_433.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js            SDK bootstrap only
src/handlers.js     every SDK handler -> the app (shared with the tests)
src/app.js          Rtl433App: link lifecycle, events -> sensors, Discovery,
                    states, presses, alarm resets, badges, both buttons
src/events.js       payload -> rtl_433 event, sensor identity (pure)
src/mapping.js      rtl_433 fields -> Gladys features and values (pure)
src/devices.js      sensors heard -> Gladys devices (pure)
src/publisher.js    states within the Gladys rate limit
src/mqtt.js         the broker connection (mqtt.js)
src/http.js         rtl_433's HTTP /events stream (fetch), mqtt.js-like client
src/config.js       config_schema normalized
src/constants.js    manifest keys, limits, timings
src/i18n.js         runtime texts (en/fr)
test/fixtures/      rtl_433 events from the rtl_433_tests expected outputs
test/helpers/       a fake mqtt.js client; Gladys is the SDK's fake
```

## Rules

- **External ids are forever**: device = `rtl433:<model>:id<id>:ch<channel>`
  (parts absent when the event has none), feature = `<device>:<key>` with the
  keys of `src/mapping.js` (`temperature`, `button_<code>`...). Never change
  how they are built.
- Manifest keys (`test_connection`, `list_sensors`, `button_pressed` and its
  fields, the config keys) are frozen: users store them.
- Field names come from rtl_433's decoders (`src/devices/*.c`, `data_make`)
  and `docs/DATA_FORMAT.md`; add a fixture from rtl_433_tests with any new
  mapping, never an invented event.
- Each Gladys feature has one unit: convert (°F, m/s, inches, PSI...) in
  `src/mapping.js`.
- Container limits: 256 MB RAM, 0.5 CPU, read-only rootfs, only `/data`
  writable, bridge network (unicast to the LAN only, no USB, no Bluetooth).
- Gladys rate limits: 300 states/min, 300 scene events/min. The neighbours'
  sensors are heard too: nothing is sent for a device the user did not add.
- Never log or put in a status message a password or a secret config value.
- Code, comments, README in English; `docs/en.md` and `docs/fr.md` kept in sync.
