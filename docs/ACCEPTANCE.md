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
| 1 | A go-kart track to race CPU players and set personal best lap times | The **Kart track** inner area, now the **Toybox Grand Prix**: four circuits, seven toy drivers, a cup, single races, time trials against ghosts and server-checked lap boards. Rebuilt after the page was edited (below) | `scripts/karttest.ts` (desktop, `PHONE=1`, `PAD=1`, `REMOTE=1`), `tests/kart-circuits.test.ts`, `tests/kart-rules.test.ts`, `tests/kart-server.test.ts`, `tests/track.test.ts` |
| 2 | A casino with a giant slot machine you walk up to and spin; credits earned and spent tracked over time | The **Casino** inner area, with a giant slot machine with a lever, server-decided spins, totals and a balance-over-time chart per player, and a top balances board | same |

Page 1 was edited: "make it an actually fun race", check for z-fighting and overlapping track pieces, and put characters in the computer karts. Built automatically on 2026-10-05:
- **The course:** the drawing's tightest corner had a 4.9 m radius, less than the 5.4 m from the centre line to the outside of the curb, so the inner curb folded over itself. It is replaced by the designed **Toybox Grand Prix** circuit (`src/shared/circuits.ts`, about 560 m): a long main straight, a tight first corner, a fast kink, esses, a hairpin and a long sweeper. Drawings can still be used; they are smoothed until no corner is tighter than 7.4 m.
- **No z-fighting:** the road sits at ground level with the grass below it, the curbs are raised strips, and paint (start line, grid, boost pads, lamp light) is pulled forward in depth. `tests/track.test.ts` checks the corner radius, curb folds and the gap between separate parts of the road, and `trackProblem` now rejects courses with corners too tight for the curbs.
- **A real race:** drifting with mini-turbos, boost pads, slipstreams, rocket starts, start lights, corner grip, a six-kart grid, a minimap, a final lap call and a results list.
- **Characters:** Bolt the robot, Hopper the frog guy, Mittens the cat, Puddles the duck and Rex the dino, each with their own driving style. They steer, look into corners, blink, and cheer or sulk at the finish.

Rebuilt as the **Toybox Grand Prix** (2026-10-07): tiny karts, giant rooms.
- **Four circuits:** Block Town (the original Grand Prix line, so the old lap board carries over) in a playroom with a TOYBOX arch, rocking horse, crayon fence, spinning top, toy train and a domino run that topples ahead of the leader; Picnic Park with the Watermelon Jump, a juice-box straw over the hairpin, a giant gnome and ants on Anthill Rise; Sandcastle Cove with bouncing beach balls on the boardwalk, a plank bridge over the channel to the sea and a tunnel through a sandcastle; Starlight Bedroom at night with the Book Stack Leap, a run under the bed and a sleeping cat whose tail sweeps the chicane.
- **Racing:** an eight-kart grid, Windup, Battery and Rocket classes, the Toybox Cup (four races, points, standings, podium and trophies), single races, free drive, six items, drifts with a hop and two mini-turbo stages, tricks off jumps, boost pads, slipstreams, rocket starts and the Grabber.
- **Every input path:** auto gas on touch and TV, a TV remote layout (OK drifts and cashes in, Up uses the item), easy drift and steer assist, and Back on a controller asks before leaving a race.
- **No z-fighting:** every horizontal surface sits on a layer of its own; `tests/kart-circuits.test.ts` checks corner radii, curb folds, the ground between separate parts of the road, ramps and tunnels on straights and gentle slopes; the playtest runs an audit of overlapping coplanar faces on all four circuits and fails on any.
- **Boards:** time trial laps only, checked by the server from the lap's recorded path (`server/kart.ts`); medals, trophies and unlocks stay on the device.
- **Onboarding:** an intro card once, a warm-up lap behind Bolt with tip boards in each device's own controls, and short tips only until you have done the thing.
- **Characters:** Bolt the robot and Hopper the frog guy lead a cast of seven with voices, cheers, sulks, waves and dizzy stars. Rex the dino is now Stomp.

Page 2 was edited to ask for other casino games as well. Built automatically on 2026-10-05: a **roulette wheel** and a **blackjack table** with a robot dealer in the Casino, sharing its credits. The server decides every spin and every card. Evidence: `scripts/experiencetest.ts` (desktop and `PHONE=1`), `tests/casino-games.test.ts`.

The Casino was then rebuilt as its own world, **The Golden Paddle**, a riverboat casino (`src/experiences/casino/`): Old Lucky (a giant slot with a paddle wheel bonus and MINI, MAJOR and a growing GRAND), The Spinning Lily roulette, Rivet's Twenty-One blackjack, the River Wheel on the Stern Deck, Lucky Falls and Five Card Cabin video poker in the Moonlight Lounge, and the Captain's Table in the Wheelhouse. Brass automaton staff, a ragtime band, 35 logbook stamps and earned ranks that open the upper rooms, Penny's free top ups and the Captain's Logbook with charts and boards. Balances carried over; old stats and open blackjack hands are migrated. Play credits only, never real money. Evidence: `scripts/casinotest.ts` (desktop, `PHONE=1`, `PAD=1`, `REMOTE=1`), `scripts/experiencetest.ts`, `tests/casino-*.test.ts` (rules, server, blackjack, poker, layout, and a geometry test for coplanar faces).

Room 12 (estevan) asked for a "black hole galaxy" (page 1, with a drawing of a ringed planet, a swirl and streaking comets). Built automatically on 2026-10-05, then rebuilt as its own game on 2026-10-07:

| Page | Idea | Built | Evidence |
| --- | --- | --- | --- |
| 1 | A black hole galaxy (drawing: deep space, diagonal streaks of coloured stars, a blue planet with a green ring, a yellow, purple and green swirl) | **Black hole bloom** (`src/experiences/galaxy/`): a crystal hub under a black hole that grows with every star you feed it. The drawing's planet is **Ringworld** (a two-lap ring run on its ring), plus **Cinder** (rock rain) and the **Comet dock** (a comet ride through the streaks and the planet's ring). The wake tutorial and a 60-second feeding frenzy on the hub, star slings, bounce blossoms, comet lanes, a star net, eight lost moons, constellations that light up, and at 12 stars the Horizon stair and the finale, where the black hole blooms into a spiral galaxy. Shader sky and disk, lensing and bloom by graphics tier; songs for each place; boards for the frenzy (the old board, kept), ring run (server-checked splits), rock rain and comet surf | `scripts/galaxytest.ts` (desktop, `PHONE=1`, `PAD=1`, `REMOTE=1`), `tests/galaxy.test.ts` |

## Needs a person

- Music on a real phone: on the Pixel 8 Pro the music stuttered while jumping and tooting in Little Puffington (2026-10-07). Chrome holds back page timers for about 100 ms after each touch starts, and the sequencer ran on one. It now runs on a worker clock with a 250 ms lead, and `scripts/audiotest.ts` taps every world at 4x CPU slowdown and fails on any late or skipped note. Confirm by ear on the phone in every world.
- Sound on an iPhone: Jessica heard nothing in Little Puffington (2026-10-07). Audio was unlocked only on the first pointerdown, which iOS does not count as a gesture, and was never brought back after a call or a trip to another app; iOS silent mode also muted it. Audio now starts and comes back on any tap, and plays through silent mode. Desktop WebKit does not enforce the iOS rules, so confirm on a real iPhone: with silent mode on, after switching to Messages and back, and after a call.
- All five worlds (Toybox Grand Prix, The Golden Paddle, Little Puffington, Club Nova, Black hole bloom): play each at the low tier on the Samsung TV with the remote, and listen to the music and effects at real volume. The songs are generated in code and the headless playtests cannot hear them. Club Nova's dance charts and sound check need real ears and thumbs most.
- Black hole bloom (room 12): play it on the Samsung TV and a mid phone at the low tier and check the frame rate; listen to the songs and effects at real volume (headless playtests cannot hear); judge the ring run's three-star time (54 s) and the comet's stardust thresholds with real hands.
- Load https://toyboxes.games on the Samsung S90H browser: check that focus is visible, the remote's arrows, OK and Back work, the on-screen keyboard and PIN pad work from the couch, and whether the TV browser exposes a paired controller.
- Play on a real phone: stick feel, drag-to-look, the system keyboard over the sketchbook, and frame rate.
- Judge vehicle handling, camera comfort and night readability; the numbers are in `src/world/vehicles.ts`, `src/game/camera.ts` and `src/world/sky.ts`.
- Race the computer drivers and tune their pace (`skill` and `nerve` in `src/experiences/kart/drivers.ts`, class numbers in `src/shared/kart/rules.ts`) and the time trial medal times (`src/shared/kart/circuits.ts`); try the casino's pace of wins over a longer session.
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

Built from page 1 (revision 1; "Neon space themed. Laser tag. Light sabers. Disco glow party dance competition", drawn as a purple starburst) as Club Nova (`src/experiences/neon/`): the starburst is the hanging Nova Core, the 16-ray dance floor and the sky. Laser tag against robot teams with lock-on, beat shots, mirror bank shots and blade deflects; prism blade duels against five duelists; a dance off with 13 charts over four original songs; five party nights with a podium; a sound check; a wardrobe of cosmetics earned with stars; 11 shared boards scored on the server from run logs (`src/shared/neon/rules.ts`). Rule tests: `tests/neon-charts.test.ts`, `neon-judge.test.ts`, `neon-tag.test.ts`, `neon-scores.test.ts`, `neon-progress.test.ts`. `scripts/neontest.ts` drives desktop, `PHONE=1`, `PAD=1` and `REMOTE=1` (arrows, OK and Back only) through arrival, the sound check, a full party night (tag lock, bank shot, deflect, tag-out; duel knockout; dance with holds, spotlight, pause and Glow time), a crush and a feint, a confirmed board result, the wardrobe, song select, a press-nothing dance, draw call budgets per tier and the exit. Needs a real TV and phone for audio latency, remote hold behaviour and frame rate.

### Room 2: Fart simulator

Built from page 1 (revision 1), rebuilt as Little Puffington: a storybook fete village with twelve villagers, a band, pigeons and ducks; the toot moves (hop, scoot, boost, big one, hover) on three gases with a synthesised toot in six unlockable voices; fifteen mischief jobs and four trials (Rocket Rings, Brass Band Bash, Shh! The Library, Picnic Panic) for 27 golden beans saved on this device; the Toot-o-Matic and a medal ceremony; and five shared boards checked on the server (`src/shared/fart/boards.ts`, run tickets, band scores from the run log). `tests/fart-*.test.ts` cover the moves, clouds, props, townsfolk, mischief, layout (no coplanar faces, clear arrival camera), every trial's rules, the save and the boards. `scripts/farttest.ts` drives the real input on desktop, `PHONE=1`, `PAD=1` and `REMOTE=1` through the first visit, eating, toots, mischief, all four trials, the Toot-o-Matic, tap mode, night and every graphics tier's budget, and the exit.
