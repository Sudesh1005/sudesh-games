# Carrom Raja

A 3D carrom game in the browser: a real-proportion board (74 cm playing surface, 3.18 cm coins, 4.13 cm striker, 4.45 cm pockets) with the printed base lines, arrows and centre design, a varnished rosewood frame and ivory, ebony and red queen coins under a hanging lamp. Built with plain HTML, CSS and JavaScript plus [three.js](https://threejs.org) from a CDN. There's no build step and there are no asset files: the board, the coins and the sounds are all generated in code.

## Ways to play

- **vs Computer**: 2 players (you against the computer) or 4 players (you and a computer partner sitting opposite, against two computer players). Easy / Normal / Hard.
- **Same Phone**: 2 or 4 people take turns on one device. The board turns to face whoever is playing.
- **Online**: create a room and share the 6-letter code (or invite link); friends join with the code and their name. Choose 2 or 4 players. Empty seats are played by the computer, and if someone leaves, the computer takes over their seat.

## How to play

- Place the striker on your base line with the slider (or drag along the line), then touch the board, **pull back and let go**. The further you pull, the harder the shot. The dotted guide shows the striker's path, where it touches the first coin and where that coin goes (switch it off with GUIDE for a real challenge).
- The first player plays **white**, the other side **black**. With 4 players, partners sit opposite each other and play as a team.
- Pocket one of your coins and you shoot again.
- **Queen**: pocket the red queen, then **cover** her by pocketing one of your own coins in the same shot or the next one, or she goes back to the centre. She must be covered before a side's last coin goes in.
- **Foul**: if the striker goes into a pocket, you lose your turn and one of your pocketed coins comes back to the centre (or is owed if you have none yet).
- Pocket all 9 of your coins with the queen covered to win the board. Points: the other side's coins still on the board, +3 if your side covered the queen.

## How it works

- `physics.js` simulates every coin in 1 ms steps: sliding friction on the powdered board, elastic coin-to-coin collisions (the striker is about three times heavier than a coin), bounces off the frame and capture by the pockets. It uses only basic arithmetic, so every browser gets the same result from the same shot.
- The computer finds coins it can cut into a pocket (the "ghost coin" method), tries the best few shots on a copy of the board, and plays the one that works out best, with less careful aim on easier levels.
- Online, the player whose turn it is sends the shot; every screen plays it out, and the shooter's screen then sends the final board so everyone stays in step. The browsers connect directly with WebRTC using [PeerJS](https://peerjs.com) (loaded only when you play online); some networks (strict office/college Wi-Fi, some mobile data) block direct connections.

## Run locally

ES modules don't load from `file://`. Double-click `play.bat` in the parent `Games` folder, or serve that folder:

```bash
python -m http.server 8000
# open http://localhost:8000/Carrom-Game/
```

Testing aids (URL options): `?auto` starts straight away, `?mode=cpu|local`, `?n=4`, `?level=easy|normal|hard`, `?bot` lets the computer play your turns too, `?speed=4` runs faster, `?touch` shows phone layout, `?mp=host&name=A&n=4` / `?mp=join&room=CODE&name=B` create/join an online room automatically.

## Project layout

```
index.html      page, HUD, menu, online lobby, pause and results
css/style.css   styles
js/main.js      menu, turns (you, computer, same phone, online), aiming and shooting, camera, HUD
js/physics.js   board measurements, coin physics and the carrom rules (queen, fouls, winning)
js/ai.js        the computer player
js/board.js     3D board, frame, pockets, coins, striker and aim guide
js/net.js       online rooms for 2 or 4 players (PeerJS / WebRTC)
js/audio.js     synthesised sounds
```
