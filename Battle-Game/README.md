# Theevu Yudham

A third-person island battle game in the browser: land on the island, find guns, fight, and be the last one standing. Built with plain HTML, CSS and JavaScript plus [three.js](https://threejs.org) from a CDN, with no build step. The island, buildings, guns and sounds are generated in code; the soldier uses the same character models as Kadal Nagaram (`../GTA-Game/models/`).

## Status: step 1 of 5 (training ground)

| Step | What | Status |
|---|---|---|
| 1 | Island, soldier, third-person camera, 2 guns, controls | done |
| 2 | Loot, armour, med kits, 5 guns, shrinking zone, plane + parachute | next |
| 3 | Computer players (single-player battles) | |
| 4 | Online with friends (2–6 players, last one standing wins) | |
| 5 | Sound, effects, phone tuning, polish | |

## What's in step 1

- **The island** (about 1 km across): Kovil Town with 1 and 2 floor buildings and a temple tower, the fishing village Meenavar Kuppam on the beach, Thottam Farm, Malai Camp on the hill with barracks, a watch tower and a shooting range, Kaadu Hills, roads between them, forest, palms, rocks, bushes and the sea.
- **Buildings you can enter**: doors, open windows you can shoot through, stairs to the upper floor, roof parapets.
- **The soldier**: run, sprint, walk, crouch, jump, swim; collision with walls, floors, steps, trees and rocks; holds the rifle and aims where the camera looks.
- **Third-person camera** over the right shoulder that pulls in when a wall is behind you; aiming zooms in.
- **Guns**: AR-K rifle (automatic) and P-9 pistol, with spread, recoil, reload, muzzle flash and tracers. Headshots do double damage.
- **Training targets** in the town streets and on the camp's range: they fall when killed and stand up again.
- **HUD**: health and armour, ammo, gun slots, crosshair that opens up with movement and spraying, hit markers, kill feed, compass, area names, rotating minimap and a full map.
- **Graphics setting** (Low / Medium / High): view distance, shadows, terrain detail, number of trees. Phones start on Low.

## Controls

- **Computer**: click to capture the mouse. WASD move, mouse look, click fire, right-click aim, Shift sprint, Space jump, C crouch, R reload, 1 / 2 / Q / mouse wheel switch gun, M map, Esc pause.
- **Phone**: the stick on the left moves (push past the rim to sprint); drag the right side of the screen to look; FIRE (big button on the right, small one on the left), AIM, JUMP, CROUCH and ⟲ reload. Tap a gun slot to switch.

## Run locally

ES modules don't load from `file://`. Double-click `play.bat` in the parent `Games` folder, or serve that folder:

```bash
python -m http.server 8000
# open http://localhost:8000/Battle-Game/
```

Testing aids (URL options): `?auto` starts the training ground, `?touch` shows phone controls, `?q=low|med|high` graphics, `?simple` skips the character model, `?cam=side|front` looks at the soldier from the side or front.

## Project layout

```
index.html      page, HUD, phone controls, menu, map, pause
css/style.css   styles
js/main.js      menu, camera, shooting, targets, HUD, minimap, main loop
js/world.js     the island: terrain, roads, buildings, trees, sea, map picture; collision and ray casts
js/soldier.js   movement and collision, poses (holding the rifle, crouching), hit areas, damage
js/weapons.js   gun stats, gun models, ammo and reload
js/fx.js        muzzle flashes, tracers, impact puffs
js/input.js     keyboard, mouse and touch controls
js/audio.js     synthesised sounds
js/human.js     built-in people (from Kadal Nagaram)
js/models.js    character model loader (from Kadal Nagaram)
```
