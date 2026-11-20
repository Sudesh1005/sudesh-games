# Character models (optional)

Put artist-made characters here and the game uses them instead of its built-in people.
If this folder has no `manifest.json`, the game keeps the built-in characters.

## Get free characters from Mixamo

1. Go to https://www.mixamo.com and sign in with a free Adobe account.
2. **Characters**: pick one character for the player and 2–5 for pedestrians.
   For each one, click **Download** and choose:
   - Format: **FBX Binary (.fbx)**
   - Pose: **T-pose**
   
   Save them here as `player.fbx`, `ped1.fbx`, `ped2.fbx` … (and optionally `thug.fbx`).
3. **Animations**: keep any character selected, search for each animation below, tick **In Place**
   where it's offered, then **Download** with Format **FBX Binary**, Skin **Without Skin**.
   Save each one here with the file name shown:

   | Search on Mixamo | Save as |
   | --- | --- |
   | Idle | `idle.fbx` |
   | Walking | `walk.fbx` |
   | Jogging (or Running) | `run.fbx` |
   | Fast Run | `sprint.fbx` |
   | Punching | `punch.fbx` |
   | Mma Kick | `kick.fbx` |
   | Center Block | `block.fbx` |
   | Sitting | `sit.fbx` |
   | Falling Back Death (or Knocked Down) | `fall.fbx` |

4. Copy `manifest.example.json` to `manifest.json` and edit the `peds` list so it matches the
   files you saved. Missing animations are fine: the game falls back to the closest one.
5. Reload the game (Ctrl + F5).

`.glb` / `.gltf` files work too; list them in `manifest.json` the same way.

## Licence note

Adobe lets you use Mixamo characters and animations in your own games for free.
Don't share the raw model files as a separate download or asset pack.
