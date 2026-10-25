# Try RedVita without phones

This runs the real RedVita app in your browser at phone size, against the real server code running on your computer. You don't need Supabase, Expo, Twilio or a phone. One browser tab is the patient's phone and another is the family's phone.

## Run it

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
```

Start the local server (it runs the real `api` and `watchdog` functions with an in-memory database):

```bash
node --experimental-transform-types demo/server/run.mjs
```

In a second terminal, start the app in demo mode:

```bash
# macOS / Linux
EXPO_PUBLIC_DEMO=1 EXPO_PUBLIC_API_URL=http://localhost:8787/api npx expo start --web
```

```powershell
# Windows PowerShell
$env:EXPO_PUBLIC_DEMO="1"; $env:EXPO_PUBLIC_API_URL="http://localhost:8787/api"; npx expo start --web
```

Then open two tabs (Chrome works best; make each window narrow, or use the phone view in DevTools):

- Patient's phone: http://localhost:8081/?phone=patient
- Family's phone: http://localhost:8081/?phone=family

## Try it

1. **Patient tab:** pick "The person who needs the power", type a name, pick what they need power for, tap "Mark the house on the map", then "Create". Note the 6-digit code, then tap "Start".
2. **Family tab:** pick "A family member, neighbor or caregiver", type the code and your name, then "Connect".
3. **Family tab:** tap "Power went out at the house". The patient tab turns red and rings. Tap I'M OKAY there.
4. **Family tab:** tap "Ask if they're okay" and don't answer in the patient tab. After 1 minute, the family tab shows "Not answering", with the alert and the text message.
5. **Family tab:** tap "I'm on my way" (directions open), then "I saw them: they're okay". The patient tab stops ringing.

The wait is 1 minute instead of 10 (`GRACE_MINUTES=1`), and the server checks for missed check-ins every 5 seconds instead of every minute.

To act like a phone with no internet, type `window.__demo.setAirplane(true)` in the patient tab's console, then use DevTools > Network > Offline.

To start over, restart the server and clear the site's storage (DevTools > Application > Clear site data).

## How it works

- `server/run.mjs` loads `supabase/functions/api` and `watchdog` in Node with an in-memory database (`server/fakedb.ts`). Push notifications and text messages go to the browser tabs instead of Expo Push and Twilio.
- `metro.config.js` swaps the phone-only modules (notifications, secure storage, location, battery, background tasks, webview, safe area) for the stand-ins in `web/shims`, only when `EXPO_PUBLIC_DEMO=1` and the platform is web. Phone builds don't use any of this.
- `web/phone.ts` draws what the phone itself would show: status bar, notification and text banners, alert dialogs, and the directions screen.
- `node demo/server/smoke.mjs` runs the whole check-in flow against the server with no browser, as a quick check.

The homes on the map are made-up spots in San Juan.
