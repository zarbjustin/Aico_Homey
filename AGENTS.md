# Aico HomeLINK for Homey Pro

Read [README.md](README.md) and [docs/development.md](docs/development.md) first. Keep the SDK adapters thin and put standalone protocol and normalisation logic in `lib/`.

- Use Node.js 22, `npm ci`, `npm run check`, `npm test` and the Homey CLI build and publish-level validation commands in the README.
- Edit Homey Compose sources and regenerate `app.json` with the CLI. Keep IDs for paired devices and published capabilities and Flow cards stable.
- Test contract changes with synthetic data. Keep credentials, raw vendor errors, account and property details, raw serials and household diagnostics out of logs, fixtures, Git and public issues.
- Treat missing, stale and ambiguous data as unavailable or unknown. Distinguish cloud retrieval time from physical device contact. Keep the HomeLINK integration read-only.
- Record repository, CI, Homey installation and physical observations independently. Obtain explicit authorisation before installing on a real Homey, testing alarm hardware or submitting an App Store build.
