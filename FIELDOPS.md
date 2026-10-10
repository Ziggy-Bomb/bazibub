# FieldOps — real-world GPS team games platform

*A design document + working prototype for running corporate awayday / social
games on a dedicated fleet of phones.*

**Prototype:** [`fieldops.html`](fieldops.html) — one file, open it on any
phone with a browser and GPS. See [Trying the prototype](#trying-the-prototype).

---

## 1. The vision

Buy up to ~100 phones. Hand them out at an event. The phone **is** the game
prop: it's your map, your Aliens-style motion tracker, your clue reader, your
deployable gadget. Games are played outdoors in the real world with real legs:

- **Hunt together** — a team converges on a moving target
- **Triangulate** — distance-only readings, shared within the team, closing a fix
- **Evade** — stay off the hunters' scopes until the clock runs out
- **Waypoint find** — race through an ordered course
- **Hold off the alien horde** — physically intercept virtual contacts converging on a defend point
- **Follow clues / detectives** — walk into a cache radius to unlock the next lead

Team structures vary per game: one big team, two sides, many squads, or solo.
Crucially, **what location data each player sees is a per-game rule**, not a
global setting: teammates live, enemies never, prey on a 60-second ping,
contacts only inside radar range, a transmitter as distance-only. That
visibility engine is the heart of the platform.

## 2. What the prototype already does

`fieldops.html` is a self-contained web app (same philosophy as
`bazibub.html`). No accounts and no server of ours.

- **Three ways to play**
  - **Training Sim**: solo on one device. AI units fill the other slots,
    objectives are laid out around you, and the op starts after a countdown.
    Good for rehearsing a mode before an event, or for demos.
  - **Create / Join op**: one device is **Game Master (GM)** and gets a
    4-letter code; everyone else joins with it and picks a team.
  - **GM tools**: tap-to-place objectives, **auto-lay** a course / caches /
    transmitter / defend point around you, **add AI units** to any team
    (handy when you have 3 people but want to test a 10-player game),
    broadcast, end op.
- **Pluggable network** (Settings → Network):
  - **Online relay**: MQTT over WSS (public broker by default); rooms per op code.
  - **Live room**: inside the Claude artifact build, everyone who has the
    page open shares a real-time room; big messages are chunked under its
    4 KiB cap.
  - **Same-browser tabs**: BroadcastChannel; zero network, for desktop testing.
  - **Solo loopback**: Training Sim.
- **Position**: real GPS, or **manual nav** when there is none (desktop, or
  the artifact, which cannot read location): tap the map to walk there,
  arrow keys / WASD to step, long-press or right-click to jump, and a
  WALK / RUN / FAST speed toggle. Manual players spawn next to the GM's op.
- **Per-game visibility engine**: what each player may see is a per-mode rule
  (the "some games share some locations" idea).
- **Map view**: OpenStreetMap when reachable; otherwise a **procedural
  tactical terrain** (water, woods, paths, 100 m grid) drawn on canvas, which
  works offline. Toggle with the STREET / GRID button.
- **Radar view**: canvas motion tracker in the *Aliens* style: sweep, range
  rings, blips by bearing/distance, optional compass heading-up, and a
  proximity beep that quickens as hostiles close.
- **Team comms**: team-scoped chat plus a one-tap "ping my location to team".
- **Play area**: a dashed boundary with a buzz-and-warn when you leave it.
- **Guidance**: a role-specific **briefing** at the start of every op (re-open
  with **?**); a **nav arrow** with distance to the current objective (next
  waypoint, nearest cache, nearest contact, last ping, or back to the play
  area); the map follows you until you drag it; the radar pins out-of-range
  objectives to its rim; COMMS shows an unread count.
- **Asymmetric info in Manhunt**: runners get a THREAT meter (LOW / MED /
  HIGH, with a heartbeat buzz) without direction; hunters see runners left.
  Waypoint racers see rival teams' progress.
- **Sim conveniences**: optional call sign, RUN as the default manual speed,
  and **PLAY AGAIN** after a round.
- **After-action debrief**: at game over everyone is revealed with their full
  movement trails, plus a per-player scoreboard (waypoints, caches, readings,
  tags, kills).
- **Field practicality**: screen wake lock, fullscreen, vibration, battery
  and GPS accuracy on the GM roster.

### Game modes implemented

| Mode | Teams | Location rules | Win condition |
|---|---|---|---|
| **RECON** (free play) | any | everyone visible | none — warmups & testing |
| **MANHUNT** | hunters vs runners | teammates live; runners appear to hunters only as a ping every N seconds; hunters invisible to runners | hunters tag all runners (within capture radius) / runners survive the clock |
| **WAYPOINT RACE** | any | teammates only; course visible to all | first team to capture every waypoint in order |
| **TRIANGULATE** | any | teammates only; the transmitter's distance is known only by **SCAN** (±5% noise, 15 s recharge), and each scan draws a range ring for the team | first player within 15 m of the transmitter |
| **CLUE HUNT** | any | teammates only; caches shown as "?" markers | auto-laid case: hold 3+ case files, then **ACCUSE** the right suspect (wrong = 60 s lockout). GM-written caches: first team to open them all |
| **HOLD THE LINE** | one big team | everyone visible; alien contacts on radar | intercept aliens (within 25 m) before they breach the reactor; **weapons are safe inside the 50 m reactor zone**, so defenders must push out; survive all waves |

**AI units** behave per mode: hunters chase the same delayed pings humans get
(and give chase on sight within 60 m), runners wander and flee, racers walk
the course, triangulators converge on the transmitter via their own range
readings, detectives visit caches, defenders intercept aliens. They publish
positions exactly like phones, so every rule applies to them unchanged.

### Prototype limitations

- **Public broker = no privacy.** Anyone who knows the op code (or sniffs the
  broker) can read positions. Fine for a field trial, not for a product.
- **Client-side rules = trust-based.** Visibility filtering and captures run on
  the phones; the GM / sim page is the "host" that runs AI units, the horde
  and win detection, so the GM device must stay connected. Production moves
  all of this server-side (§5).
- **Online maps** need data; the tactical terrain is decorative, not a real map.

## 3. Trying the prototype

**In a browser, right now**: open the published artifact build (the
browser test link) → enter a call sign → **TRAINING SIM** → pick a mode →
**DEPLOY**. Tap the map to walk. For multiplayer inside the artifact, share
the page (Contributor access) and have others join your op code; or open the
page in two tabs yourself.

**On phones with real GPS**: serve `fieldops.html` from any HTTPS static host
(GitHub Pages, Netlify, Cloudflare Pages, or bazibub.com alongside the game).
HTTPS is required for geolocation.

1. Phone 1: call sign → **CREATE OP** → pick a mode → **LAUNCH**. Note the code.
2. Other phones: enter the code → **JOIN** → pick a team.
3. GM: open the console, place or **auto-lay** objectives, optionally add AI
   units, then **START OP**.

Two phones and a garden are enough to test Manhunt or Triangulate.
`tools/build-artifact.py` produces the artifact variant from the same file.

## 4. The phone fleet (up to 100 devices)

- **Platform: Android, mid-range, one identical model.** Identical hardware
  means one setup image, one case/lanyard SKU, predictable GPS behaviour.
  Prioritise: dual-frequency GNSS (L1+L5 — dramatically better urban
  accuracy), big battery (5000 mAh+), decent brightness. Rugged models (or
  cheap phones + rugged cases and wrist lanyards) survive being run with.
- **Management: Android Enterprise dedicated-device (kiosk) mode** via any MDM
  (e.g. Headwind free tier, Samsung Knox Configure if Samsung). The phone
  boots straight into the game app, players can't wander into settings, and
  you can push updates to 100 devices at once.
- **Provisioning ritual:** QR-code enrolment → device auto-installs the app →
  device ID sticker on the back matching the app's ID. Charging: two 50-port
  USB charging cabinets. Between events, phones live in the cabinets, powered,
  on Wi-Fi, receiving updates.
- **Connectivity:** group-data multi-SIMs (IoT/M2M data SIMs are cheap at
  game-sized data volumes), or run events at venues with Wi-Fi + an on-site
  server (§5) for zero-SIM operation.
- **The phone as a prop:** kiosk mode + a full-screen sci-fi UI + wake lock +
  vibration + audio means the device stops feeling like "someone's phone" and
  starts feeling like issued field equipment. Boot screen with the op logo,
  per-game skins (the motion tracker for the horde game, a detective's
  case-file UI for clue games), and physical dressing (cases, decals) complete
  it.

## 5. Production architecture

```
phones (native app or PWA)
   │  WebSocket (TLS)
   ▼
game server  ── authoritative world state, per-game visibility rules,
   │            capture/win logic, anti-cheat (speed/teleport detection)
   ▼
GM console (tablet/laptop web app) ── live ops map, objective placement,
                                      scripted event timeline, replay
```

- **Server-authoritative:** phones send raw positions up; the server decides
  what each phone is allowed to know and pushes tailored views down. This
  fixes the prototype's trust problem and enables tricks like fake blips,
  jamming zones, and delayed intel as *game mechanics*.
- **Game definition format:** modes become data, not code — a JSON "op file"
  describing teams, visibility rules, objectives, triggers ("when any BRAVO
  player enters zone 3, reveal clue 7, play sound X on their device"). New
  games become authoring, not programming.
- **On-site server option:** the whole stack in a Docker image on a laptop +
  travel router = events in fields with no signal (phones on local Wi-Fi or a
  private LTE/mesh).
- **Replay & debrief:** log every position/event; after the game, play back
  the whole op on a big screen — corporate crowds love the debrief.

## 6. Tracking: accuracy, backup, and trackers

- **Primary: fused GNSS** (Android Fused Location Provider). Expect 3–8 m
  outdoors, worse in urban canyons — dual-frequency GNSS phones help a lot.
  Design games with capture radii ≥ 15–20 m so GPS error never decides a game.
- **Backup / degraded-GPS play:** dead reckoning (step counter + compass)
  bridges short gaps; the GM console flags stale tracks; the manual position
  fallback stays as a marshal tool.
- **BLE beacons** (~£10–20 each): indoor/precision layer GPS can't provide.
  Hide beacons as physical "clue caches", "bombs to defuse", or booby traps —
  the phone detects proximity (1–10 m) even indoors or in woodland. This is
  the natural "deploy something" mechanic: a team physically plants a beacon,
  and it becomes a live game object.
- **UWB tags** (phone-detected, cm-accurate, directional): a "hot/cold"
  finder for endgame precision — the last 10 m of a triangulate hunt.
- **LoRa GPS trackers** (e.g. Meshtastic nodes, ~£25): long-range,
  no-SIM position beacons for tracking a non-phone asset — the "fugitive's
  car", a dog, a drone, or as backup tracking of players if phones die.
- **Safety net:** geofenced play boundary with on-device warnings, an SOS
  button on every phone, marshal alerts for stopped/stale players, and
  automatic "everyone walk back" broadcast at game end.

## 7. Game catalog (beyond the prototype)

All expressible in the op-file format of §5:

- **Detectives:** interview NPC actors whose testimony unlocks map zones;
  cross-reference clues on-device; accuse at the end. Asymmetric info between
  squads forces trading.
- **Smuggler's run:** one team carries a "package" (a BLE beacon); checkpoints
  detect it; hunters get sporadic sniffs.
- **Signal jammers:** zones where enemy radar blinds — defenders place them
  (deploy mechanic), attackers must find and stand on them to disable.
- **Zombie tag:** tagged players convert teams live on everyone's tracker —
  one big team collapsing into another.
- **King of the hill / area control:** presence in zones accrues score per
  second, visible as a live heat map.
- **Convoy escort:** protect a slow-moving marshal (or LoRa-tracked vehicle)
  from ambush teams who see the route but not the escorts.
- **Solo modes:** time-trial waypoint courses with ghost replays of other
  players' runs.

## 8. Suggested build phases

1. **Now (this prototype):** field-trial Manhunt / Triangulate / Hold the
   Line with 2–10 personal phones; learn what GPS error and battery drain do
   to game design.
2. **Pilot rig:** 10 identical Androids + MDM kiosk mode + self-hosted broker
   (Mosquitto on a £5 VPS) with auth — first paid-ish event.
3. **Product:** server-authoritative backend, native app (or hardened PWA),
   op-file authoring, GM console with replay, offline map packs.
4. **Fleet:** scale to 100 devices, charging cabinets, BLE/UWB prop kit,
   per-game device skins.

---

© 2026 Andswarian Ltd.
