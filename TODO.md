# TODO — rtl_433 v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`,
  `npm audit`, then update README, `docs/en.md`, `docs/fr.md`, `CHANGELOG.md`
  and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only (before, the store would list an empty integration).

## Status

- [x] **Milestone 1 — core** (2026-10-15): MQTT input (any topic layout) and
      HTTP fallback (`-F http` /events), sensor identity, mapping of the common
      fields with unit conversions, Discovery publication paced for the
      neighbours' sensors, TPMS opt-in, states within the rate limit, last
      values at creation, remotes (button per code, ON/OFF, repeat merging,
      `button_pressed` scene trigger), alarm resets, transport badge,
      availability, both buttons, manifest, docs en/fr with the hertzg/rtl_433
      docker run / compose. 66 unit tests on rtl_433_tests fixtures; run
      against the real rtl_433 25.12 (recordings streamed by a fake rtl_tcp
      server) with Mosquitto 2: default topics, `events=rtl_433[/model][/id]`
      and the HTTP server.
- [ ] **Milestone 2 — real dongles**: testers with an RTL-SDR; collect their
      `docker logs rtl_433` lines as fixtures; check the reception of a
      Raspberry Pi next to Gladys, 868 MHz (`-f 868.3M -s 1024k`), the
      Discovery list in a dense neighbourhood, the badge timings.
- [ ] **Milestone 3 — more devices**: Interlogix `switch1..5` (which loop is
      the reed), doorbells (Honeywell ActivLink, Byron), more energy meters
      (Efergy optical, CurrentCost), water/gas meters (`-M protocol` +
      the flex decoders), `setpoint_C` of thermostats as a sensor, depth and
      distance sensors, a "replace a sensor" action for the ids that change
      with the batteries.
- [ ] **Milestone 4 — first release**: cover image, Docker image build check,
      `npx github:GladysAssistant/integration-store .`, Release workflow,
      topic, GHCR package public.

## Forum

No dedicated topic for this integration. Once the 10 integrations claimed on
2026-10-15 are published, a single recap message in the general thread
(/t/10385) lists each of them with its version and capabilities.

## Decisions

- rtl_433 is never run by the integration (no USB in the container, the
  sub-containers only get coral/gpu/video): the user runs hertzg/rtl_433 next
  to the dongle. MQTT first (most Gladys users have a broker), HTTP as the
  no-broker fallback (no extra dependency: `fetch` streaming).
- Subscribe to a broad filter (`rtl_433/#`) and keep the JSON objects with a
  `model`: works whatever `events=` topic the user picked, ignores `devices=`
  and `states=` messages.
- Identity = model + id + channel (no subtype): what rtl_433's own MQTT topics
  and its HA discovery script use. A battery change can mean a new id: the
  user adds the new device (M3: a replace action).
- Each feature has one canonical unit (°C, km/h, mm, hPa, bar, lux, W, kWh):
  the values are converted, whatever the decoder or `-C` uses. `uv` of Fine
  Offset is a raw reading: only `uvi` / `uv_index` feed the UV index.
- `battery_ok` -> battery % (fraction × 100): the Gladys battery views and
  alerts work, a binary OK/LOW shows as 100 % / 0 %.
- Remotes: a button feature per code (`button_<code>`, max 16 per device),
  value CLICK, or ON/OFF for `state`/`command` On/Off remotes; presses go
  through `publishStates` (never deduplicated). The button rule only applies
  to an event without any measurement or state (raw `data`/`code` of sensors
  are not presses). Smoke and motion detectors that send only a code are
  recognized by their model name.
- Discovery publication: 2 s debounce, 30 s minimum gap, scan = immediate;
  sensors silent 24 h dropped, 500 kept at most (least recently heard
  first, never a created one). TPMS off by default (every passing car).
- The badge goes unreachable for a periodic sensor silent for 1 h, never for
  remotes and contacts (they speak when used).
- An `offline` on an availability topic counts only until the next event
  (a retained last will of a stopped second instance must not hide the
  events of the first).
