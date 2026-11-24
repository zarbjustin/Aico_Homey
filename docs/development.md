# Development and acceptance

## Protocol reviewed

The [Home Assistant implementation](https://github.com/RogerSelwyn/AICO_HomeLINK/blob/09ec979ef11c6a9b2950b7439846575dd7c85fbb/custom_components/homelink/helpers/oauth2.py) exchanges a Web API client ID and secret for an expiring bearer token. Its token request uses an HTTPS query string. The Homey client encodes parameters, blocks redirects and replaces transport errors with fixed messages. It keeps the token in memory for at most 19 hours, one hour less than the reference implementation’s refresh interval, and renews once on an inventory 401. Homey persists the Web API key in its app settings.

The [Python reference](https://github.com/RogerSelwyn/python_homelink/tree/c6db59b8dca7f07d67baba08433e198da1456585) reads the inventory from `GET /v1/device`. The upstream fixture describes a paginated envelope. This iteration fails discovery when the response identifies multiple pages because the page traversal contract has yet to be confirmed. No Python code or fixture data is included in this repository. The upstream documentation confirms [the dashboard role and key requirements](https://rogerselwyn.github.io/AICO_HomeLINK/). Individual homeowner dashboard and key access remain to be confirmed with Aico.

One client shares inventory requests across pairing and all device tiles. The app refreshes every minute while devices are paired. A successful snapshot can be reused for 20 seconds to absorb concurrent discovery. Rate limiting delays the next request using the server's retry interval or a one-minute fallback. On a failed read, Homey marks affected tiles unavailable and preserves their previous displayed timestamps. A cloud response can itself contain old device data. The vendor's data collection status describes the collection service and does not establish whether a radio device is online.

## Account onboarding

The two authenticated [Homey app API](https://apps.developer.homey.app/advanced/web-api) routes support the local app settings view. The connection check tests the entered key in a separate client. The saved connection route reports the health of the most recent inventory read and returns only aggregate counts and canonical model names. The client never returns a saved key to the settings page. The Homey settings manager writes the submitted key after its check succeeds.

To repair access, verify and save a replacement key from the same HomeLINK account. Pairing rests on the same stable device IDs and leaves existing tiles and Flows in place. The app closes the previous session, resets its cached observations and rechecks its registered devices. Rejecting a candidate leaves the prior session in place.

The [compatibility matrix](compatibility.md) states the available app features and evidence level per model group. A model known from the Aico catalogue can appear in diagnostics while pairing is pending verification.

## Optional MQTT updates

Once a verified Web API key and a paired device are in place, use the dashboard's [separate MQTT access key](https://rogerselwyn.github.io/AICO_HomeLINK/mqtt.html) to enable event updates. In Homey settings, enter the MQTT client ID, username and password from the HomeLINK MQTT export, and the first segment of the account topic. Use a dedicated client ID because MQTT brokers allow one connected client per ID. Homey saves the MQTT key separately from the Web API key and exposes only listener status in its settings API. Removing the MQTT key or the last paired device stops the listener.

The listener uses MQTT 3.1.1 with certificate-validated TLS. It subscribes to the account's `alert`, `device` and `property` topics. Successful subscription and fresh messages request an inventory and alert refresh. The app ignores message bodies, retained copies and packets marked as duplicates. It groups bursts with a two-second delay, limits hint-driven refreshes to one per 30 seconds and honours Web API rate limits. Periodic polling continues independently. The app's existing REST checks supply all inventory, maintenance and alarm Flow data.

For the first live test, compare topic access and listener status with the account's MQTT export. Record when a confirmed report appears in MQTT and REST, how reconnect behaves, and whether polling covers delayed REST reports. Retry with the MQTT key removed to compare the normal polling path. Offline tests use a synthetic broker and cloud responses.

## Environmental readings

Ei1020 pairs as `ENVSENSOR` and uses Homey’s built-in temperature and relative humidity measurements. Ei1025 pairs as `ENVCO2SENSOR` and adds CO₂. The [reference device fixtures](compatibility.md) and [property readings fixture](https://github.com/RogerSelwyn/python_homelink/blob/c6db59b8dca7f07d67baba08433e198da1456585/tests/data/property_readings.json) establish the initial schema. The app requests `GET /v1/property/{reference}/readings?date=YYYY-MM-DD` over the Web API when paired devices advertise supported readings. It shares a five-minute cache per property and includes the previous UTC date during the first hour of a new day. This keeps recent overnight readings visible.

Homey displays the newest plausible sample of each expected unit for the linked device and property, up to an hour after sampling. The tile shows the oldest measurement time across the values it currently displays. Missing, stale or conflicting samples clear the corresponding measurement. CO₂ is an environmental measurement and stays separate from the CO alarm preview. A readings failure leaves the device inventory and maintenance path usable.

During first-home acceptance, compare values, units and measurement timestamps with the dashboard. Verify native Homey device indicators, Flow cards and Insights on the hub. Fault and risk metrics need their own data evidence.

## Maintenance alerts

The app reads `GET /v1/property/{reference}/alerts` for properties linked to paired inventory devices. The [reference integration’s alert fixture](https://github.com/RogerSelwyn/AICO_HomeLINK/blob/09ec979ef11c6a9b2950b7439846575dd7c85fbb/tests/data/base/alerts_alarm.json) and [event category catalogue](https://github.com/RogerSelwyn/python_homelink/blob/c6db59b8dca7f07d67baba08433e198da1456585/tests/data/lookups_eventtype.json) provide the initial contract. A single account session shares token renewal and each property reuses a successful snapshot for five minutes. Event identifiers are kept in memory to compare consecutive snapshots. Only aggregate counts and retrieval times enter Homey capabilities and Flow tokens.

- The maintenance count includes distinct active device alerts in the `MAINTENANCE`, `PRIORITY_MAINTENANCE` or `FAULT` categories. The inventory and alert records must identify the same property and device.
- A complete alert response with no matching active maintenance reports shows **None reported**. Ambiguous alert state, conflicting duplicates, missing property links, incomplete responses and request failures show **Unknown**.
- Existing Homey tiles gain the maintenance capabilities during initialisation. Their paired identity and inventory capabilities are retained.
- Homey keeps the maintenance timestamp separate from its inventory retrieval and vendor device contact timestamps. Maintenance is cloud-derived and can arrive after the underlying device event.

## Maintenance automation

[Maintenance Flow cards](flows.md) compare complete, recent snapshots of the same device and property. The first snapshot after startup, relinking, a credential change, an unavailable feed or a stale interval seeds the baseline. Existing reports remain visible for conditions and display. A later fresh sample can trigger on newly observed active identifiers or a change from positive to zero. The availability condition treats a sample older than seven minutes as unavailable. This allows for the five-minute alert refresh interval and two additional inventory polls.

The [alarm Flow preview](alarm-preview.md) shares the alert snapshot and freshness logic. It checks the REST alarm category and event code, resolves the paired device, and discards ambiguous alarm snapshots. Existing maintenance cards continue using their own validated view. The [overview widget](widget.md) reads only the app’s cached device projections.

## Progress and verification

1. **Repository and CI.** Use a pull request with versioned Compose metadata, a lockfile, synthetic tests and Homey validation. CI executes offline application tests and builds a candidate package. It contains no Homey credentials or deployment step.
2. **Live read-only acceptance.** Confirm HomeLINK dashboard access and an authorised Standard-scope Web API key. Review which inventory records and fields actually appear, including the Ei208WRF. On a user-authorised Homey development install, compare paired model, status, dates and maintenance counts with the portal. Confirm that a saved-credential change, key removal and app restart produce the expected unavailable and recovery states without duplicating devices. Check the maintenance card labels and tokens in both Homey Flow editors, then verify the actions against the acceptance sequence in the [Flow guide](flows.md).
3. **Events and Flows.** Establish the identity, timestamp and lifecycle of actual fire, CO, fault, recovery and test events from redacted evidence. Verify REST and MQTT semantics before enabling the preview for a live test or considering standard Homey alarm capabilities. REST alerts and MQTT messages use different field names and identity relationships. The upstream MQTT example pairs a CO event ID with fire wording. Keep Homey report classification tied to validated REST data. Test duplicate, late, replayed, out-of-order and reconnect events. Measure normal delivery delay. Any physical alarm validation needs an agreed procedure and supervision.
4. **Release.** Verify the exact built commit, confirm real Homey Pro pairing and behaviour, and record hardware acceptance separately before considering App Store Test and release.

Capture pass or fail by model and field. Keep account-specific responses and evidence in private storage. Use synthetic examples to document any newly observed schema.
