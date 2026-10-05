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
npx tsx scripts/experiencetest.ts     # kart track from a real drawing (lap, race) and the casino (spins, credits); PHONE=1 for touch
npm run build && npx vite preview --port 4317 & npx tsx scripts/updatetest.ts   # update banner, refresh back to the same spot, install row
```

The playtests claim rooms in the dev server's memory store; restart `npm run dev` for a clean town. The dev admin password is `toyboxes-dev`.

## Where things are

- `src/game/game.ts` runs the frame, spaces, interactions and the claim, PIN, rename and arrange flows.
- `src/world/` builds the town, interiors, toys, vehicles and day/night. `physics.ts` is a flat 2D solver with heights.
- `src/input/` maps devices to one action model. `src/ui/` holds dialogs, the PIN pad, on-screen keyboard and sketchbook.
- `server/` holds storage, crypto, room logic and admin logic. `api/` are thin Vercel handlers.
- `src/experiences/` holds built experiences (kart track, casino). They implement `SpaceView` (`src/world/space.ts`); the game handles entering, riding, interacting, kicking and pausing through its optional hooks.
- `src/shared/track.ts` turns a sketch into a track and validates it; `src/shared/slots.ts` holds the reels and paytable (the server decides spins; keep the return near 95%, `tests/scores.test.ts`).
- `docs/VERB_SHEET.md` describes the core interactions; keep it in step with gameplay changes.
