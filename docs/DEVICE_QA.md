# Paired-device release checks

## Automated on a Linux host

Build once from `app/` with `npm run build:desktop`. Run `node scripts/device-smoke.ts` with `TESSERACT_PLAYWRIGHT_ENTRY` pointing at a Playwright Core `index.mjs` and `TESSERACT_CHROMIUM` pointing at a local Chromium binary. The script starts a loopback server with copied fixtures, a random pairing token, and no external integrations. It closes the server/browser and deletes the fixture copy when done. It does not pair to your daily workspace.

The script checks desktop access, a wrong token, manual pairing in a Pixel-sized Chromium context, QR-fragment pairing in an iPad-sized Chromium context, a scored quiz visible after reload and from desktop, no API entries in the shell cache, and loss/recovery of the host without another pairing. These are real Chromium interactions, not native Windows, Android or iPadOS tests and not Safari engine coverage.

## Physical device gate

- **Windows:** use an isolated Windows account or disposable workspace, run the documented desktop launcher, verify startup, restart, Settings → Phone & tablet, and the expected Tesseract instance/port. Do not replace an existing workspace to run this check.
- **Android and iPad:** on a trusted network or a private tailnet, pair each device separately. Open a note with a distinctive title; take a disposable quiz on Android, see its result from Windows and iPad, then relaunch the app on each device. Check the iPad in portrait and landscape; test iPad Safari and Android Chrome rather than user-agent emulation.
- For each paired device, shut down the host from the host console, verify the connection warning and that data is not available after reopening an offline shell, restart without resetting the token, and verify recovery. This app is not a cross-device offline sync engine. Never capture pairing tokens in screenshots.
