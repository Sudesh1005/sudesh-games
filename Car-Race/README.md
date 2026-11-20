# Vegam Racing

A 3D car racing game that runs in the browser. It's built with plain HTML, CSS and JavaScript plus [three.js](https://threejs.org) from a CDN. There's no build step and there are no asset files: tracks, cars, scenery and sound are all generated in code.

## Features

- **3 tracks**
  - **Marina Circuit**: daytime seaside track with palms, a beach and the sea
  - **Neon City**: night street circuit between lit-up towers, with street lamps and neon signs
  - **Ghat Hills**: twisty sunset run through pine forest below the mountains
- **3 cars** with different top speed, acceleration and grip, plus 8 paint colours
- **Race mode** against 5 AI drivers (Easy / Normal / Hard). They pick lanes, take the inside of corners, brake before bends, overtake and use nitro.
- **Time Trial mode**: race alone against your best lap
- **Online play with friends** (2 to 6 players): one player creates a room and gets a 6-letter code (or an invite link), the others type their name and the code to join. The host picks the track and laps and starts the race.
- 2, 3 or 5 laps, a countdown start, lap timing, live positions, results table
- Nitro boost; handbrake drifting refills nitro
- Walls, curbs and grass run-off (grass slows you down), car-to-car bumping
- 3 camera views (chase, far, bumper), minimap, wrong-way warning, reset-to-road
- Synthesised engine, tyre skid, wind and crash sounds
- Best laps and race times are saved in the browser (localStorage)
- Touch controls on phones, and gamepad support

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake / reverse |
| A D / ← → | Steer |
| Space | Handbrake drift (fills nitro) |
| Shift / N | Nitro |
| C | Change camera |
| R | Reset car to the road |
| M | Sound on / off |
| Esc / P | Pause |

Gamepad: left stick to steer, RT or A to accelerate, LT to brake, X to drift, B or RB for nitro, Y for camera, Start to pause.

## Run locally

ES modules don't load from `file://`. Double-click `play.bat` in the parent `Games` folder, or serve that folder:

```bash
python -m http.server 8000
# open http://localhost:8000/Car-Race/
```

Testing aids (URL options): `?auto` starts a race straight away, `?bot` lets the AI drive your car, `?speed=4` runs the game 4× faster, `?track=1` picks a track, `?touch` shows the phone controls, `?low` uses phone graphics, `?debug` writes the race state to `document.body.dataset.debug`.

## How online play works

There's no game server. Browsers connect directly to each other with WebRTC, using [PeerJS](https://peerjs.com) (loaded from a CDN only when you open online play):

- The room code is the host's ID on the free public PeerJS server, which only helps the browsers find each other. Names and race data go directly between the players.
- Each player drives their own car and sends its position about 15 times a second. The host passes everyone's positions to everyone. Other players' cars are drawn about 0.1 s behind, so they move smoothly.
- Everyone starts the countdown when the host presses Start. Each player's race time is measured on their own screen, and the results use those times.
- If the host leaves, the room closes. Some networks (strict office/college Wi-Fi, some mobile data) block direct connections.

Testing aids: `?mp=host&name=A` creates a room and starts as soon as someone joins; `?mp=join&room=CODE&name=B` joins it.

## Project layout

```
index.html      page, HUD, menu, touch controls, pause and results screens
css/style.css   styles
js/main.js      menu, race flow (countdown, laps, positions, results), camera, HUD, main loop
js/track.js     track layouts and themes, road/curb/wall geometry, scenery, track queries
js/car.js       car models and arcade driving physics
js/ai.js        AI drivers
js/input.js     keyboard, touch buttons and gamepad
js/audio.js     synthesised sound
js/hud.js       time formatting and the minimap
js/net.js       online rooms (PeerJS / WebRTC): create, join, lobby, relaying car positions
```

## Adding a track

Add an entry to `TRACKS` in `js/track.js`: a list of `[x, z]` points (in metres) that the road passes through in order, forming a loop that doesn't cross itself. The first point is the start/finish line, so put a straight just before it. Pick a theme (`beach`, `city` or `hills`) and a road width.
