# Theevu Yudham

A third-person island battle game in the browser: land on the island, find guns, fight, and be the last one standing. Built with plain HTML, CSS and JavaScript plus [three.js](https://threejs.org) from a CDN, with no build step. The island, buildings, guns and sounds are generated in code; the soldier uses the same character models as Kadal Nagaram (`../GTA-Game/models/`).

## Status: all 5 steps done

| Step | What | Status |
|---|---|---|
| 1 | Island, soldier, third-person camera, 2 guns, controls | done |
| 2 | Loot, armour, med kits, 5 guns, shrinking zone, plane + parachute | done |
| 3 | Computer players (single-player battles) | done |
| 4 | Online with friends (2–6 players, last one standing wins) | done |
| 5 | Sound, effects, phone tuning, polish | done |

## Battle (step 2)

1. **The plane** crosses the island on a random route (dotted line on the map). Press **JUMP** (Space) when it's over where you want to land; at the end of the route you're dropped anyway.
2. **Free fall**: steer with the stick / WASD, push forward to dive faster. The **parachute** opens by itself about 95 m above the ground, or press **OPEN** (Space) earlier. Glide down and land on the ground or a roof.
3. **Loot** lies in every building, on and around the camp's crates and in the open: guns, ammo, armour vests and helmets (level 1 and 2), bandages, med kits and grenades. Walk over ammo, meds, armour and grenades to take them; guns show a pick-up button (F). You carry 2 guns; picking up a third swaps it with the one in your hands. A second copy of a gun you already have just gives you its bullets.
4. **The safe zone** shrinks in 6 stages (white circle = where it's going, blue = where it is now). Outside it you lose health every second, more in later stages. The zone timer and the distance to safety are under the minimap.
5. **Computer players** (11 on Low graphics, 15 on Medium, 19 on High; Easy / Normal / Hard in the menu) ride the same plane and each jumps at its own moment, glides down next to a gun, loots what it needs (better guns, ammo for its guns, armour, meds), heads into the next safe zone in time, and fights anyone it sees or hears, you and each other: strafing, firing in bursts, reloading, switching guns, healing when it's quiet. When one dies, its guns, ammo and meds drop where it fell. Harder levels see further, react faster and aim better.
6. **Result**: be the last one standing (**WINNER!**), or see who got you and your place (#N of M), your kills, damage and time survived. A red mark shows which side a hit came from.

### Guns

| Gun | Ammo | Notes |
|---|---|---|
| AR-K Rifle | rifle | automatic, all-rounder |
| SM-9 SMG | light | very fast, close range |
| M-12 Shotgun | shells | 8 pellets, deadly up close |
| K-98 Sniper | heavy | scope (aim), 2.5× headshots |
| P-9 Pistol | light | backup |

Armour vests absorb half of each hit until the armour runs out; helmets cut headshot damage by 30% / 50%. Bandage: +15 health (2 s), med kit: +75 (5 s); you can walk while healing, firing stops it. Grenades bounce and go off after 2.6 s (7 m blast, walls block it).

## Online with friends (step 4)

- Press **PLAY ONLINE WITH FRIENDS**, type your name and **CREATE ROOM** to get a 6-letter code (or copy the invite link). Friends type their name and the code and press **JOIN**. 2 to 6 players, each on their own phone or computer; the host presses **START MATCH**.
- Only your group is on the island: no computer players. Everyone gets the same island loot, plane route and zone, jumps when they like, and fights everyone else. The last one standing wins; the others see who won.
- When you're out you can **SPECTATE** the players still alive (NEXT PLAYER / RESULTS). When the match is over, the host starts the **NEXT MATCH** with whoever is in the room (new friends can join between matches).
- How it works: the browsers connect directly with WebRTC using [PeerJS](https://peerjs.com) (loaded only when you play online); the host's browser passes every message on to the others. Each phone moves its own soldier and sends where it is about 15 times a second; the others draw it slightly behind real time so it moves smoothly. The shooter's screen decides what a bullet hits and tells the player who was hit, whose screen takes the damage (armour, helmet) and announces a death. Picking up and dropping loot is shared, so an item can only be taken once. If someone leaves, they're out of the match. Some networks (strict office/college Wi-Fi, some mobile data) block direct connections.

## Sound, effects and phone tuning (step 5)

- **Sound you can play by**: other players' shots and footsteps come from their side (left / right) and get quieter and duller with distance, with an echo far away; a whiz when a bullet passes close; the sea near the coast, wind up high, the plane's engines; an alarm when the zone starts shrinking (and a warning 10 s before); a heartbeat when your health is low.
- **Effects**: helmets and armour vests show on everyone (level 1 olive, level 2 dark blue); damage numbers over the people you hit (yellow for headshots); an ELIMINATED / HEADSHOT banner with your kill count; red edges when health is low; speckled ground and plastered walls.
- **Phones**: gentle aim assist when an enemy is right next to the crosshair (pause menu: AIM ASSIST on/off); the resolution drops by itself when the game runs slowly and comes back when there's room; a short vibration when you're hit or get a kill; look speed in the pause menu; tips on the loading screen.

## Training ground (step 1)

- **The island** (about 1 km across): Kovil Town with 1 and 2 floor buildings and a temple tower, the fishing village Meenavar Kuppam on the beach, Thottam Farm, Malai Camp on the hill with barracks, a watch tower and a shooting range, Kaadu Hills, roads between them, forest, palms, rocks, bushes and the sea.
- **Buildings you can enter**: doors, open windows you can shoot through, stairs to the upper floor, roof parapets.
- **The soldier**: run, sprint, walk, crouch, jump, swim; collision with walls, floors, steps, trees and rocks; holds the rifle and aims where the camera looks.
- **Third-person camera** over the right shoulder that pulls in when a wall is behind you; aiming zooms in.
- **Guns**: AR-K rifle (automatic) and P-9 pistol, with spread, recoil, reload, muzzle flash and tracers. Headshots do double damage.
- **Training targets** in the town streets and on the camp's range: they fall when killed and stand up again.
- **HUD**: health and armour, ammo, gun slots, crosshair that opens up with movement and spraying, hit markers, kill feed, compass, area names, rotating minimap and a full map.
- **Graphics setting** (Low / Medium / High): view distance, shadows, terrain detail, number of trees. Phones start on Low.

## Controls

- **Computer**: click to capture the mouse. WASD move, mouse look, click fire, right-click aim (scope for the sniper), Shift sprint, Space jump (and jump from the plane / open the parachute), C crouch, R reload, 1 / 2 / Q / mouse wheel switch gun, F pick up a gun, 4 bandage, 5 med kit, G grenade, M map, Esc pause.
- **Phone**: the stick on the left moves (push past the rim to sprint); drag the right side of the screen to look; FIRE (big button on the right, small one on the left), AIM, JUMP, CROUCH and ⟲ reload. Tap a gun slot to switch; bandage, med kit and grenade buttons are on the left; tap a gun's name to pick it up; the big orange button jumps from the plane and opens the parachute.

## Run locally

ES modules don't load from `file://`. Double-click `play.bat` in the parent `Games` folder, or serve that folder:

```bash
python -m http.server 8000
# open http://localhost:8000/Battle-Game/
```

Testing aids (URL options): `?mp=host&name=A` / `?mp=join&room=CODE&name=B` create / join an online room automatically, `?auto` starts a battle (`?auto=training` the training ground), `?bots=5` sets how many computer players, `?level=hard`, `?god` makes you unhurtable, `?fixedres` turns off the automatic resolution, `?seed=7` fixes the loot, zone and plane route, `?speed=10` runs time faster, `?touch` shows phone controls, `?q=low|med|high` graphics, `?simple` skips the character model, `?cam=side|front` looks at the soldier from the side or front.

## Project layout

```
index.html      page, HUD, phone controls, menu, map, pause
css/style.css   styles
js/main.js      menu, match flow, camera, shooting, healing, grenades, HUD, maps, main loop
js/world.js     the island: terrain, roads, buildings, trees, sea, map picture; collision and ray casts
js/soldier.js   movement and collision, poses (holding the rifle, crouching), hit areas, damage
js/weapons.js   gun stats, gun models, ammo types and reload
js/loot.js      loot table, item models, the bag, picking up
js/zone.js      the shrinking safe zone
js/drop.js      the plane route, plane and parachute models
js/grenade.js   thrown grenades
js/bots.js      computer players: drop, looting, zone, finding their way into buildings, fighting
js/combat.js    bullet hits and damage (shared by everyone)
js/net.js       online rooms for 2–6 players (PeerJS / WebRTC)
js/fx.js        muzzle flashes, tracers, impact puffs
js/input.js     keyboard, mouse and touch controls
js/audio.js     synthesised sounds
js/human.js     built-in people (from Kadal Nagaram)
js/models.js    character model loader (from Kadal Nagaram)
```
