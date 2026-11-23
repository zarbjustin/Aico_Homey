# Aico HomeLINK for Homey Pro

An independent Homey Pro SDK 3 app that reads device inventory and maintenance information from the Aico HomeLINK cloud. The Ei1000G gateway sends data to HomeLINK, and Homey reads that data over HTTPS. Homey needs internet access and a HomeLINK Dashboard account that can create a **Web API access key with Standard scope**.

**v0.1 is a development build.** The code can discover and pair an Ei1000G, Ei3014, Ei3016, Ei3028, Ei3030 or Ei450 when the model appears in the supported HomeLINK inventory. Each tile can show the reported operational and collection statuses, last seen, last tested and replacement dates, and when Homey retrieved the record. Missing or unrecognised fields show **Unknown**. A failed inventory refresh marks paired devices unavailable. Cloud snapshot retrieval and last device contact are separate timestamps.

This app provides supplementary visibility. The installed Aico system remains responsible for local detection, audible alerts and testing. Fire and CO event notifications, MQTT and Flow cards are planned after live API validation. The Ei208WRF still needs model-specific verification.

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
2. After installing the development build on an authorised Homey Pro, open the app settings and save the access key there.
3. In Homey, add an **Aico HomeLINK → HomeLINK device**. Compare the displayed models and dates with the portal. This first version supports single-page inventories.
4. Use the procedure in [the development notes](docs/development.md) to record the results and outstanding gaps.

## References

- [Aico Ei1000G documentation](https://www.aico.co.uk/homelink/products/ei1000g-gateway/).
- [Roger Selwyn’s Home Assistant integration](https://github.com/RogerSelwyn/AICO_HomeLINK) and [Python HomeLINK library](https://github.com/RogerSelwyn/python_homelink) informed the protocol contract. Both are MIT-licensed.
- [Homey Apps SDK](https://apps.developer.homey.app/) documents Homey Compose, pairing and validation.
