# Using Tesseract on your phone

`npm start` serves **this computer only** (127.0.0.1); nothing else on the network can reach it.

**Easiest (desktop app):** Settings → **Phone & tablet** → *Turn on*. The app switches to LAN mode in place (no restart) and shows a
**QR code**: scan it with the phone or iPad camera and it pairs automatically. *Turn off* closes it again.
The QR holds the pairing key, so don't share screenshots of it.

From a terminal you can also start in LAN mode: Your data stays on the PC; the phone is just a screen,
so the PC must be on.

```powershell
cd app
npm run lan
```

It prints the addresses to open on your phone and an **access token**. Each device pairs once with
the token (stored as a secure cookie on that device). The token is saved in
`%USERPROFILE%\.tesseract\token`, outside the repo, so it is never committed.

## Option A: home Wi-Fi

1. Run `npm run lan`. When Windows Firewall asks about Node.js, allow **Private networks only**.
   Your Wi-Fi must be set as a *Private* network in Windows settings.
2. On the phone (same Wi-Fi), open the printed `http://192.168.x.x:4320` address.
3. Enter the access token, then tap **Pair device**.
4. Add it to your home screen: iPhone Safari → Share → *Add to Home Screen*; Android Chrome → ⋮ → *Add to Home screen*.

> Plain `http` on Wi-Fi is not encrypted: someone else on the same network could read traffic,
> including the session cookie. Use this on your own home network only, never on public Wi-Fi.

## Option B: Tailscale (recommended, works anywhere, encrypted)

1. Install Tailscale on the PC and the phone, signed in to the same account.
2. Run `npm run lan`. It also prints your Tailscale address (`http://100.x.y.z:4320`); open that on the phone and pair.
   Traffic is end-to-end encrypted (WireGuard) even outside home.
3. Optional: **HTTPS + full app install** (offline shell, no browser bar):
   - In the Tailscale admin console enable *MagicDNS* and *HTTPS certificates*.
   - On the PC: `tailscale serve --bg 4320` (check `tailscale serve --help`; the syntax differs between versions).
   - Start with your Tailscale name allowed:
     ```powershell
     npm run lan -- --allow-host your-pc.your-tailnet.ts.net
     ```
   - On the phone open `https://your-pc.your-tailnet.ts.net`, pair, then *Install app* / *Add to Home Screen*.

## Security notes

- This computer (localhost) never needs the token. Every other device must pair, including requests that come through `tailscale serve`.
- Lost a phone or shared the token by mistake? Start once with `npm run lan -- --reset-token`. All devices must pair again.
- The app shell (HTML/JS/icons) is visible without pairing, but it contains no data. All `/api` data needs pairing.
- The phone caches only the app shell, never your data.

If the host disappears while a paired screen is open, Tesseract displays a connection warning and keeps that screen mounted while you reconnect. Check the host before saving; this is not offline editing or automatic cross-device sync. For the release checks see [DEVICE_QA.md](DEVICE_QA.md).


A pairing QR shown in Settings includes the current layout and colours of the browser on the host. After a successful scan the phone applies those preferences locally. Scan a fresh QR to copy another snapshot later, or change Layout and Colours on the phone without affecting the PC. There is no background sync of preferences. The QR still contains the pairing key, so do not share it.
