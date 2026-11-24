# Homey Pro Test pilot

## Source and package

- [ ] Record the GitHub commit, app version and successful CI run. Use the **Homey package check** job summary to record the checkout SHA and staging content SHA-256.
- [ ] Confirm the build, package checks, offline household scenarios, Chromium checks and publish-level validation for the candidate.
- [ ] Use the [compatibility matrix](compatibility.md) and [first-install checklist](first-install.md) to document the models and fields confirmed on Homey Pro. Keep unverified models and cloud events visible as pending.

The staging fingerprint covers sorted relative file paths, file contents and symbolic-link targets from `.homeybuild`. It identifies the files checked by this build. Rebuild with the same CLI, dependency lock and platform when comparing fingerprints. The package check is evidence from CI. Record the Homey App Store build number separately after any authorised submission.

## Authorised Homey Pro pilot

- [ ] Complete the first read-only verification with the target Homey Pro, HomeLINK account and gateway. Confirm the expected property and devices appear. For accounts with several properties, verify the intended property against the HomeLINK Dashboard before choosing devices to pair.
- [ ] Record the installed app version and Homey firmware. Verify that an upgrade preserves paired identities, settings and Flow associations.
- [ ] Check a restart and recovery. Compare availability, widget coverage and the support report. Confirm that existing active events are treated as the initial baseline and that new reports are scoped to the right devices.
- [ ] Record any pagination or property-selection gaps before extending the supported account scope. Ask for the actual continuation request and response contract when the default inventory is incomplete.
- [ ] Record separately any authorised physical fire or CO test and its HomeLINK receipt. Keep account-specific evidence private.

## Test channel

- [ ] With explicit release approval, submit the verified source version to the Homey App Store and record the resulting build number and Test status. Use the Test link for the agreed pilot audience. [Homey publishing guide](https://apps.developer.homey.app/app-store/publishing)
- [ ] Confirm the expected Test build is available and record a pilot installation separately. Check feedback and upgrade or recovery results before considering another channel.
