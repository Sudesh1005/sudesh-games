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
```

## Adding a track

Add an entry to `TRACKS` in `js/track.js`: a list of `[x, z]` points (in metres) that the road passes through in order, forming a loop that doesn't cross itself. The first point is the start/finish line, so put a straight just before it. Pick a theme (`beach`, `city` or `hills`) and a road width.
