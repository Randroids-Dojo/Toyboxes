# First release acceptance

The GDD's fifteen release checks, what passed, and what still needs a person with the device in hand. "Automated" means a script drove the running app with real input events and asserted the result; screenshots land in `/tmp/toyboxes-*`. Unless noted, every automated check passed both locally and against production at https://toyboxes.games (production runs clean up their data with `scripts/kvsnapshot.ts`).

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Name asked once, remembered on return; same name elsewhere gets no rights | Automated | `playtest.ts` steps 1 and 8 (reload asks nothing); `server.test.ts` "a token for one room cannot edit another", rename with two rooms both named Alex |
| 2 | Explore, enter indoor spaces, ride both vehicles, readable day and night | Automated, plus judgment | `playtest.ts` steps 2, 3, 3b, 4; screenshots at night and day (the cycle is shared from the clock). Night readability judged from screenshots; confirm on the TV |
| 3 | Claim only after entering and confirming a four-digit PIN; a race has one owner | Automated | `server.test.ts` claim race (also passes against live Upstash with `KV_CHECK=1`), PIN mismatch and leading zeroes; `playtest.ts` step 4, `padtest.ts` step 4 |
| 4 | Anyone can enter every published room and inner area; entry never asks for a PIN | Automated | `admintest.ts` second browser enters the room and its inner area and reads the sketchbook; asserts no PIN pad appeared until it chose "Write or edit" |
| 5 | Wrong PIN cannot edit; correct PIN edits, including from another browser | Automated | `server.test.ts` (forged and missing tokens, wrong PIN, other-browser unlock); `playtest.ts` step 9 wrong PIN changes nothing |
| 6 | New page is a separate request; editing an older page keeps its identity | Automated | `server.test.ts` sketchbook tests; `playtest.ts` step 5 writes two pages and revises page 1 |
| 7 | Creator builds from pages, places results in the main room or inner areas, publishes | Automated | `admintest.ts`: cabinet linked to page 1 in the main room, an inner area with toys and its own cabinet, drafts hidden until published |
| 8 | Ball responds and the goal can be repositioned; placement survives reloads and appears to others | Automated | `playtest.ts` step 6 (arrange and save) and step 7 (kick scores a goal); layouts come from the server for every visitor |
| 9 | Rename offers browser-only or associated data; associated needs a valid PIN and never touches same-name records | Automated | `playtest.ts` step 9; `server.test.ts` rename |
| 10 | Admin resets or changes a PIN and cleans up abusive claims; claim and PIN limits apply server-side | Automated | `admintest.ts` PIN reset revokes the old session; `server.test.ts` release, per-network claim limit, per-room PIN lockout |
| 11 | Both arcade entrances reach the intended sites; returning works | Automated in desktop Chromium | `arcadetest.ts` (external sites stubbed; asserts the exact URLs and the return spot). Needs a check on each target device |
| 12 | Touch, keyboard and mouse, and a controller complete their flows; the Samsung TV browser tested directly | Partly automated | Touch (emulated phone with real touch events), keyboard and mouse, and an injected standard gamepad all pass. **Not yet done:** the Samsung QN77S90HAEXZA browser (loading, focus, text and PIN entry, gamepad, readability) and a physical controller and phone |
| 13 | No accidental selection or scrolling; text editing works; no overlap | Partly automated | Play surface uses `touch-action: none`, no selection or callouts, a touchmove guard, and a Back guard; text fields stay editable. Layouts checked in desktop and 390x844 screenshots. Confirm on a real phone with the system keyboard open |
| 14 | Second browser sees shared saved content; nothing pretends to be live multiplayer | Automated | `admintest.ts` second browser; no other players or synced physics exist |
| 15 | Save failures, interrupted connections, reloads and controller disconnects recover honestly | Automated | `playtest.ts` offline save shows "Couldn't save", keeps the draft and recovers with Retry; `padtest.ts` disconnect opens the menu with a note; reloads restore the name and the arcade return spot |

## Built from sketchbook pages (2026-10-04)

Randroid's room 1 asked for two things on its sketchbook pages:

| Page | Idea | Built | Evidence |
| --- | --- | --- | --- |
| 1 | A go-kart track to race CPU players and set personal best lap times | The **Kart track** inner area: timed laps, personal bests, a best-laps board and 3-lap races. Rebuilt after the page was edited (below) | `scripts/experiencetest.ts` (desktop and `PHONE=1`), `tests/track.test.ts`, `tests/scores.test.ts` |
| 2 | A casino with a giant slot machine you walk up to and spin; credits earned and spent tracked over time | The **Casino** inner area, with a giant slot machine with a lever, server-decided spins, totals and a balance-over-time chart per player, and a top balances board | same |

Page 1 was edited: "make it an actually fun race", check for z-fighting and overlapping track pieces, and put characters in the computer karts. Built automatically on 2026-10-05:
- **The course:** the drawing's tightest corner had a 4.9 m radius, less than the 5.4 m from the centre line to the outside of the curb, so the inner curb folded over itself. It is replaced by the designed **Toybox Grand Prix** circuit (`src/shared/circuits.ts`, about 560 m): a long main straight, a tight first corner, a fast kink, esses, a hairpin and a long sweeper. Drawings can still be used; they are smoothed until no corner is tighter than 7.4 m.
- **No z-fighting:** the road sits at ground level with the grass below it, the curbs are raised strips, and paint (start line, grid, boost pads, lamp light) is pulled forward in depth. `tests/track.test.ts` checks the corner radius, curb folds and the gap between separate parts of the road, and `trackProblem` now rejects courses with corners too tight for the curbs.
- **A real race:** drifting with mini-turbos, boost pads, slipstreams, rocket starts, start lights, corner grip, a six-kart grid, a minimap, a final lap call and a results list.
- **Characters:** Bolt the robot, Hopper the frog guy, Mittens the cat, Puddles the duck and Rex the dino, each with their own driving style. They steer, look into corners, blink, and cheer or sulk at the finish.

Page 2 was edited to ask for other casino games as well. Built automatically on 2026-10-05: a **roulette wheel** and a **blackjack table** with a robot dealer in the Casino, sharing its credits. The server decides every spin and every card. Evidence: `scripts/experiencetest.ts` (desktop and `PHONE=1`), `tests/casino-games.test.ts`.

The Casino was then rebuilt as its own world, **The Golden Paddle**, a riverboat casino (`src/experiences/casino/`): Old Lucky (a giant slot with a paddle wheel bonus and MINI, MAJOR and a growing GRAND), The Spinning Lily roulette, Rivet's Twenty-One blackjack, the River Wheel on the Stern Deck, Lucky Falls and Five Card Cabin video poker in the Moonlight Lounge, and the Captain's Table in the Wheelhouse. Brass automaton staff, a ragtime band, 35 logbook stamps and earned ranks that open the upper rooms, Penny's free top ups and the Captain's Logbook with charts and boards. Balances carried over; old stats and open blackjack hands are migrated. Play credits only, never real money. Evidence: `scripts/casinotest.ts` (desktop, `PHONE=1`, `PAD=1`, `REMOTE=1`), `scripts/experiencetest.ts`, `tests/casino-*.test.ts` (rules, server, blackjack, poker, layout, and a geometry test for coplanar faces).

Room 12 (estevan) asked for a "black hole galaxy" (page 1, with a drawing of a ringed planet, a swirl and streaking comets). Built automatically on 2026-10-05:
- **Black hole galaxy:** a portal-dimension inner area in its own art style (shader nebula, accretion disk, photon ring, bending light, iridescent glass platform, comet streaks).
- **Gameplay:** kick orbs into the black hole, plus 60-second feeding frenzies with a board.
- **Graphics tiers:** set by the Graphics setting, or measured on Auto.
- **Evidence:** `scripts/galaxytest.ts` (desktop and `PHONE=1`) records frame times per tier.

## Needs a person

- Load https://toyboxes.games on the Samsung S90H browser: check that focus is visible, the remote's arrows, OK and Back work, the on-screen keyboard and PIN pad work from the couch, and whether the TV browser exposes a paired controller.
- Play on a real phone: stick feel, drag-to-look, the system keyboard over the sketchbook, and frame rate.
- Judge vehicle handling, camera comfort and night readability; the numbers are in `src/world/vehicles.ts`, `src/game/camera.ts` and `src/world/sky.ts`.
- Race the computer drivers and tune their pace (`skill` and `nerve` in `src/experiences/kart-drivers.ts`); try the casino's pace of wins over a longer session.
- Drift on a real phone with two thumbs (stick and Brake together). Headless touch emulation only tracks one finger, so the phone playtest checks the stick and the Brake button separately.

## Choices made where the GDD left them open

- **Engine and data:** Three.js with a custom flat-ground physics layer; Upstash Redis behind Vercel functions.
- **Admin auth:** a password from `ADMIN_PASSWORD` with a signed HttpOnly session cookie. Swapping in an identity provider later only touches `server/admin.ts`.
- **Town:** 12 claimable houses around a ring road; vehicles are parked objects you can ride away and leave anywhere (the menu parks them again).
- **Day and night:** a 24-minute cycle shared through the wall clock; settings can pin day, sunset or night.
- **Sketchbook:** every visitor can read every page (the user's call, 2026-10-04); only writing needs the PIN. Pages the creator removes in `/admin` are hidden from everyone. A status stamp (Requested, Being built, Ready to play) shows on each page. Drawing is a simple pen with six colours, three sizes, undo and clear.
- **Unlock lifetime:** 30-minute edit tokens; the game relocks after 5 quiet minutes or on leaving the room.
- **Claim limits:** one active room per browser, a 10-minute cooldown, 6 claims per network per day, 5 wrong PINs per room per 15 minutes, 25 per network per hour.
- **Domains:** toyboxes.games is canonical; toyboxes.app and both www hosts 308-redirect to it.

## Room 11: Neon space party

Built from page 1 (revision 1): a neon space arena, moving laser-tag drones, a close-range glowing baton, and a floor-panel dance final against a 160-point robot benchmark. Round points are local feedback, never shared or persistent scores. The arena is solo, with a replay pad and a clear exit. `tests/neon.test.ts` checks aiming and one-score-per-beat timing. `scripts/neontest.ts` drives laser, baton, dance, result, replay and exit via desktop, touch and remote Action mappings. The same neon test runs with an injected standard controller as well, including laser, baton, dance, replay and exit. Desktop tests use the day view and touch tests use the night view.

### Room 2: Fart simulator

Built from page 1 (revision 1): a cartoon target course with cycling pressure, aimed puffs, five hoops, a 30-second round, local results, replay and exit. No visitor or shared scores are written during a round. Rule tests check direction, pressure and reach. The dedicated playtest drives actual desktop, touch, controller and remote inputs, tests misses and hits, short puffs, results, replay and exit, and captures day/night screenshots.
