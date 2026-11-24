# HomeLINK overview widget

Add **HomeLINK overview** to a Homey Pro dashboard to see how many paired devices have recent cloud data, how many were checked for maintenance, the reported active maintenance count and the oldest sync of the devices currently reporting.

The widget uses the [Homey Apps SDK widget API](https://apps.developer.homey.app/the-basics/widgets), a widget-scoped GET route and a fixed 160 px layout. It uses Homey’s light and dark colours and ships an abstract preview for each theme. The Homey client can refresh the cache view without making a HomeLINK request. The API returns only aggregate counts and the oldest device sync time. A device with a cloud sync older than three minutes drops out of the reporting count. Maintenance coverage is displayed separately.

On the authorised Homey Pro, verify the label, readability, light and dark themes, no paired devices, partial coverage, stale data and a successful recovery. Compare the displayed counts with the paired device tiles.

## HomeLINK service

Add **HomeLINK service** to see how many paired alarms have a replacement date within the configured window, including overdue replacements, and how many had their last reported test at least the configured number of days ago. Dashboard settings default to 90 days for replacement and seven days for last test. The widget uses the same calendar-day rules and Homey time zone as the service Flow conditions.

Each count shows how many paired alarms had a usable date for that check. A dash indicates unavailable evidence. A zero means Homey had at least one usable date and none met that threshold. Check the device tiles for individual dates. Gateways and accessories are excluded from the alarm totals.

The widget uses recent cached inventory only. Confirm the date coverage, editable thresholds and both themes on the first authorised Homey Pro install.
