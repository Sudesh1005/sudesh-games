# Kaathu Riders

A 3D motorbike racing game that runs in the browser. Race point to point through traffic: weave past cars, auto-rickshaws, buses and trucks, and don't hit them. Built with plain HTML, CSS and JavaScript plus [three.js](https://threejs.org) from a CDN. There's no build step. Roads, bikes, traffic, scenery and sound are generated in code. The riders are the realistic character models from Kadal Nagaram (`../GTA-Game/models/`), dressed in a riding suit in the bike's colour with a full-face helmet and gloves, crouched over the tank and leaning into the turns. Until those load (or with `?simple`) a built-in rider is used.

## Features

- **3 routes**
  - **City Rush**: night, downtown, 2 + 2 lanes with oncoming traffic, about 3 km
  - **Coastal Highway**: day, 3-lane one-way highway by the sea, about 3.8 km
  - **Ghat Climb**: sunset, narrow two-way mountain road full of bends, about 2.8 km
- **Traffic** in every lane: cars, autos, buses and trucks. Same-direction traffic stays on the left; on two-way roads vehicles come at you on the right.
- **Crashes**: hit a vehicle (or a barrier too hard) and you come off the bike. You're put back on the road after a moment, briefly see-through so you can get going.
- **Near misses**: pass close to traffic to refill nitro. Chain them for a bigger combo.
- **3 bikes** (Swift 160, Kaali 400, Thunderbolt 650) and 8 paint colours. Bikes lean into corners; nitro pulls a wheelie.
- **Race mode** against 5 AI riders (Easy / Normal / Hard) who pick gaps in traffic, or **Time Trial** on your own
- Traffic density: Light / Normal / Heavy
- 3 cameras (chase, far, helmet), progress strip with every rider, live standings, results table
- Synthesised engine, near-miss whoosh, horns and crash sounds
- Best times saved in the browser (localStorage)
- Touch controls on phones, and gamepad support

## Online with friends (2 to 6 players)

Press **PLAY ONLINE WITH FRIENDS**, type your name and **CREATE ROOM** to get a 6-letter code (or copy the invite link). Friends type their name and the code and press **JOIN**. Everyone rides the bike and colour they picked in the menu.

- Only the players' bikes are on the road: no computer riders.
- The host picks the route and the road traffic: **Off** (default), Light, Normal or Heavy. With traffic on, every player sees the same vehicles.
- Each player's screen rides their own bike and sends its position about 15 times a second through the host, which shares it with everyone, so all screens show the same race and the same results. Other riders have name tags.
- The browsers connect directly with WebRTC using [PeerJS](https://peerjs.com) (loaded only when you play online). Some networks (strict office/college Wi-Fi, some mobile data) block direct connections.

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Throttle |
| S / ↓ | Brake |
| A D / ← → | Lean and steer |
| Shift / N | Nitro (wheelie) |
| H | Horn |
| C | Change camera |
| R | Reset to the road |
| M | Sound on / off |
| Esc / P | Pause |

## Run locally

ES modules don't load from `file://`. Double-click `play.bat` in the parent `Games` folder, or serve that folder:

```bash
python -m http.server 8000
# open http://localhost:8000/Bike-Race/
```

Testing aids (URL options): `?auto` starts a race straight away, `?bot` lets the AI ride your bike, `?speed=4` runs 4× faster, `?route=1` picks a route, `?touch` shows the phone controls, `?low` uses phone graphics.

## Project layout

```
index.html      page, HUD, menu, touch controls, pause and results screens
css/style.css   styles
js/main.js      menu, race flow, traffic collisions and near misses, camera, HUD, main loop
js/road.js      route generation and themes, road/shoulder/barrier geometry, scenery, road queries
js/traffic.js   traffic vehicles and lane flow
js/bike.js      detailed bike models (alloy wheels, disc brakes, fork, engine, exhaust, fairing), lean, wheelie, crash and riding physics
js/rider.js     the rider: character model, riding gear and riding pose
js/models.js    character model loader (from Kadal Nagaram)
js/human.js     built-in rider used until the models load
js/ai.js        rival riders
js/net.js       online rooms (PeerJS / WebRTC)
js/input.js     keyboard, touch buttons and gamepad
js/audio.js     synthesised sound
```

## Adding a route

Add an entry to `ROUTES` in `js/road.js`. The road is generated from `seed`: `length` in metres, `seg` (distance between bends), `turn` (how sharp each bend can be) and `maxHead` (how far the road may swing left or right; keep it under 1.5 so the road never crosses itself). `lanes` is `[same direction, oncoming]` and `laneW` the lane width.
