# Aico HomeLINK for Homey Pro

An independent Homey Pro SDK 3 app that reads device inventory and maintenance information from the Aico HomeLINK cloud. The Ei1000G gateway sends data to HomeLINK, and Homey reads that data over HTTPS. Homey needs internet access and a HomeLINK Dashboard account that can create a **Web API access key with Standard scope**.

**v0.7 is a development build.** The code can discover and pair an Ei1000G, Ei3014, Ei3016, Ei3018, Ei3028, Ei3030 or Ei450 when the model appears in the supported HomeLINK inventory. Ei3018 pairing requires the `COALARM` type. Each tile can show the reported operational and collection statuses, last seen, last tested and replacement dates, and when Homey retrieved the record. Missing or unrecognised fields show **Unknown**. A failed inventory refresh marks paired devices unavailable. Cloud snapshot retrieval and last device contact are separate timestamps.

Device tiles also show the count of active faults and maintenance alerts reported by HomeLINK. An incomplete, ambiguous or unavailable alert feed shows **Unknown** for maintenance while the app can still display inventory information. The maintenance retrieval timestamp is shown separately.

Use the device's [maintenance Flow cards](docs/flows.md) in Flow or Advanced Flow for new reports, when reports clear and to check whether maintenance data is available. Add replacement and last-test conditions to a scheduled Flow for service reminders.

The [alarm Flow preview](docs/alarm-preview.md) adds separate fire and carbon monoxide report cards, disabled by default. Offline tests inject synthetic cloud responses through the app and exercise the device-scoped Homey SDK adapters. The [HomeLINK overview](docs/widget.md) widget shows coverage and maintenance from the app’s cache.

The Aico system remains responsible for local detection, audible alerts and testing. Cloud reports are supplementary and can arrive late. MQTT and model-specific Ei208WRF support are pending live evidence.

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

## First live verification

1. Confirm that the gateway and enrolled devices appear in the HomeLINK Dashboard. Confirm that the account can create an access key with Web API type and Standard scope. Use a key limited to devices whose data this Homey is authorised to display.
2. After installing the development build on an authorised Homey Pro, enter the key in app settings. Use **Test connection** to check access and **Verify and save credentials** to activate it. The settings page also shows the saved connection and a redacted inventory summary.
3. In Homey, add an **Aico HomeLINK → HomeLINK device**. Compare the displayed models, dates and maintenance alerts with the portal. This first version supports single-page inventories.
4. Use the procedure in [the development notes](docs/development.md) to record the results and outstanding gaps.

For supported fields and models, see [compatibility](docs/compatibility.md). The [roadmap](docs/roadmap.md) tracks development and live verification separately.

## References

- [Aico Ei1000G documentation](https://www.aico.co.uk/homelink/products/ei1000g-gateway/).
- [Roger Selwyn’s Home Assistant integration](https://github.com/RogerSelwyn/AICO_HomeLINK) and [Python HomeLINK library](https://github.com/RogerSelwyn/python_homelink) informed the protocol contract. Both are MIT-licensed.
- [Homey Apps SDK](https://apps.developer.homey.app/) documents Homey Compose, pairing and validation.
