# Product compatibility

Aico’s radio compatibility describes how the devices can interconnect. Homey features depend on device identity and fields reported by the HomeLINK API. The current app uses one registry for pairing, alarm routing and the model names in redacted diagnostics.

| Products | Aico or upstream evidence | Homey support in this build |
| --- | --- | --- |
| **Ei1000G** | Aico HomeLINK gateway. The reference integration recognises it. | Offline-tested inventory pairing and reported service fields. Confirm real firmware and inventory data. |
| **Ei3014, Ei3016** | Heat and smoke models in the 3000 Series. The reference integration recognises them. | Offline-tested inventory pairing, typed fire report preview. |
| **Ei3028, Ei3030** | Heat/CO and multi-sensor fire/CO models. The reference integration recognises them. | Offline-tested inventory pairing, separate fire and CO report previews. |
| **Ei3018, Ei3024** | CO and multi-sensor fire devices in Aico’s gateway-compatible 3000 Series. | Recognised in diagnostics. Inventory and event coverage need live evidence before enabling pairing. |
| **Ei450** | Alarm controller supported as an accessory in the reference integration. | Offline-tested inventory pairing and reported service fields. |
| **Ei208WRF and Ei208W** | The Ei208WRF includes RadioLINK+. The Ei208W uses the Ei200MRF for RadioLINK+. | Recognised in diagnostics. Verify API identity, radio variant and reported CO or maintenance events. |
| **Ei1025, Ei1020, Ei1030** | Ei1025 reports temperature, humidity and CO₂. Ei1020 reports temperature and humidity. Ei1030 reports radon, temperature and humidity to the dashboard. | Recognised in diagnostics. Reading and insight support is planned by model and field. |
| **Ei630iRF, Ei650iRF, Ei660iRF, Ei2110e** | Aico lists RadioLINK+ connectivity or a RadioLINK+ module for these models. | Recognised in diagnostics. Test gateway association and reported fields before pairing. |
| **Ei414, Ei428, RadioLINK Connect revisions** | Aico describes local interface, relay and interconnection functions. | Check whether HomeLINK reports a distinct record and fields for each revision. |
| **Ei3000MRF, Ei100MRF, Ei200MRF** | Radio modules fitted to compatible host alarms. | The host alarm is the candidate Homey device. Verify the radio module as part of the test configuration. |

The current release has passed synthetic tests and Homey CLI validation. Live Homey Pro and hardware acceptance are pending. For each confirmed model, record the gateway revision, product variant, API model and type, fields present, event scope, measured delay and Homey result. Record missing fields as unknown. Reported date and status fields can vary with a device’s firmware and configuration. Keep account-specific records private.

Sources include the [Aico gateway](https://www.aico.co.uk/product/ei1000g-gateway/), [3000 Series overview](https://www.aico.co.uk/homelink/wp-content/uploads/2025/06/The-Connected-Home-Solution-Feb-2025-PRINT.pdf), [Aico model and radio module FAQ](https://www.aico.co.uk/technical-support/faqs/products-faqs/), [600 Series](https://www.aico.co.uk/series/600-series/), [Ei1030](https://www.aico.co.uk/homelink/products/ei1030-radon-sensor/) and the [Home Assistant HomeLINK reference](https://rogerselwyn.github.io/AICO_HomeLINK/).
