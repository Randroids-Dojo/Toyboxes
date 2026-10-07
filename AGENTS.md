# AGENTS.md

Rules for any coding agent working in Toyboxes.

## Product

A 3D town in the browser. Visitors walk, ride a scooter or go-kart, kick a ball around, visit the SpaceChakra and VibeCoded Games arcades, and claim a house as their own room. Owners arrange toys in their room and write game ideas in its sketchbook. The creator reads those pages in `/admin` and publishes game cabinets and inner areas back into the room. The design document is the Toyboxes GDD (Google Doc); `docs/ACCEPTANCE.md` tracks its release checks.

## Rules

1. **No em dashes or en dashes.** Not in code, comments, copy, commits or PRs. Use a period, comma, colon or parentheses.
2. **Commit messages and PR descriptions read as written by a human.** No AI attribution, no generated-by footers.
3. **Visits are solo.** Rooms, layouts, pages and published content are shared and persistent; players and loose-object physics are local. Never present anything as live multiplayer.
4. **The PIN guards changes, never entry or reading.** Anyone can enter any room or inner area and read its sketchbook. Every protected write calls `requireEdit` on the server (`server/rooms.ts`); never trust a client-side unlock. PIN hashes and owner keys never leave the server (`publicRoom` is the only public shape).
5. **Names are labels, not identity.** Never look records up by name. Renaming a room needs a fresh PIN check and touches only that room.
6. **Layout rules live in `src/shared/model.ts`** and run in both the browser and the API. Change them there, keep the starter layout valid (`tests/model.test.ts`), and remember saved layouts must still pass.
7. **Every input path.** A feature is not done until it works with touch, keyboard and mouse, a controller (d-pad focus, A, B), and a TV remote (arrows, OK, Back). Dialogs go through `UI.open` so focus and Back work; text fields get the on-screen keyboard on controllers and TVs.
8. **Honest saving.** Show success only after the server confirms. Keep drafts recoverable locally on failure and handle 409 conflicts explicitly.
9. **Copy is short, plain and sentence case.** Talk about rooms, towns, toys and pages. Never call it a metaverse.
10. Server-side relative imports keep their `.js` extension (the Vercel functions run as ESM). Never commit `.env*` files or print secrets.

## Commands

```bash
npm run dev        # Vite on :5207 with the API served from memory (no setup needed)
npm run typecheck
npm test           # model rules + API behaviour (claim race, PINs, pages, admin)
npm run build
npx tsx scripts/playtest.ts desktop   # scripted flows with screenshots (dev server running)
npx tsx scripts/playtest.ts phone     # same with touch input at 390x844
npx tsx scripts/padtest.ts            # injected gamepad: on-screen keyboard, PIN pad, pen mode, disconnect
npx tsx scripts/admintest.ts          # creator loop: review, publish, PIN reset, second browser
npx tsx scripts/arcadetest.ts         # arcade round trip with Back
npx tsx scripts/gatetest.ts           # each world's door in a room: views by day and night, floor colliders, draw calls
npx tsx scripts/kittest.ts            # the worlds kit: HUD, particles, post, music clock, camera shots, capture, carry; PHONE=1, PAD=1, REMOTE=1
npx tsx scripts/experiencetest.ts     # the casino (slots, roulette, blackjack, credits) and a visit to the kart track; PHONE=1 for touch
npx tsx scripts/karttest.ts           # the Toybox Grand Prix: warm-up, race, drift, items, results, time trial, every circuit's z-audit and budgets; PHONE=1, PAD=1, REMOTE=1
npx tsx scripts/casinotest.ts         # the riverboat casino voyage: every game, stamps and ranks, the lounge, the logbook, tiers; PHONE=1, PAD=1, REMOTE=1
npm run build && npx vite preview --port 4317 & npx tsx scripts/updatetest.ts   # update banner, refresh back to the same spot, install row
```

The playtests claim rooms in the dev server's memory store; restart `npm run dev` for a clean town. The dev admin password is `toyboxes-dev`.

## Where things are

- `src/game/game.ts` runs the frame, spaces, interactions and the claim, PIN, rename and arrange flows.
- `src/world/` builds the town, interiors, toys, vehicles and day/night. `physics.ts` is a flat 2D solver with heights.
- `src/input/` maps devices to one action model. `src/ui/` holds dialogs, the PIN pad, on-screen keyboard and sketchbook.
- `server/` holds storage, crypto, room logic and admin logic. `api/` are thin Vercel handlers.
- `src/experiences/` holds built experiences (kart track, casino). They implement `SpaceView` (`src/world/space.ts`); the game handles entering, riding, interacting, kicking and pausing through its optional hooks.
- `src/shared/track.ts` turns a sketch into a track and validates it (corner radius, curb folds, overlaps); `src/shared/circuits.ts` builds designed circuits; `src/experiences/kart/` is the Toybox Grand Prix (its circuits, rules and lap ghosts are in `src/shared/kart/`, and `server/kart.ts` re-checks board laps); `src/shared/slots.ts` holds Old Lucky's reels, paytable, jackpots and the casino stats shape (the server decides spins; keep the return near 95%, `tests/casino-rules.test.ts`). `src/shared/casino-games.ts` and `src/shared/casino/` hold the other games' rules, stamps, ranks and stats migration; `server/casino.ts` decides every result (`api/casino.ts`; the old `api/scores.ts` casino actions are aliases). The world itself is `src/experiences/casino/`.
- `docs/VERB_SHEET.md` describes the core interactions; keep it in step with gameplay changes.

## Building a world

Each experience is meant to feel like its own game. New and rebuilt worlds live in their own folder (`src/experiences/<kind>/`, with a CSS file imported from TypeScript) and use the shared kit in `src/experiences/kit/`:

- `Hud` (`kit/hud.ts`): a themed HUD layer. Title sweep on arrival, stat strip and bars, objective line, banners, judgements ("Perfect"), score pops at world points, flashes that work on every tier, letterboxing, a 3-2-1 countdown, and the intro and results cards (through `UI.open`, so every input path works). Call `hud.update(dt)` from `step` so timers pause with the game.
- `Particles`, `Ribbon`, `Shockwaves` (`kit/particles.ts`): one draw call per system, budgets scaled by `setQuality`. Call `update(dt)` every frame.
- `PostFX` (`kit/post.ts`): tiered bloom and a colour grade through the `render` hook. The low tier draws plainly, so nothing essential may depend on it.
- `music` (`src/audio/music.ts`): songs as data on a procedural sequencer, with layers, section queueing and looping, ducking, a muffling filter, pause and resume, and an audio-clock `beat()` corrected for output latency. It plays on the Music level in Settings. Stop it in `dispose`. `tone` and `noise` in `src/audio/sfx.ts` make one-off effects.
- `Progress` (`kit/progress.ts`): stars, unlocks and choices saved on this device.
- World boards: list modes in `src/shared/score-modes.ts`, post with `api.score` and read with `api.modeBoards`. The server checks each result against the mode's range, so set `min` and `max` from what a perfect run can do. A mode can also require a run ticket (`ticket.minMs`, started with `api.runStart`) and can have the server work the score out from a run log (`fromLog`, pure shared code).

Engine hooks for worlds (`src/world/space.ts`, `ExperienceCtx` in `src/experiences/common.ts`):

- `cameraShot(dt)` directs the camera (flyovers, podiums, chase or fixed framing); `lockPlayer` freezes the player and Interact runs `skip`. While a shot is in charge, walking is relative to the shot's view.
- `captureInput()` stops the game moving the player and handling interact, kick and jump; read `ctx.input` yourself (rhythm games, aiming) and give the touch buttons labels.
- `carry(h, player, move)` puts the player on a scripted path or your own flight model, with a body pose; return null to hand back to normal physics.
- `jumpAction` repurposes Jump; `runScale` turns off the run bonus in timed rounds so every device competes fairly.
- `ctx.teleport`, `ctx.impulse` (launches), `ctx.shake`, `ctx.squash`, `ctx.pose` (dance, crouch, aim, cheer, float...), `ctx.swing`, `ctx.hold` (something in the right hand), `ctx.cameraYaw`, `ctx.tier`, `ctx.reduceMotion`. `PlayerState` carries height, vertical speed and grounded.
- Rhythm timing: `ctx.input.pressedAt(action)` gives the event time of the last press and `ctx.input.takeDirs()` the directional presses (arrows, WASD, d-pad, stick flicks) with their times; compare them with `music.beat()`.

A TV remote has arrows, OK and Back only, so a world's core game must be playable with move and interact. Playtests use `scripts/lib/world.ts` (claims a local room, publishes the area, drives real input on desktop, `PHONE=1`, `PAD=1` and `REMOTE=1`); `scripts/kittest.ts` checks the kit itself.
