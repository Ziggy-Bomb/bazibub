# FieldOps smoke tests

End-to-end tests for `../fieldops.html`. They spin up a **local MQTT-over-WebSocket
broker** (aedes) and drive **multiple headless Chromium clients** through real game
rounds — create op, join, pick teams, share GPS (via desktop test mode), start,
capture, tag, win.

```sh
npm install
node broker.js &          # local broker on ws://127.0.0.1:9001
node smoke-manhunt.js     # GM + hunter + runner: visibility rules, ping, chat scoping, tag → win
node smoke-objectives.js  # waypoint race + clue cache + horde simulation relay
```

Notes:
- Chromium is found via Playwright's `executablePath`; adjust the path in the
  scripts if yours differs (they use `/opt/pw-browsers/chromium`).
- The scripts serve the Leaflet/MQTT CDN files from local `node_modules` via
  request interception, so the tests run fully offline.
- Map tile requests are aborted (no network) — the map logic still runs.
- Each test exits 0 on success and prints any page errors it captured.
