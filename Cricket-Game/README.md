# Kaathu Cricket

A short 3D cricket match in the browser, shown from a TV-broadcast camera behind the bowler. Built with plain HTML, CSS and JavaScript plus [three.js](https://threejs.org) from a CDN. There's no build step and there are no asset files: the stadium, players and sound are all generated in code.

## Ways to play

- **vs Computer**: when you bat, the computer bowls; when you bowl, the computer bats. Easy / Normal / Hard.
- **Online with a friend (2 players)**: one player presses **CREATE ONLINE MATCH** and gets a 6-letter code (or an invite link). The friend types their name and the code and presses **JOIN**. One bats while the other bowls, then they swap.

## Match settings (chosen by whoever creates the match)

- **Overs**: 1, 2, 3 or 5 per innings
- **Wickets**: 1, 2, 3 or 5 per innings
- **Who bats first**: a real **toss** (the other player calls heads or tails; the winner chooses to bat or bowl), or the creator simply chooses **I bat** / **I bowl**

The first innings sets the target; the second team chases it. Most runs wins (or a tie).

## Controls

**Batting**: press **Space** or click (tap **HIT** on phones) as the ball reaches you.
- Timing decides everything: perfect timing hits it hard, a little early pulls it to the leg side, a little late sends it to the off side, badly mistimed edges it or misses.
- **← ↑ →** (or the ◀ ▲ ▶ buttons) choose the direction, **↓** / AUTO plays with the line of the ball.
- Hold **Shift** (or switch on **LOFT**) to hit it in the air: sixes, but also catches.
- If you miss and the ball hits the stumps, you're bowled.

**Bowling**: move the mouse (or drag on phones) to put the yellow marker where the ball should pitch.
- **1 / 2 / 3** (or the buttons) pick pace, off spin or leg spin.
- Click / Space / **BOWL** to bowl. The needle on the meter swings: the closer it is to the middle when you bowl, the more accurate the ball. Accurate pace balls are also faster.
- Full and straight balls are hard to score off and can bowl the batter; wide ones give away a wide.

**Other**: M toggles sound. ✕ quits the match.

## How the cricket works

- Each delivery is a real ball flight: it pitches, bounces, seams (pace) or turns (spin), and either reaches the bat, hits the stumps, goes wide or carries to the keeper.
- A hit ball flies with drag and bounces/rolls across the outfield. Ten fielders (positions change for pace and spin) run for it: the first to reach it catches it (if it hasn't bounced) or stops it and throws it back. Catches can be dropped and hard-hit balls can beat the fielder.
- The batters run while the ball is being fielded: 0 to 3 runs. Reaching the rope is 4 (after a bounce) or 6 (on the full).

## How online play works

The browsers connect directly with WebRTC using [PeerJS](https://peerjs.com) (loaded only when you play online). The match code is the creator's ID on the free public PeerJS server, which only introduces the two browsers. The bowler's screen sends each delivery; the batter's screen times the shot, works out what happens and sends the result back, so both scoreboards always match. If either player leaves, the match ends. Some networks (strict office/college Wi-Fi, some mobile data) block direct connections.

## Run locally

ES modules don't load from `file://`. Double-click `play.bat` in the parent `Games` folder, or serve that folder:

```bash
python -m http.server 8000
# open http://localhost:8000/Cricket-Game/
```

Testing aids (URL options): `?auto` starts a match vs the computer, `?bot` lets the computer play for you too, `?first=bat` / `?first=bowl` skips the toss, `?speed=3` runs faster, `?touch` shows phone controls, `?low` uses phone graphics, `?mp=host&name=A` / `?mp=join&room=CODE&name=B` create/join an online match automatically.

## Project layout

```
index.html      page, scoreboard, batting/bowling controls, menu, lobby, toss, results
css/style.css   styles
js/main.js      menu, toss, ball-by-ball flow (vs computer and online), controls, camera, HUD
js/play.js      the cricket: deliveries, shot timing, ball flight, fielding, catches, runs; computer batting and bowling
js/match.js     match state: innings, overs, wickets, target, result
js/ground.js    stadium: outfield, pitch, stumps, boundary, stands and crowd, sight screens, floodlights
js/people.js    batters, bowler, fielders, keeper and umpire with simple animations
js/net.js       2-player online matches (PeerJS / WebRTC)
js/audio.js     synthesised sound
```
