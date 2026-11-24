# Homey Pro roadmap

| Sprint | Deliverable and verification |
| --- | --- |
| 1. Device profiles and onboarding | Device profiles, verified credential replacement, connection status and redacted diagnostics. Offline checks cover the Homey API handlers and settings screen behavior. Confirm the settings view on the first Homey Pro install. |
| 2. First home and the 3000 Series | v0.7 adds offline-tested Ei3018 pairing and CO preview routing for the `COALARM` inventory type. Confirm homeowner Web API access and the commissioned gateway. Compare inventory and extend the [model matrix](compatibility.md) from observed records, including Ei208WRF and Ei3024. |
| 3. Cloud event delivery | v0.8 adds an optional MQTT listener that requests bounded REST refreshes. Synthetic tests cover bursts, reconnect, retained messages, rate limiting and polling fallback. Confirm live topic access, classification, device association and latency before broadening alarm notification support. |
| 4. Maintenance and service widgets | Replacement and last-test Flow conditions and the v0.9 HomeLINK service widget are offline-tested. Verify date coverage and thresholds on Homey Pro. Event-specific fault mappings require observed HomeLINK reports. |
| 5. Environmental products | v0.10 adds offline-tested Ei1020 and Ei1025 pairing, temperature, humidity, Ei1025 CO₂ and sample freshness. Verify native capabilities, Insights and Flow behaviour on Homey Pro. Ei1030 needs model-specific inventory and reading evidence. |
| 6. Wider radio and accessories | Extend profiles by verified radio variant, starting with RadioLINK+ 600 Series devices and earlier mains and CO products. Check accessory records independently. |
| 7. Account scale and release | Verify property selection and pagination. Run a private Test pilot, check upgrade and recovery on hardware, and prepare the model and feature matrix for App Store review. Treat smart-meter data as a separate opt-in. |

Work requiring live HomeLINK evidence starts with the [first validation procedure](development.md). Keep offline validation, GitHub CI, Homey installation and physical acceptance as separate checks.

The [offline acceptance suite](development.md#offline-acceptance) covers a simulated two-property household, settings and widgets in Chromium, and package contents. The [first-install checklist](first-install.md) records the checks that need an authorised Homey Pro.
