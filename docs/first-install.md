# First Homey Pro install

## Offline gate

- [ ] Record the repository commit, app version and successful CI run.
- [ ] Run the [offline checks](development.md#offline-acceptance), including the package check using the Homey CLI build directory. Record the simulated household and browser results.

## Authorised read-only install

- [ ] Confirm access to the HomeLINK Dashboard and a Standard-scope Web API key. Verify that the gateway and expected devices appear in the intended property in the dashboard.
- [ ] Agree the Homey Pro and install window. Record the Homey model and firmware, the app version and the installation result.
- [ ] Open settings. Verify the Web API key, review the aggregate diagnostics, then save the verified key. Keep the key and account-specific evidence in private storage.
- [ ] Compare Homey’s pairing list with the HomeLINK Dashboard. Record each product model, API type, gateway association and the fields available for comparison. Check that repeated discovery preserves identities and reports missing fields as unknown.
- [ ] Compare operational and collection status, last test, replacement dates and reported environmental values with the dashboard. Record Homey’s retrieval time and the device’s reported contact or measurement time separately.
- [ ] Add both widgets. Check data coverage, date thresholds, empty states and readability in both themes. Confirm the maintenance and date cards in Flow and Advanced Flow.
- [ ] Restart the authorised development build. Check that devices and Flow associations persist and that existing reports do not trigger new notifications. Record how the app recovers from a failed read if one occurs.

## Optional event delivery

- [ ] After REST verification, configure the separate MQTT key if Aico provides one. Observe connection status, reconnect and ordinary polling with MQTT disabled. Compare cloud and Homey observation times for any naturally occurring records.
- [ ] Agree a separate supervised procedure for physical fire and CO acceptance. Record the underlying Aico event, HomeLINK receipt and device-scoped Homey Flow result for each authorised test.

Use one result per check with date, pass or fail, and any missing evidence. Keep repository checks, package contents, installation and physical observations as distinct records.
