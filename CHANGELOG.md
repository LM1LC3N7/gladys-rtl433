# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.1] - 2026-10-15

### Added

- Reading rtl_433 from the user's MQTT broker (mqtt, mqtts, ws, wss; user name
  and password; TLS verification can be turned off for a self-signed broker),
  on a configurable topic filter (`rtl_433/#` by default: rtl_433's default
  topics and `events=rtl_433[/model][/id]`).
- Without a broker: rtl_433's own HTTP server (`-F http`, the `/events`
  stream).
- One Discovery device per sensor heard (model + id + channel), gathering the
  fields of all its messages; the sensors silent for 24 h leave the list.
- Temperature (°F converted), numbered probes, humidity, battery, wind speed,
  gust and direction, rain and rain rate, pressure, light, UV index, power,
  energy index, current, voltage, soil moisture, opening, motion, water leak,
  smoke, tamper, and tyre pressure (TPMS, as an option).
- Remotes: one button feature per code, ON/OFF switches, the repeats of a
  radio frame merged, and the "433 MHz remote or button" scene trigger.
- Motion and smoke detectors set back to 0 after 60 s.
- The last values heard sent when a device is added; readings throttled to a
  configurable interval, all states within the Gladys rate limit.
- The transport badge: unreachable while the link is down, or when a sensor
  that measures periodically has been silent for an hour.
- rtl_433's availability (online / offline) in the status.
- "Test the connection" and "List the sensors heard" buttons.

[Unreleased]: https://github.com/LM1LC3N7/gladys-rtl433/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-rtl433/releases/tag/v0.1.1
