# Target Shooter

A first-person shooting game that runs in the browser. Built with plain HTML, CSS and JavaScript plus [three.js](https://threejs.org) from a CDN. There's no build step and there are no asset files: the range, arena, guns, drones and sound are all generated in code.

## Modes

- **Target Range**: 60 seconds in an indoor range. Targets pop up (and some slide) at 10 to 50 m.
  - Rings score 10 / 8 / 6 / 4 / 2, scaled up for distance; a centre hit is a **bullseye**.
  - Consecutive hits build a **combo** multiplier; a missed shot resets it.
  - **Gold** targets are small, quick and worth triple.
  - **Red X** boards cost 50 points. Don't shoot them.
- **Drone Waves**: survive in an arena with crates, containers and pillars for cover.
  - **Scout** drones circle and shoot, **kamikaze** drones rush you and explode, **heavy** drones fire bursts.
  - Hit the glowing eye for double damage.
  - Destroyed drones can drop health or ammo; more spawn after each cleared wave.
  - Easy / Normal / Hard.

## Weapons

| | Fire | Damage | Magazine |
| --- | --- | --- | --- |
| 1 · P-9 Pistol | semi-auto | 34 | 12 |
| 2 · AR-7 Rifle | full-auto | 24 | 30 |
| 3 · SG-12 Shotgun | 9 pellets | 13 each | 6 |

Aiming down the sights zooms in and tightens the spread; moving, jumping and holding the trigger widen it. Ammo is unlimited on the range.

## Controls

| Key | Action |
| --- | --- |
| Mouse | Aim (click PLAY to lock the mouse; Esc to release) |
| Left click | Shoot |
| Right click | Aim down sights |
| W A S D | Move |
| Shift | Sprint |
| Space | Jump (you can jump onto crates) |
| R | Reload |
| 1 2 3 / mouse wheel / Q | Switch weapon |
| M | Sound on / off |
| Esc / P | Pause |

Phones: left stick to move, drag on the right to look, FIRE (drag it to aim while shooting), AIM, RELOAD, SWAP, JUMP.
Gamepad: sticks to move and look, RT shoot, LT aim, A jump, X reload, Y switch weapon, Start pause.

## Run locally

ES modules don't load from `file://`. Double-click `play.bat` in the parent `Games` folder, or serve that folder:

```bash
python -m http.server 8000
# open http://localhost:8000/Target-Shooter/
```

Testing aids (URL options): `?auto` starts straight away, `?mode=waves` picks the mode, `?bot` aims and shoots by itself, `?weapon=1` starts with the rifle, `?speed=3` runs faster, `?touch` shows the phone controls, `?low` uses phone graphics.

## Project layout

```
index.html      page, HUD, menu, touch controls, pause and results screens
css/style.css   styles
js/main.js      menu, game modes, shooting and hit detection, HUD, main loop
js/world.js     the indoor range and the drone arena (meshes, collision boxes, spawn points)
js/targets.js   pop-up range targets, drones and their shots, pickups
js/player.js    first-person movement and collisions
js/weapons.js   weapon stats, gun models and their animation
js/fx.js        sparks, tracers, bullet holes, explosions
js/input.js     mouse (pointer lock), keyboard, touch and gamepad
js/audio.js     synthesised sound
```
