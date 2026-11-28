# Aico HomeLINK for Homey Pro

An independent Homey Pro SDK 3 app that reads device inventory and maintenance information from the Aico HomeLINK cloud. The Ei1000G gateway sends data to HomeLINK, and Homey reads that data over HTTPS. Homey needs internet access and a HomeLINK Dashboard account that can create a **Web API access key with Standard scope**.

**v0.13 is a development build.** The code can discover and pair an Ei1000G, Ei1020, Ei1025, Ei3014, Ei3016, Ei3018, Ei3028, Ei3030 or Ei450 when the model appears in the supported HomeLINK inventory. See [compatibility](docs/compatibility.md) for model type requirements. Each tile can show the reported operational and collection statuses, last seen, last tested and replacement dates, and when Homey retrieved the record. Missing or unrecognised fields show **Unknown**. A failed inventory refresh marks paired devices unavailable. Cloud snapshot retrieval and last device contact are separate timestamps.

Open a device for its health, data collection, service dates and HomeLINK refresh times. The detail screen uses short dates and shows recent times in Homey's time zone. **Replace by** is a calendar date. The count of active faults and maintenance alerts is shown alongside the time Homey fetched the alerts. An incomplete, ambiguous or unavailable alert feed shows **Unknown** for maintenance while the app can still display inventory information.

In app settings, generate a [redacted support report](docs/development.md#support-report) to see recent read times, device coverage and MQTT status.
The connection view shows detected models and their icons. For reported model types, connectivity codes and field coverage, open **Advanced settings and support → Saved key model details**.

Use the device's [maintenance Flow cards](docs/flows.md) in Flow or Advanced Flow for new reports, when reports clear and to check whether maintenance data is available. Add replacement and last-test conditions to a scheduled Flow for service reminders.

The [alarm Flow preview](docs/alarm-preview.md) adds separate fire and carbon monoxide report cards, disabled by default. Offline tests inject synthetic cloud responses through the app and exercise the device-scoped Homey SDK adapters. The [HomeLINK overview and service widgets](docs/widget.md) show cached coverage, maintenance and alarm service reminders.

The optional [MQTT listener](docs/development.md#optional-mqtt-updates) can prompt a faster Web API refresh. It uses a separate HomeLINK key. Regular polling continues during broker outages. MQTT delivery and model-specific Ei208WRF support are pending live verification.

The [Ei1020 and Ei1025 environmental sensors](docs/development.md#environmental-readings) use Homey’s temperature and relative humidity measurements. Ei1025 also reports carbon dioxide. Measurements require matching recent Web API samples.

The Aico system remains responsible for local detection, audible alerts and testing. Cloud reports are supplementary and can arrive late.

## Developer setup

Use Node.js 22 and Homey Pro firmware 12.9.0 or later.

```sh
npm ci
npm run check
npm test
npx --yes homey@4.5.3 app build
npx --yes homey@4.5.3 app validate --level publish
```

These checks run locally with synthetic test data and require no Homey or HomeLINK account. CLI installation requires npm registry access.

Run `npm run test:acceptance` for the simulated household. The [offline acceptance guide](docs/development.md#offline-acceptance) includes browser and package checks. Record live verification with the [first-install checklist](docs/first-install.md) and any authorised Test release with the [Test pilot checklist](docs/test-pilot.md).

## First live verification

1. Confirm that the gateway and enrolled devices appear in the HomeLINK Dashboard. Confirm that the account can create an access key with Web API type and Standard scope. Use a key limited to devices whose data this Homey is authorised to display.
2. In the app settings on an authorised Homey Pro, enter the client ID and secret and choose **Connect HomeLINK**. Homey verifies the key before saving it. To test a key before saving, open **More key options → Test connection**.
3. In Homey, add an **Aico HomeLINK → HomeLINK device**. Compare the displayed models, dates and maintenance alerts with the portal. This first version supports single-page inventories.
4. Use the procedure in [the development notes](docs/development.md) to record the results and outstanding gaps.

Homey assigns model-specific tile icons when devices are added. Devices originally added with the shared driver icon retain that icon assignment. The app's connection view shows the model artwork for both existing and new setups.

For supported fields and models, see [compatibility](docs/compatibility.md). The [roadmap](docs/roadmap.md) tracks development and live verification separately.

## License

Copyright (c) 2026 zarbjustin.

This project is licensed under the [GNU General Public License, version 3 only](LICENSE) (`GPL-3.0-only`).

## References

- [Aico Ei1000G documentation](https://www.aico.co.uk/homelink/products/ei1000g-gateway/).
- [Roger Selwyn’s Home Assistant integration](https://github.com/RogerSelwyn/AICO_HomeLINK) and [Python HomeLINK library](https://github.com/RogerSelwyn/python_homelink) informed the protocol contract. Both are MIT-licensed.
- [Homey Apps SDK](https://apps.developer.homey.app/) documents Homey Compose, pairing and validation.
