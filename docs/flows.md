# Homey maintenance Flows

Select a paired **HomeLINK device** in Homey Flow or Advanced Flow. The same four cards work in both editors. The examples use Homey notifications so you can verify the result without controlling equipment.

| Card | What it checks or reports |
| --- | --- |
| **When** HomeLINK reports new maintenance alerts | A successful refresh includes active fault or maintenance alerts that were absent from the preceding fresh snapshot for this device. Tags give the number of new reports, total active reports and retrieval time. |
| **When** HomeLINK stops reporting maintenance alerts | A successful refresh shows zero active maintenance alerts after one or more in the preceding fresh snapshot. Tags give the previous active count and retrieval time. |
| **And** HomeLINK reports active maintenance alerts | Checks for one or more active reports. The inverted card checks for zero. The condition stops the Flow when it has no fresh maintenance data. |
| **And** HomeLINK maintenance data is available | Checks that the tile has a current maintenance snapshot. Invert it to detect missing or stale data in a scheduled check. |

## Example Flows

- **New report.** When **HomeLINK reports new maintenance alerts**, send a push notification such as “Aico hall alarm has [New reports] new maintenance reports. [Active reports] active as of [Retrieved at (UTC)].”
- **Report cleared.** When **HomeLINK stops reporting maintenance alerts**, create a Timeline notification such as “HomeLINK stopped reporting active maintenance alerts for the hall alarm.”
- **Daily data check.** On a daily schedule, use the inverted **HomeLINK maintenance data isn't available** condition for the gateway or one representative alarm. Send a notification to check the HomeLINK connection if the condition passes.

Square brackets in the examples indicate tags to select in the Flow editor. Run the card independently for each device you want to monitor.

## What to verify on Homey Pro

1. Pair a device and compare its reported maintenance state and retrieval time with the HomeLINK Dashboard. The first successful snapshot makes the conditions usable without firing a trigger.
2. Set up the notification examples and confirm the cards and tags are available in the Flow editor you use.
3. With an agreed test procedure, compare each observed maintenance change against the dashboard. Confirm one notification for each qualifying refresh and one when the active count returns to zero.
4. Check the availability card during a failed alert read and after recovery. The first successful read after a gap becomes the baseline. The next qualifying refresh can trigger a Flow.

Homey checks the maintenance feed on a five-minute cadence. Delivery also depends on when the cloud receives the report. These cards provide supplementary maintenance monitoring. The Aico system handles the alarms and audible alerts locally.
