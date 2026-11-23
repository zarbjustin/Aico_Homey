# HomeLINK overview widget

Add **HomeLINK overview** to a Homey Pro dashboard to see how many paired devices have recent cloud data, how many were checked for maintenance, the reported active maintenance count and the oldest sync of the devices currently reporting.

The widget uses the [Homey Apps SDK widget API](https://apps.developer.homey.app/the-basics/widgets), a widget-scoped GET route and a fixed 160 px layout. It uses Homey’s light and dark colours and ships an abstract preview for each theme. The Homey client can refresh the cache view without making a HomeLINK request. The API returns only aggregate counts and the oldest device sync time. A device with a cloud sync older than three minutes drops out of the reporting count. Maintenance coverage is displayed separately.

A per-device service widget could add last test and replacement dates once device selection is tested in the Homey client. An alarm history widget would require reliable event timestamps and a verified policy for persisting historical alerts. The overview is the first candidate because coverage and maintenance are already available in the app.

On the authorised Homey Pro, verify the label, readability, light and dark themes, no paired devices, partial coverage, stale data and a successful recovery. Compare the displayed counts with the paired device tiles.
