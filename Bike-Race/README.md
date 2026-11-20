# Kaathu Riders

A 3D motorbike racing game that runs in the browser. Race point to point through traffic: weave past cars, auto-rickshaws, buses and trucks, and don't hit them. Built with plain HTML, CSS and JavaScript plus [three.js](https://threejs.org) from a CDN. There's no build step and there are no asset files: roads, bikes, riders, traffic, scenery and sound are all generated in code.

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
js/bike.js      bike + rider models, lean, wheelie, crash and riding physics
js/ai.js        rival riders
js/input.js     keyboard, touch buttons and gamepad
js/audio.js     synthesised sound
```

## Adding a route

Add an entry to `ROUTES` in `js/road.js`. The road is generated from `seed`: `length` in metres, `seg` (distance between bends), `turn` (how sharp each bend can be) and `maxHead` (how far the road may swing left or right; keep it under 1.5 so the road never crosses itself). `lanes` is `[same direction, oncoming]` and `laneW` the lane width.
