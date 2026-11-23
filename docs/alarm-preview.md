# Fire and carbon monoxide Flow preview

The **HomeLINK reports a fire alarm** and **HomeLINK reports a carbon monoxide alarm** cards are available for device Flows and Advanced Flow. Both are off by default. The settings page enables dispatch for an agreed Homey Pro validation. For each new report the card provides the number of newly observed alerts and the time Homey retrieved them.

## Offline verification

Run `npm test`. Synthetic REST responses exercise the same parsing, snapshot comparison, device dispatch and SDK token definitions as normal app requests. Tests cover separate fire and carbon monoxide routing, duplicate IDs, unsupported models, conflicting codes, disabled dispatch, startup or recovery baselines, and maintenance continuity. Synthetic events are confined to the test files.

## SDK and protocol design

- The Homey driver declares separate [device trigger cards](https://apps.developer.homey.app/the-basics/flow#flow-device-trigger-cards) in Homey Compose and calls them for the paired device. This preview adds notification triggers only.
- The [reference HomeLINK event catalogue](https://github.com/RogerSelwyn/python_homelink/blob/c6db59b8dca7f07d67baba08433e198da1456585/tests/data/lookups_eventtype.json) lists `FIRE_ALARM` and `CO_ALARM` as separate alarm codes. The preview checks the REST feed and verifies the property, device and status. Conflicting or unrecognised device alarm codes suppress the preview for that property until a valid baseline returns.
- The preview routes fire reports for Ei3014, Ei3016, Ei3028 and Ei3030, and CO reports for Ei3028 and Ei3030. Confirm live routing and coverage by model. Property-level reports require separate attribution evidence.
- The first valid snapshot after enablement, credentials change, a stale gap or an ambiguous feed seeds the baseline. Subsequent fresh snapshots trigger on newly observed active alert identifiers. The property alert read is shared with maintenance and is cached for five minutes.
- The [reference MQTT documentation](https://rogerselwyn.github.io/AICO_HomeLINK/mqtt.html) shows a payload with a CO code and fire wording. The preview reads REST. MQTT classification and delivery remain a separate verification step.

## First Homey Pro test

1. Confirm the gateway and alarms in the HomeLINK Dashboard. Install the development build on the approved Homey Pro and enter the Web API settings.
2. Pair the intended alarm and compare the portal and Homey device inventory first. With the preview off, inspect authorised or vendor-provided examples of how that property represents fire and CO reports. Record the event code, state, device association and time with identifying details removed.
3. For a supervised test agreed with the owner, choose the alarm in Homey and add the two preview cards to separate notification-only Flows. Include the event type in the notification text and the **Retrieved at (UTC)** tag.
4. Enable **Alarm Flow preview** in the app settings and allow Homey to obtain its first new snapshot. Verify the expected card, one delivery per qualifying snapshot and the observed delay.
5. Turn the preview off after the session and compare the results with the dashboard. Record missing coverage as unknown.

Cloud reports may be delayed or incomplete. The installed Aico system provides local detection and audible alerts.
