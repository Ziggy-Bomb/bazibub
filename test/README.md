# FieldOps smoke tests

End-to-end tests for `../fieldops.html`. Each suite serves the repo on
`http://127.0.0.1:8081`, drives headless Chromium "phones" through real game
rounds, and prints PASS/FAIL per check (exit 0 when all pass).

```sh
npm install
node smoke-sim.js         # Training Sim: AI units, tap-to-walk, all modes solo (no network)
node smoke-replay.js      # PLAY AGAIN relaunches the same sim; generated call sign
node smoke-local.js       # same-browser tabs + Claude-artifact room transport (4 KiB chunking)
node broker.js &          # local MQTT-over-WebSocket broker on ws://127.0.0.1:9001, for:
node smoke-manhunt.js     # GM + hunter + runner: visibility rules, chat scoping, tag → win
node smoke-objectives.js  # GM-placed course + clue dialog, auto-lay, GM AI units, horde
```

Notes:
- Chromium path defaults to `/opt/pw-browsers/chromium`; override with `CHROMIUM=/path`.
- CDN scripts (Leaflet, mqtt.js) are served from local `node_modules` via request
  interception, and map tiles are aborted, so everything runs offline. With tiles
  blocked the app falls back to its procedural tactical map, as it does in the artifact.
- `smoke-local.js` stands in for the artifact's `room` capability with a fake that
  rejects any message over 4 KiB, to prove the game doc is chunked.
