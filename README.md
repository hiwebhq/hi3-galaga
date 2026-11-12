# HI3 – THE GALACTIC DEFENDER

An original retro arcade space shooter in the style of early-1980s fixed-screen
cabinets. Pure HTML5 Canvas + JavaScript + Web Audio — no build step, no
dependencies, no image or sound files (all pixel art and audio are generated in code).

## Play online

**<http://galaga.hi3.cc>** — works on desktop, iPad and Android, nothing to install.
(It redirects to the GitHub Pages site: <https://hiwebhq.github.io/hi3-galaga/>)

## Run it locally

### Desktop (quickest)
Double-click `index.html`. It runs straight from the file system.

### Desktop, iPad and Android (local web server)
From this folder:

```bash
python3 -m http.server 8000
```

- **This computer:** open <http://localhost:8000>
- **iPad / Android phone:** connect to the same Wi-Fi, find the computer's address
  (`ipconfig getifaddr en0` on a Mac) and open `http://<that-address>:8000`
  in Safari or Chrome.
- Optional: use the browser's **Add to Home Screen** to launch it full-screen like an app.

To play away from home, upload the folder to any static host
(GitHub Pages, Netlify, Cloudflare Pages) — there is no backend.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← → or A / D | ◀ ▶ buttons, or drag on the playfield (auto-fires) |
| Fire | Space | FIRE button |
| Pause | Esc (or P) | II button |
| Start / select | Enter | Tap the menu item |
| Menus | ↑ ↓, ← → adjusts sliders | Tap / drag sliders |
| Mute | M | ♫ button |

## Gameplay

- Four alien classes: Basic (50), Advanced (80), Elite (150, 2 hits), Commander (400, 2 hits).
- Aliens fly in, hold formation, then peel off in swoops, S-curves, fast diagonals,
  multi-dives and commander-led squads. Destroy a commander's whole squad mid-dive for **+500**.
- **Capture beam** (stage 5+): a commander hovers and projects a beam after a short warning.
  If you are caught, shoot the commander before it reels you in for a **+1000 rescue**;
  fail and you lose the ship. Destroying a beaming commander without being caught is **+300**.
- **Bonus stage** after stage 3, then every 4 stages: 40 aliens in choreographed patterns that
  never fire. 100 each, an accuracy bonus up to 500, and **+1000** for a perfect.
- Extra ship at 15,000 and every 40,000 after. Endless stages with a gradual difficulty ramp.
- Top-5 high scores (with initials) and settings are saved in the browser's local storage.

## Tuning

Everything adjustable lives in `js/config.js`: player speed, shot limit, lives, scores,
extra-life milestones, bonus-stage timing, capture-beam timings and the `difficulty(stage)` curve.

## Project layout

```
index.html            page shell, touch buttons
style.css             layout, scaling, CRT overlay
js/config.js          constants + difficulty curve
js/sprites.js         pixel art + bitmap font
js/audio.js           audio manager (synth SFX + music sequencer)
js/input.js           input manager (keyboard, touch, pointer)
js/effects.js         starfield + particle system
js/projectiles.js     projectile manager
js/player.js          player controller
js/enemies.js         enemy + formation manager, attack patterns, capture beam
js/levels.js          level manager, stage layouts, bonus stages
js/ui.js              HUD, menus, screens
js/game.js            engine loop, state machine, collisions, scoring, storage
```
