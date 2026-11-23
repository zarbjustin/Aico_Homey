# Homey Pro roadmap

| Sprint | Deliverable and verification |
| --- | --- |
| 1. Device profiles and onboarding | Device profiles, verified credential replacement, connection status and redacted diagnostics. Offline checks cover the Homey API handlers and settings screen behavior. Confirm the settings view on the first Homey Pro install. |
| 2. First home and the 3000 Series | Confirm homeowner Web API access and the commissioned gateway. Compare gateway, alarm and accessory inventory with the HomeLINK Dashboard. Use the result to extend the [model matrix](compatibility.md), starting with Ei208WRF, Ei3018 and Ei3024. |
| 3. Cloud event delivery | Verify report classification on the first installation. Compare REST and MQTT scope, device association and timestamps. Test duplicate, stale, reconnect and out-of-order events before broadening alarm notification support. |
| 4. Maintenance and service widgets | Replacement and last-test conditions are implemented and offline-tested in v0.6. Verify them on Homey Pro once live inventory dates are available. Event-specific fault mappings and the service widget follow verified device data. |
| 5. Environmental products | Verify Ei1025 temperature, humidity and CO₂, then Ei1020 and Ei1030. Add timestamps, units, freshness, Homey Insights and threshold cards where the API returns usable readings. |
| 6. Wider radio and accessories | Extend profiles by verified radio variant, starting with RadioLINK+ 600 Series devices and earlier mains and CO products. Check accessory records independently. |
| 7. Account scale and release | Verify property selection and pagination. Run a private Test pilot, check upgrade and recovery on hardware, and prepare the model and feature matrix for App Store review. Treat smart-meter data as a separate opt-in. |

Work requiring live HomeLINK evidence starts with the [first validation procedure](development.md). Keep offline validation, GitHub CI, Homey installation and physical acceptance as separate checks.
