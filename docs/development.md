# Development and acceptance

## Protocol reviewed

The [Home Assistant implementation](https://github.com/RogerSelwyn/AICO_HomeLINK/blob/09ec979ef11c6a9b2950b7439846575dd7c85fbb/custom_components/homelink/helpers/oauth2.py) exchanges a Web API client ID and secret for an expiring bearer token. Its token request uses an HTTPS query string. The Homey client encodes parameters, blocks redirects and replaces transport errors with fixed messages. It keeps the token in memory for at most 19 hours, one hour less than the reference implementation’s refresh interval, and renews once on an inventory 401. Homey persists the Web API key in its app settings.

The [Python reference](https://github.com/RogerSelwyn/python_homelink/tree/c6db59b8dca7f07d67baba08433e198da1456585) reads the inventory from `GET /v1/device`. The upstream fixture describes a paginated envelope. This iteration fails discovery when the response identifies multiple pages because the page traversal contract has yet to be confirmed. No Python code or fixture data is included in this repository. The upstream documentation confirms [the dashboard role and key requirements](https://rogerselwyn.github.io/AICO_HomeLINK/). Individual homeowner dashboard and key access remain to be confirmed with Aico.

One client shares inventory requests across pairing and all device tiles. The app refreshes every minute while devices are paired. A successful snapshot can be reused for 20 seconds to absorb concurrent discovery. Rate limiting delays the next request using the server's retry interval or a one-minute fallback. On a failed read, Homey marks affected tiles unavailable and preserves their previous displayed timestamps. A cloud response can itself contain old device data. The vendor's data collection status describes the collection service and does not establish whether a radio device is online.

| Model | Inventory scope |
| --- | --- |
| Ei1000G | Gateway inventory and vendor-reported fields |
| Ei3014, Ei3016, Ei3028, Ei3030 | Alarm inventory and vendor-reported fields |
| Ei450 | Accessory inventory and vendor-reported fields |
| Ei3000MRF | Radio module fitted to a host alarm. A separate Homey tile requires evidence of a distinct inventory record. |
| Ei208WRF | Pending evidence of its model ID, reported fields and event coverage. |

## Maintenance alerts

The app reads `GET /v1/property/{reference}/alerts` for properties linked to paired inventory devices. The [reference integration’s alert fixture](https://github.com/RogerSelwyn/AICO_HomeLINK/blob/09ec979ef11c6a9b2950b7439846575dd7c85fbb/tests/data/base/alerts_alarm.json) and [event category catalogue](https://github.com/RogerSelwyn/python_homelink/blob/c6db59b8dca7f07d67baba08433e198da1456585/tests/data/lookups_eventtype.json) provide the initial contract. A single account session shares token renewal and each property reuses a successful snapshot for five minutes. Event identifiers are kept in memory to compare consecutive snapshots. Only aggregate counts and retrieval times enter Homey capabilities and Flow tokens.

- The maintenance count includes distinct active device alerts in the `MAINTENANCE`, `PRIORITY_MAINTENANCE` or `FAULT` categories. The inventory and alert records must identify the same property and device.
- A complete alert response with no matching active maintenance reports shows **None reported**. Ambiguous alert state, conflicting duplicates, missing property links, incomplete responses and request failures show **Unknown**.
- Existing Homey tiles gain the maintenance capabilities during initialisation. Their paired identity and inventory capabilities are retained.
- Homey keeps the maintenance timestamp separate from its inventory retrieval and vendor device contact timestamps. Maintenance is cloud-derived and can arrive after the underlying device event.

## Maintenance automation

[Maintenance Flow cards](flows.md) compare complete, recent snapshots of the same device and property. The first snapshot after startup, relinking, a credential change, an unavailable feed or a stale interval seeds the baseline. Existing reports remain visible for conditions and display. A later fresh sample can trigger on newly observed active identifiers or a change from positive to zero. The availability condition treats a sample older than seven minutes as unavailable. This allows for the five-minute alert refresh interval and two additional inventory polls.

## Progress and verification

1. **Repository and CI.** Use a pull request with versioned Compose metadata, a lockfile, synthetic tests and Homey validation. CI executes offline application tests and builds a candidate package. It contains no Homey credentials or deployment step.
2. **Live read-only acceptance.** Confirm HomeLINK dashboard access and an authorised Standard-scope Web API key. Review which inventory records and fields actually appear, including the Ei208WRF. On a user-authorised Homey development install, compare paired model, status, dates and maintenance counts with the portal. Confirm that a saved-credential change, key removal and app restart produce the expected unavailable and recovery states without duplicating devices. Check the maintenance card labels and tokens in both Homey Flow editors, then verify the actions against the acceptance sequence in the [Flow guide](flows.md).
3. **Events and Flows.** Establish the identity, timestamp and lifecycle of actual fire, CO, fault, recovery and test events from redacted evidence. Verify REST and [MQTT](https://rogerselwyn.github.io/AICO_HomeLINK/mqtt.html) semantics before adding standard Homey alarms and device Flow cards. REST alerts and MQTT messages use different field names and identity relationships. The upstream MQTT example pairs a CO event ID with fire wording. Require observed and consistent classification evidence before using a message to update a Homey fire or CO capability. Test duplicate, late, replayed, out-of-order and reconnect events. Measure normal delivery delay. Any physical alarm validation needs an agreed procedure and supervision.
4. **Release.** Verify the exact built commit, confirm real Homey Pro pairing and behaviour, and record hardware acceptance separately before considering App Store Test and release.

Capture pass or fail by model and field. Keep account-specific responses and evidence in private storage. Use synthetic examples to document any newly observed schema.
