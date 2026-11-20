# Kadal Nagaram

An open-world 3D city by the sea that runs in the browser. It's built with plain HTML, CSS and JavaScript plus [three.js](https://threejs.org) from a CDN. There's no build step and no server code.

## Features

- **Real maps:** play in any real place. Pick a preset (Marina Beach, T. Nagar, Mylapore, Madurai, …), search any area, or use your GPS. Roads, buildings, parks, water, coastline and real street names come live from OpenStreetMap (free, © OpenStreetMap contributors, ODbL). Traffic, police, pedestrians and missions adapt to the real road network. Downloaded areas are cached in the browser.
- Lighting and materials: reflections from the sky, glossy clear-coat car paint, glass, bloom on lights at night, soft shadows, plus procedural asphalt, tiles, grass, sand and water textures
- Detailed city: building facades with grills, AC units, balconies, rooftop tanks, Tamil/English shop boards with awnings, a sculpted temple gopuram, palm trees, and street lamps that light up the road
- Smooth vehicle models with wheels, rims, mirrors and number plates; people built as skinned meshes with knees and elbows, plus veshti, saree, churidar and shirt-pant outfits
- Third-person camera on foot and in vehicles, with a rotating minimap
- Drivable hatchbacks, sports cars, auto-rickshaws, police jeeps and motorbikes (handbrake drifts; crash a bike and you get thrown off)
- Traffic AI that drives on the left and follows the road grid, plus pedestrians on the sidewalks
- Fist fights with no weapons: punch combos (every 3rd punch is a power hit), kicks and blocking. Some people fight back, others run away.
- A 5-star wanted level: police chase you, and you get caught if they corner you
- 8 missions (fish delivery, auto rush, police escape, coastal race, biryani bike delivery, street brawl, lighthouse run, thief chase), with ₹ rewards
- Sound, all synthesised in the browser with no audio files: engine, horn, police siren, crashes, punches, pickups, and a car radio with 4 stations of procedurally generated music
- Day/night cycle with a sunset sky, lit windows, street lamps and a lighthouse beam
- Coins and health pickups; progress saves to the browser (localStorage)
- Touch controls on phones (joystick + buttons)

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look around (click the game to lock the mouse) |
| Shift | Sprint |
| Space | Jump / handbrake |
| F | Enter / exit vehicle |
| E or click | Punch combo / start mission |
| Q | Kick |
| C or right-click | Block |
| H | Horn (in a vehicle) |
| R | Change radio station (in a vehicle) |
| M | Sound on / off |
| Esc or P | Pause |

## Run locally

ES modules don't load from `file://`, so serve the folder:

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Free hosting on GitHub Pages

1. Create a new public repository on GitHub, for example `kadal-nagaram`.
2. Push this folder:
   ```bash
   git init
   git add .
   git commit -m "Kadal Nagaram"
   git branch -M main
   git remote add origin https://github.com/<your-username>/kadal-nagaram.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**. Under **Source**, pick **Deploy from a branch**, then **main** and **/(root)**, and save.
4. After a minute the game is live at `https://<your-username>.github.io/kadal-nagaram/`.

## Project layout

```
index.html        page, HUD, menu, touch controls
css/style.css     styles
js/main.js        game loop, player, camera, police, pickups, sky, save
js/world.js       city generation, collisions, road network, minimap image
js/vehicles.js    vehicle models + arcade physics
js/traffic.js     traffic and police AI
js/characters.js  player/pedestrian models and animation
js/missions.js    mission markers, checkpoints, rewards
js/audio.js       synthesised sound effects + procedural radio
js/hud.js         HUD and minimap drawing
js/input.js       keyboard, mouse, touch input
```
