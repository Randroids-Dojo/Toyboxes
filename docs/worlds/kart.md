# Toybox Grand Prix: design for room 1's "Kart track"

> The design written before the build. The review decisions at the end override it where they differ. What shipped is recorded in `docs/ACCEPTANCE.md`. Paths under `/tmp/toyboxes-worlds/` were scratch files and no longer exist.

World kind `kart`, owner Randroid (room 1). Phase 1 design only; nothing in the repo was changed. Working files are in `/tmp/toyboxes-worlds/kart/` (listed at the end).

## 0. Starting point

### The visitor's asks, and the answer

| Ask (page 1 and its edit) | Answer in this design |
| --- | --- |
| Race other CPU players | Seven character drivers on an 8-kart grid, four hand-designed circuits, a four-race cup with points and trophies, single races, three speed classes. |
| Set personal best lap times | Time trial with your best-lap ghost, per-circuit personal bests and medals on this device, and a shared board per circuit whose laps the server re-checks from the recorded path. |
| "My drawing sucks, make it an actually fun race" | Designed circuits with rhythm (long straights for slipstreams, a bunching first corner, drift sweepers, a hairpin per circuit), signature set pieces, items that keep the pack mixed, rivals, and a cup with stakes. The drawing gets a nod (framed in the paddock, optional bonus circuit). |
| "Quality checks so there's no glitchy z-fighting or overlapping track pieces" | A layer table every surface obeys, no road ever crosses another, geometry rules in unit tests, and an in-browser z-fight audit that the playtest runs on every circuit and tier (section 7.7). |
| "Actual characters in the computer karts (a robot, frog guy)" | Kept and expanded: Bolt the robot and Hopper the frog guy lead a cast of seven, each with a body type, driving and item style, a voice, a podium pose and a rival role. |

### What I looked at in the current build

I ran the current game on a local dev server (port 5211, memory store) and drove it with `/tmp/toyboxes-worlds/kart/look.mts`. Screenshots are in `/tmp/toyboxes-worlds/kart/shots/` (day and night: arrival, overhead, low angles, drivers, race dialog, countdown, racing, results).

- It works: the circuit is clean, curbs never fold, the drivers are charming, drifting and mini-turbos feel good, and the race runs from grid to results.
- It does not yet feel like a world: a flat lawn, scattered trees, a small grandstand, one circuit, a dialog for results, and a lap board too small to read from the paddock (`day-01-arrival.png`, `day-03-oblique.png`).
- Measured from the arrival view: **369 draw calls on the low tier, 455 on high, 681 meshes** (`info.mts`). That is too heavy for the Samsung TV.
- Bugs and gaps found:
  1. The first-ride drift tip toast overlaps the race panel during the countdown (`day-07-countdown.png`).
  2. Controller B while riding always gets you off (`game.ts`: `input.take('back')` then `dismount()`), so one stray press abandons a race.
  3. A TV remote cannot drift (drift needs Kick or Jump held) and, since remotes send one key at a time, cannot hold gas and steer together.
  4. On touch, steering sideways gives no throttle (the stick's y is the throttle), so the kart coasts through every corner.
  5. The follow camera's riding height is a constant 1.35 m (`game.ts` `follow()`), so any elevation needs a one-line engine change.

### What I keep

- `src/shared/track.ts` (`TrackPath`, `trackProblem`, `edgeFolds`, `minRadius`, `trackId`) and `src/shared/circuits.ts` (`buildCircuit`). Every new circuit is built and validated with them.
- **The Grand Prix centre line exactly**, as circuit 1 (Block Town), so room 1's existing lap board and personal bests carry over.
- The kart handling in `src/world/vehicles.ts`: grip limit in corners, drift with two mini-turbo stages, boosts, rocket starts, glancing wall hits. It is tuned and extended, not replaced.
- The driver rig in `kart-drivers.ts` (hands on the wheel, look into corners, blink, cheer, sulk) and all five characters.
- The computer drivers' racing line, braking plan, passing, boost-pad aiming and the `debugSimulate` fast-forward check, extended to every circuit and class.
- The `ribbon()` and `decal()` construction and the rule that no two surfaces share a plane.
- Lap rules: a jump of more than 25 m along the lap voids it, wrong-way warning, lap flash with the gap to your best, "New best lap!", the minimap, slipstreams, boost pads.
- `recordLap` server validation (extended, not loosened) and the kart checks in `scripts/experiencetest.ts` (moved into a dedicated `karttest.ts`).

---

## 1. Vision

### Pitch

**Toybox Grand Prix. Tiny karts, giant rooms.** You are toy sized. The cup runs across four playsets someone built on the floor and in the garden: a playroom of alphabet blocks, a picnic on the lawn, a sandcastle beach, and a bedroom at night. Race a robot, a frog guy and five other toy drivers for the Toybox Cup, chase your best lap against your own ghost, and get your name on the board of every circuit.

### The fantasy

The thrill of a living-room race made real: the rug is a racetrack, a watermelon slice is a launch ramp, the bed is a tunnel, the cat is a hazard. Every circuit is instantly readable to a child ("we're racing under the bed!") and every landmark is a toy or household object scaled up twenty times.

### Title and names

- World: **Toybox Grand Prix** (already on the current grandstand).
- Cups: **Toybox Cup** (the four circuits), later the **Rewind Cup** (the same circuits run backwards).
- Speed classes: **Windup** (gentle), **Battery** (standard, today's handling), **Rocket** (fast).
- Circuits: **Block Town**, **Picnic Park**, **Sandcastle Cove**, **Starlight Bedroom**.
- Respawn helper: **the Grabber**, a toy claw that lifts you back onto the road.

### Art direction

Rules for every circuit:

- **Scale is the joke.** Landmarks are everyday toys at about 20x: a 16 m garden gnome, an 18 m sandcastle, a bed whose underside is a 6.5 m tunnel roof. One huge silhouette is visible from every part of each circuit.
- **Soft plastic, painted wood, fabric.** `MeshStandardMaterial` through the existing `plastic()` helper: roughness 0.45 to 0.8, no metalness except chrome trims. Canvas textures for prints (wallpaper, gingham, alphabet letters, board-game box art). Rounded boxes everywhere; nothing sharp.
- **Readable road.** The road is always the darkest, least saturated surface; curbs are bold stripes; everything you can hit is a saturated toy colour; everything you cannot hit sits behind the curb and run-off.
- **Silhouettes.** Karts are low and wide; drivers have big heads (about 40 percent of their height) and big eyes so they read at 30 m. Each kart body has its own outline (wedge, classic, bumper tub).
- Shared UI palette (already in the site): ink `#1d1830`, cream `#fffaf0`, sun `#ffd24a`, tomato `#e8574a`, sky `#4aa3df`, mint `#3fb68b`, grape `#8a6bd1`, bubblegum `#ef6fa0`, amber `#f4b740`.

| Circuit | Palette | Lighting | Mood |
| --- | --- | --- | --- |
| Block Town (playroom) | Floorboards `#d9a066` / `#b97a46`, wallpaper cream `#fff3d6` with cloud print `#bfe3ff`, blocks `#e8574a` `#4aa3df` `#ffd24a` `#3fb68b`, road `#4b4e5e` with white dashes | Warm key light through a giant window (`#fff1d6`), cool fill; at night by the shared clock the ceiling lamp comes on and the window shows the moon | Sunny Saturday morning |
| Picnic Park (garden) | Lawn `#7fc25a` / `#5aa84a`, gingham `#e8574a` on `#fffaf0`, watermelon `#3fb68b` / `#ff6b7a`, lemonade `#ffe46b`, earth road `#7a5a44` | The town sky (`Sky`), follows the clock; paper lanterns and fireflies at night | Lazy summer afternoon |
| Sandcastle Cove (beach) | Sand `#f2d49b` / `#e3b877`, sea `#3fc1d9` to `#1f7fb8`, boardwalk `#b98a5e`, umbrella stripes `#ff7b6b` / `#fffaf0`, wet-sand road `#b89a6a` | The town sky; a lighthouse beam sweeps at night; foam glows faintly | Holiday, bright and breezy |
| Starlight Bedroom (always night) | Navy `#1b1f4a`, indigo `#2b2560`, moon glow `#ffe9a8`, glow cyan `#7ef0ff`, glow pink `#ff8fd1`, glow green `#b6ff8a`, rug `#6a4fb0`, road `#2a2550` with cyan edge lines | Fixed night: deep blue hemisphere, the moon nightlight as key light, emissive glow-in-the-dark curbs and stars; bloom on medium and high | Cosy, magical, a little thrilling |

Reference games: Re-Volt and Micro Machines (tiny vehicles in giant rooms), Mario Kart 8 and Mario Kart DS (drift, items, cups, ghosts), Crash Team Racing (boost-drift skill), Diddy Kong Racing (characterful cast), Sackboy (craft materials).

### Audio direction

All synthesised in WebAudio (the kit's sequencer and `sfx.ts`). Music sits about 14 dB under effects and ducks 4 dB for half a second on big moments.

| Cue | Style, tempo, key | Instruments |
| --- | --- | --- |
| Paddock and menus: "Pit Stop Shuffle" | Swing shuffle, 100 BPM, F major | Toy piano, plucked bass, brushed snare, whistled hook |
| Block Town: "Building Blocks" | Bouncy pop, 150 BPM, C major | Glockenspiel lead, square bass, claps on 2 and 4 |
| Picnic Park: "Lemonade Lane" | Sunny island skip, 140 BPM, G major | Plucked ukulele-like strings, sine whistle with vibrato, shaker |
| Sandcastle Cove: "Tide Line" | Surf rock, 132 BPM, E minor to G | Twangy saw lead with echo, steel-drum FM plucks, tom fills |
| Starlight Bedroom: "Nightlight Run" | Synthwave lullaby, 160 BPM, A minor | Music-box arpeggios, warm pad, pulsing bass, gated snare |
| Final lap | Same song, tempo up 6 percent, up a semitone, counter-melody enters | Plus bell hit on the change |
| Results | Win: 3-second brass-like fanfare; other places: a sweet "nice try" turnaround | Same palette as the circuit |
| Podium | Fanfare with timpani rolls and a cymbal swell | |

Signature effects: drift spark chimes (rising per stage, exists), mini-turbo whoosh (exists), capsule "pop and twist", item roulette ticks, ball "boing" pitched by speed, marble clatter, bubble "bloop" and pop, paper-plane whistle, spin-out "wobble-wah", spring launch "boing", landing thud, trick sparkle chime, the Grabber's "dee-doo" claw jingle, crowd swell when you pass a grandstand, countdown beeps (exist), final-lap bell, finish whistle, confetti pops, split-flap clatter on the timing tower. The player's engine keeps `Engine` (pitch by speed); the other karts share one quiet pack drone whose loudness follows the nearest kart.

Character voices are tiny babbles, never words: Bolt square-wave beeps, Hopper FM "ribbit", Mittens rising "mew", Puddles nasal "quack", Stomp a small filtered roar, Ink bubbly bloops, Barnaby a warm low "hoo-hoo". They play on passes, hits, finishes and the podium, at most one voice every 2 seconds.

---

## 2. Core loop and feel

### Moment to moment

1. **Line:** pick the inside of the next corner, avoid the grass (half top speed).
2. **Drift:** hold the drift button through the corner; sparks go white, blue, then orange; let go on the exit for a mini-turbo.
3. **Boost:** chain mini-turbos, boost pads, slipstreams and trick landings.
4. **Item:** drive through a capsule, hold the item for the right moment, use it.
5. **Pass:** the position number flips, your rival's chip drops behind yours on the order strip.

The race loop is about 2 minutes; the cup loop is about 11 minutes with flyovers and the podium. Every result feeds a trophy, a medal, a board rank or an unlock.

### Handling

Classes scale the kart's top speed and acceleration; the corner grip limit (11 m/s squared, 19 while drifting) stays the same, so faster classes reward drifting more.

| Class | Top speed | Accel | Computer drivers | Catch-up rules (honest, shown in the help panel) |
| --- | --- | --- | --- | --- |
| Windup | 12 m/s | 8 | skill x0.92, nerve x0.94, items used 1.5 s late and half as often | Drivers more than 35 m ahead ease to 90 percent |
| Battery | 14 m/s (today) | 9 | as today | More than 70 m ahead: 90 percent (as today) |
| Rocket | 16 m/s | 10.5 | nerve x1.03, items used after 0.4 s | None |

| Kart body | Top | Accel | Turn | Weight | Drift charge | Spin-outs | Outline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Zippy | -3% | +18% | +8% | 0.8 | 15% faster | normal | Low wedge, tall tail fin |
| Classic | 0 | 0 | 0 | 1.0 | normal | normal | Today's kart |
| Chunky | +3% | -14% | -6% | 1.3 | 8% slower | 25% shorter | Round bumper tub |

- **Drift:** as today (hold while turning above 8 m/s; stages at 0.6 s and 1.4 s give 0.5 s and 1.0 s boosts), plus a 0.25 m hop when it starts.
- **Boosts:** boost pads (designed positions per circuit), slipstream (as today), rocket start (gas from the last red light), trick landing (0.6 s).
- **Off-road:** grass, sand, rug or lawn halve top speed; water and gaps call the Grabber.
- **Jumps and tricks:** karts get a simulated height (section 6.2). In the air: toy gravity 14 m/s squared, 30 percent steering, no drifting. Press drift (remote: OK) in the air to trick: a flip or barrel roll, then a 0.6 s boost on landing.
- **Hits:** a spin-out drops speed to 40 percent and takes control away for 0.9 s; marbles drop speed to 65 percent with a 0.6 s wobble. After any hit you are immune for 1.5 s, so hits never chain. Typical cost: 1.1 to 1.4 s.
- **The Grabber:** off the road for 3 s, stuck for 1.5 s, in a gap, or on request ("Back on track"): a toy claw lowers, lifts and sets you on the road centre 2 m behind where you left it. 1.4 s, never voids a lap.

### Items

Drive through a capsule (a two-tone toy capsule with a "?" inside; rows of four across the road, back 1.5 s after pickup). The HUD slot spins for 1 s and lands on an item. One item at a time.

| Item | What it does | Counterplay |
| --- | --- | --- |
| Zoom Spring | 1.0 s boost | none needed |
| Triple Spring | Three springs, one per press | none needed |
| Bouncy Ball | Thrown forward at 24 m/s along your lane, bounces off rails, lasts 3.5 s; a hit spins the kart out | Steer out of its lane; Bubble |
| Marble Bag | Drops 5 marbles in a 2 m patch behind you for 15 s; they scatter when hit | See them, steer round; Bubble |
| Soap Bubble | Shield for 8 s that absorbs one hit and pops | Wait it out |
| Paper Plane | Flies along the road to the kart one place ahead and lands on it (spin-out); the target hears a whistle and sees an edge arrow 1.5 s before | Bubble, or a tight corner where the plane clips the rail |

Odds by position (8 karts; each row sums to 100):

| Place | Spring | Triple | Ball | Marbles | Bubble | Plane |
| --- | --- | --- | --- | --- | --- | --- |
| 1st | 0 | 0 | 20 | 45 | 35 | 0 |
| 2nd to 3rd | 20 | 0 | 35 | 25 | 20 | 0 |
| 4th to 5th | 30 | 0 | 25 | 10 | 15 | 20 |
| 6th to 8th | 30 | 25 | 20 | 0 | 0 | 25 |

Fairness rules: the computer drivers draw from the same table with the same seeded random numbers; nothing targets first place from far behind; nothing stops a kart; items can be switched off for single races; time trial and free drive never have items.

### The computer drivers

| Driver | Who | Kart body and paint | Driving style | Item style | Voice |
| --- | --- | --- | --- | --- | --- |
| Bolt | Robot (requested), antenna, glowing visor | Chunky, steel `#7d8aa3` | Precise, takes the racing line | Holds items for the perfect moment | Beeps |
| Hopper | Frog guy (requested), red headband | Zippy, mint `#3fb68b` | Daring, dives for gaps and boost pads | Throws at once | Ribbit |
| Mittens | Cat in racing goggles | Zippy, pink `#ef6fa0` | Smooth, late braker | Loves marbles | Mew |
| Puddles | Duck in a sailor cap | Classic, amber `#f4b740` | Steady, a little cautious | Defensive, bubbles early | Quack |
| Stomp | Dino (renamed from Rex, see risks) | Chunky, grape `#8a6bd1` | Bumps people | Throws balls at the kart ahead | Little roar |
| Ink (new) | Octopus: two tentacles on the wheel, two waving | Classic, ocean `#5b6ee1` | Unpredictable lines | Juggles: keeps one item in reserve | Bloops |
| Barnaby (new) | Teddy bear, the reigning champion: red sash, gold goggles | Classic, gold `#f5c542` | The best driver; fair and fast | Uses springs on straights | Warm "hoo-hoo" |

AI keeps today's planner and adds: drifting in corners whose planned speed is under 80 percent of top (real mini-turbos), hazard timing (beach balls, the cat's tail), item rules (spring on a straight, ball when a kart is ahead within 25 m and in lane, marbles when a kart is within 12 m behind, bubble when a projectile targets it, plane at once), and per-class reaction delays. All AI randomness uses a seeded generator, so a seed replays the same race (tests depend on this).

**Rival:** each cup picks the driver who finished nearest you in your last cup (Barnaby on Rocket). The rival's chip has a flame outline, they get a short intro in the grid pan, and beating them in a race plays their sulk.

### Controls for every input path

The engine already routes kick or jump held to "brake" while riding, Interact to `rideAction`, and the TV's Back to the pause menu. On a TV (`IS_TV`) the world switches to the **remote layout**: move plus OK is the whole game.

| Action | Keyboard and mouse | Touch | Controller | TV remote (arrows, OK, Back) |
| --- | --- | --- | --- | --- |
| Gas | W or Up (or Auto gas) | Automatic (Auto gas is on for touch); stick up during the countdown | RT or stick up | Automatic; Up during the countdown |
| Steer | A/D or Left/Right | Stick | Left stick or d-pad | Left, Right |
| Brake, reverse | S or Down | Stick down | LT or stick down | Down |
| Drift | Hold Space or F while turning | Hold the Brake button while turning | Hold X or Y while turning | OK while turning starts it in that direction; Left/Right tighten or widen; OK again cashes the mini-turbo (or Easy drift) |
| Use item | E or Enter | Action button (shows the item's name) | A | Up |
| Trick in the air | Space | Brake | X | OK |
| Rocket start | Gas from the last red light | Stick up from the last red light | RT from the last red light | Up from the last red light |
| Back on track (offered when lost) | E | Action | A | OK |
| Race menu | E when stopped in the pit box or stopped anywhere in free drive | Action | A | OK when stopped |
| Look | Mouse drag | Drag the right half | Right stick | Auto camera |
| Pause | Esc | Menu button | Start | Back |
| Leave a race | Pause menu | Pause menu | B asks "Leave the race?" | Pause menu |
| Get in or out | E in the paddock | Action | A in, B out | OK |

Menus (race menu, results, standings, garage, trophies) are `UI.open` panels: arrows, d-pad or stick move focus; OK, A, Enter or tap confirm; Back, B or Esc go back. The left and right arrows flip circuit and colour carousels.

Assists (race menu, saved on this device; default on where marked): **Auto gas** (touch, remote), **Easy drift** (hold a full turn above 9 m/s for 0.3 s to slide; straighten up to cash in), **Steer assist** (within 1 m of the road edge, up to 30 percent of the steering pulls you back), **Remote layout** (on for TV). Assisted laps count for the boards; assists never make a kart faster.

---

## 3. Content and progression

### Modes

- **Grand Prix:** Toybox Cup, four races, pick a class. Points 10, 8, 6, 5, 4, 3, 2, 1. Top three overall win gold, silver or bronze. Ties go to the better last-race finish.
- **Single race:** any circuit, class, items on or off.
- **Time trial:** one kart, no items, 3 laps, ghost of your best (or a board ghost, or Barnaby's champion ghost). The only source of shared-board laps.
- **Free drive:** the world as it is now: the drivers cruise round, you lap freely, laps are timed for personal bests.

### Circuits

All four are built with `buildCircuit` and pass `trackProblem`; estimates are the computer drivers' speed plan at Battery class (`circuits.mts`). Piece lists: `/tmp/toyboxes-worlds/kart/circuit-pieces.ts`.

| # | Circuit | Length | Laps | Direction | Character | Signature | Hazard | Lap estimate (Windup / Battery / Rocket) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Block Town | 557 m | 3 | Mostly right-handers | Wide and flat, learn to drift | TOYBOX block arch, domino run, toy train | None | 46 / 40 / 37 s |
| 2 | Picnic Park | 489 m | 3 | Right-handers | Fast and flowing | Watermelon Jump, Anthill Rise crest, the gnome | None (the jump is the test) | 41 / 35 / 32 s |
| 3 | Sandcastle Cove | 406 m | 4 | Right-handers | Technical claw complex | Plank Bridge, Castle Gate tunnel | Bouncing beach balls | 34 / 29 / 27 s |
| 4 | Starlight Bedroom | 402 m | 4 | The only left-hander | Tight, night, the finale | Book Stack Leap, Under the Bed, the rocket | The sleeping cat's tail | 34 / 29 / 27 s |

Every circuit: minimum corner radius 12.9 m or more, no curb folds, at least 24.9 m between the centre lines of separate parts of the road (14 m or more of ground between their curbs), an 8-kart grid on the start straight (two columns, slots staggered 4.5 m, the last one 40 m behind the line), and 33 m or more from the line to the first corner.

### Difficulty curve

- Within the cup: flat and wide first, then a jump, then hazards, then the night finale.
- Across classes: Windup is winnable on a first try by a child using Auto gas; Battery is today's challenge; Rocket needs drifting and is where Barnaby races at his best.
- Rocket class unlocks with any Battery trophy.

### Time trial medals (Battery, placeholders until tuned with real laps)

| Circuit | Bronze | Silver | Gold | Champion (Barnaby's ghost) |
| --- | --- | --- | --- | --- |
| Block Town | 48.0 | 44.0 | 41.5 | 40.0 |
| Picnic Park | 42.0 | 38.5 | 36.4 | 35.0 |
| Sandcastle Cove | 35.0 | 32.0 | 30.3 | 29.2 |
| Starlight Bedroom | 34.8 | 31.8 | 30.1 | 29.0 |

### Unlocks (all earned, nothing bought)

- Kart bodies: Classic from the start, Zippy for finishing any cup, Chunky for a Battery gold.
- 12 paints and 4 patterns (stripes, stars, dots, checks): trophies and medals.
- 7 horns, one per driver: beat that driver in a race.
- 6 boost-flame colours: time-trial golds; the rainbow flame for all four champion medals.
- Rewind Cup and its trophies (nice-to-have content): Battery gold in the Toybox Cup.

### Personal bests on this device

`localStorage` key `toyboxes.kart2.<roomId>.<areaId>`: trophies by cup and class, medals and best lap and best 3-lap time by circuit, unlocks, kart setup, assists, stats (races, wins, podiums, drifts, items landed, km). Ghosts live in their own keys (about 4 KB each). Block Town also reads today's `toyboxes.pb.<room>.<area>.<trackId>` so existing bests survive.

### Shared boards (server validated)

One board per circuit per area: best Battery time-trial lap, lower is better, top 10 shown with kart body and a ghost icon. The timing tower in the paddock flips through them (split-flap animation); the race menu shows the board for the chosen circuit with "Race this ghost". Block Town keeps the existing `lap:<roomId>:<areaId>` key, so today's board carries over. Section 7.8 has the validation.

### The first five minutes

| Time | What happens |
| --- | --- |
| 0:00 | Fade in at the paddock, facing the track. The intro card: "Toybox Grand Prix. Tiny karts, giant rooms." plus four device glyphs (gas, steer, drift, item). Karts stream through the TOYBOX arch in front of you. |
| 0:10 | Your kart sits 9 m ahead in its pit box with a glowing ring: "Get in your kart". |
| 0:15 | Get in. First visit only: "Warm-up lap with Bolt?" (Yes is focused, Skip is next to it). Bolt rolls up and honks. |
| 0:20 to 1:05 | Warm-up lap behind Bolt (he waits if you fall back): a boost pad on the main straight, a drift through the first corner, a capsule row, "use it" on a stack of blocks to knock over, a blue mini-turbo in the hairpin. |
| 1:05 | Over the line: "You're ready!" Then "Toybox Cup, Windup class" (Start the cup / Free drive). |
| 1:10 | 7-second flyover of Block Town with its board leader; grid pan with names; countdown; the line under the HUD says "Gas on the last light for a rocket start". |
| 1:25 to 3:35 | Race 1. Final lap: bell, music lifts, dominoes topple ahead of the leader. |
| 3:35 | Finish banner, finish orbit, results card with points, and the podium if you made the top three. |
| 4:05 | Standings slide into place; "Next: Picnic Park"; a flyover of the Watermelon Jump. By 5:00 you are taking your first jump. |

### The 30th visit

You arrive to a trophy cabinet with three golds and a gap where the Rocket gold should be; the timing tower shows you third on Picnic Park, 0.4 s behind the leader. You run Time trial against the leader's downloaded ghost, take second, then enter the Toybox Cup on Rocket with Barnaby as your rival for the last gold. Along the way you unlock Stomp's roar horn and are two champion medals from the rainbow flame.

---

## 4. Onboarding (learning in the world)

- **One card, once:** the intro card on the first visit, with the device's own glyphs. Nothing else is a wall of text.
- **The kart tells you what to do:** a glowing ring and the prompt "Get in your kart"; in the pit box the prompt says "Race menu".
- **The warm-up lap** (first visit, skippable, replayable from the menu): Bolt leads; tip boards stand beside the road at the exact spot each skill is needed. They are canvas signs that redraw with the current device's glyph ("Hold [Space] to drift", "Hold [X] to drift", "OK to drift" on a TV). Bolt's speech bubbles are five words at most.
- **The sparks teach the drift:** white, blue, orange, each with its own chime.
- **Contextual tips, only until learned:** if you have not drifted by lap 2, one toast; if you are holding an item for 20 s, one toast ("Use your item with [E]"). Flags for drifted, mini-turbo, item, trick and rocket start stop the tips for good.
- **Countdown line:** "Gas on the last light for a rocket start" until you have done one.
- **Help:** the race menu's "How to race" page shows the control table for the current device and the honest catch-up rules.

---

## 5. Juice list

"Shake" uses the kit camera shake and is off with Reduce motion; FOV kicks are halved with Reduce motion.

| Event | VFX | SFX | Camera | HUD |
| --- | --- | --- | --- | --- |
| Arrive | Fade in; karts pass through the arch | Crowd ambience, paddock music | Behind you, facing the track | Intro card (first visit) |
| Near your kart | Ring pulses | Soft tick | | Prompt "Get in your kart" |
| Get in | Seat bounce, headlights on at night | Engine "putt-putt-vroom" | Eases behind the kart | Prompt "Race menu" |
| Load a circuit | Curtain with the circuit's card art | Music sting | | Card: name, laps, board leader |
| Flyover | Set pieces animate | Circuit intro bars | Spline flyover, 7 s (3 s on repeats), skippable | Title card, "Skip" glyph |
| Grid pan | Drivers wave and honk | Horns, voices | Slow dolly along the grid | Names; rival intro |
| Countdown | Gantry lights red, red, red, green | Beeps (exist) | Low behind your kart | 3, 2, 1, GO; rocket-start line |
| Rocket start | Flame burst, tyre smoke | Whoosh | FOV +6 for 0.5 s | "Rocket start!" |
| Too early | Wheelspin smoke | Sputter | | "Too early" (small) |
| Speed | Speed lines at boost (high tier) | Engine pitch | FOV 55 to 61 with speed | |
| Drift start | 0.25 m hop, smoke puffs | Tyre squeal | | |
| Drift stage 1 and 2 | Sparks white, blue, orange | Rising chime per stage | | |
| Mini-turbo | Flame, flash | Whoosh | FOV +4 or +8, push 0.3 m | |
| Boost pad | Chevrons flash under you | Whoosh | FOV +6 | "Boost!" |
| Slipstream building | Wind streaks from the kart ahead | Rising wind | | |
| Slipstream boost | Flame | Whoosh | FOV +5 | "Slipstream!" |
| Capsule pickup | Capsule pops into confetti | Pop and twist | | Slot roulette (ticks), item lands with a bounce |
| Spring | Flame | Spring "boing" | FOV +6 | |
| Ball thrown, bouncing | Striped ball, short trail, rail sparks | Boing pitched by speed | | |
| Marbles dropped | Glassy marbles roll and settle | Clatter | | |
| Bubble on | Iridescent shell, shimmer | Bloop | | Slot shows timer ring |
| Plane launched | Paper plane, dotted contrail | Paper flutter | | |
| Plane incoming (target) | | Rising whistle | | Edge arrow and red rim pulse 1.5 s |
| You are hit | 360 spin, stars round the driver's head | Wobble-wah, "Hey!" | Shake 0.2 | "Bonk!" |
| Hit blocked by bubble | Pop, sparkles | Pop | | "Blocked!" |
| You hit someone | Their spin | Bell | | "Hit Hopper!" in green |
| Kart bump | Spark puff | Bump (exists) | Nudge (exists) | |
| Wall hit | Sparks | Thud by speed | Shake by speed | |
| Off-road | Grass, sand or fluff particles | Rumble | Slight jitter | |
| Jump launch | Dust kick from the lip | Spring boing | Camera rises with the kart | |
| Trick | Flip or roll, sparkle burst | Whoosh and chime | | "Trick!" |
| Landing | Dust ring, body squash | Thud | Shake 0.15 | |
| The Grabber | Splash or dust, claw lowers and lifts | Dee-doo jingle | Holds wide | "Grabbed!" |
| Hazard warning | Beach ball shadow grows where it lands; the cat's ear twitches, tail lifts | Purr crescendo | | |
| Gain or lose a place | | Rising or falling two-note | | Position flips; chips swap on the order strip |
| Being lapped | Penguin marshal waves a blue flag | | | |
| Lap done | Line flash | Lap chime (exists) | | "Lap 2/3", split vs best in green or red |
| Best lap | Gold sparkle trail 2 s | Best-lap chime | | "Best lap!" banner |
| Final lap | Bell, alarm clock rings, rocket launches (Bedroom), dominoes reset | Music lifts a semitone | | "Final lap!" |
| Wrong way | | Low buzz | | Red "Wrong way" and arrow (exists) |
| Finish | Checkered flag, confetti cannons, fireworks at night outdoors | Whistle, fanfare or "nice try" | Finish orbit | Place banner with stars |
| Results | | Count-up ticks | | Kit results card: place, time, best lap, points; Next race / Race again / Leave |
| Standings | | Slides | | Rows slide, point bars grow |
| Podium | Confetti, trophy descends, drivers cheer or sulk | Podium fanfare | Orbit 6 s | Trophy and unlock cards |
| Board rank | Timing tower flips | Split-flap clatter | | "You're 3rd on the Picnic Park board" |
| Ghost passed | Ghost poofs into sparkles | Chime | | |
| Medal | | Stamp | | Medal stamp after the lap |

---

## 6. World layout

### 6.1 Rules for every circuit

- Units are metres; x across, z down the plan; the avatar is about 1.6 m tall, karts are 1.9 m long, the road is 9 m wide with 0.9 m curbs each side.
- **The paddock is the only place you walk.** It is flat (y 0), about 70 m along the main straight by 28 m deep, on the outside of the start straight. A boom gate at the pit exit is a collider while you are on foot and lifts (collider removed in `step`) when you are in a kart, so walkers never reach the elevated road. You can only get out of the kart in the paddock.
- **The paddock holds:** the arrival point facing the track, your kart in its pit box 9 m ahead, the exit door behind you, the timing tower (an 8 m split-flap board readable from arrival), the podium of three numbered toy blocks, the trophy cabinet (your trophies as 3D cups), and a framed copy of the original sketch.
- **Sight lines:** from arrival you see your kart, the start straight with karts going by, the circuit's biggest landmark and a grandstand across the track.
- **Collisions:** rails or toy barriers on the outside of corners, tyre stacks at run-off, landmarks behind the run-off (at least 4 m beyond the curb), the paddock fence and gate, the room walls or world fence 25 m or more beyond the outermost road. Walls in tunnels do not block the camera (it stays behind the kart along the straight).
- **Run-off:** 4 m of off-road surface beyond each curb before any barrier, except where a tunnel or bridge rail is the edge.

### 6.2 Elevation: what is in and what is out

Judgement: the 2D solver stays honest if **the road never overlaps itself in plan**. Then every point near the road maps to one distance along the lap, so a height profile `h(s)` is well defined. Karts get a simulated height from it; collisions stay 2D.

In:
- **Crests and embankments:** a smooth bump in `h(s)` (Anthill Rise: 2.5 m over 50 m, slope at most 16 percent, too gentle to leave the ground even boosted). Built as road ribbon plus verge ribbons sloping down to just below the ground.
- **Raised decks:** the Plank Bridge (1.2 m) and the book tops (1.8 m and 1.2 m). Rails on both sides as colliders, so no kart leaves a raised section.
- **Jumps over gaps:** a kicker lip (18 degrees) at the end of a ramp, a gap with no road, a landing at the same or a lower height. A boost pad on every ramp guarantees the speed to clear (at least 12.5 m/s is needed; boosted karts carry 18). Falling short sends the Grabber. Kicker, gap and landing are always on a straight, with 18 m or more of straight after landing.
- **Tunnels:** walls along the road edges (colliders), a roof at 6 m or more (the riding camera sits about 3.6 m up). The existing `cutaway(camera)` hook fades a roof or overhead beam when the camera rises into it.

Out:
- **No road over road** (no figure eights, no crossover bridges). A crossover would need layered colliders, an ambiguous lap position and a camera under a deck: exactly the "overlapping track pieces" the visitor asked us to avoid.
- **No ground above y 0 near the road.** The ground only dips (channels, puddles); everything higher is built from the track.
- **No banking** (flat road cross-section keeps the ribbon and curbs simple and fold-free).

Engine changes this needs (small, section 7.3): the camera follows the kart's height, Vehicle collision passes the kart's height, and the experience decides what Back does while riding.

### 6.3 Block Town (circuit 1, the arrival circuit)

The playroom floor. A giant open toy chest stands behind the paddock as its backdrop; the exit door is a small door in the chest's front panel (you "came out of the toybox"). Room walls stand at x -112 and +112, z -124 and +96, 45 m tall, with cloud wallpaper and a skirting board; the east wall has a 40 by 25 m window (the sky and sun from the shared clock); a bookshelf lines the west wall; a ceiling lamp hangs 45 m up.

Flat floor, no hazards. Start line at (-14, -70) heading +x. Arrival (-19, -100) facing the track (yaw 0, toward +z); kart (-19, -91); exit (-19, -109); podium (-44, -90); timing tower (1, -88); boom gate at the pit exit (-40, -80) onto the run-off before the grid.

```
              ....................X...............
              ....................................
              ....................@...............
              ....................................
              ....................k...............
              ........1.....................B.....
              ....................................

         ############################|##########################################
     ##########################>####)|######)#######A#####################)########
    #################################|###############################################
  ####^######                        |                                       #########
  #######                                                                       #######
 ######                                                                          ######
 ######                                                                          ######
 ######                                                  G                       ###?##
 ######                                                                          ######
 ######                                                                          ######
 ######                                                                          ######
 ######                                                                          ######
 ######                                                                          ######
 ######                                                                          ##v###
  ######                                                                        #######
  ########                                                                      ######
   ##########                                                                 #######
     ###(###############################                                    #########
       ####################>#########(#####                               #########
          ###################################           R               #########
                         D           #########                        ##########
                                        #######                      #########
                                         #######                    #######
                                          ######                   #######
                                          ######                   ######
                                         #######                   ######
                                        #######                    ###v##
                                      ########                E     #####
                                    #########                      ######
                                  ####?####                       #######
                                ####^####           ####################
                               ########         #######################
                              #######         #######################
                              ######  T     #####v#####    #####
                              ######      ##########
                               ###################
                               ################
                                 ############
                                     ####
```

Legend for all plans: `#` road (9 m), `|` start line, `( ) ^ v` direction of travel, `.` paddock, `@` arrival, `X` exit door, `k` your kart, `B` timing tower, `1` podium, `?` capsule row, `>` boost pad. 2 m per column, 4 m per row; a labelled drawing of all four is `/tmp/toyboxes-worlds/kart/plans.png`.

| Mark | s (m) | What |
| --- | --- | --- |
| A | 30 | TOYBOX arch: six stacked letter blocks each side (2.4 m cubes, 2 mm gaps), beam underside 8 m up; colliders are the two pillars beyond the run-off |
| G | 40 | Grandstand in the infield, 24 m, faces the main straight; peg-doll crowd, bunting |
| H | 92 | Rocking Horse corner (right, R16): a 14 m rocking horse rocks behind a wall of alphabet blocks |
| ? | 110, 320 | Capsule rows |
| K | 142 | Crayon kink (right, R34, flat out on the line): crayon fence |
| E | 174 to 254 | Alphabet esses (left, right, left): block towers in the pockets |
| T | 270 to 311 | Spinning Top hairpin (right, R13): a giant top spins in the infield |
| R | 356 | Toy train on its own oval in the infield, never touching the road |
| D | 382 to 418 | Domino run outside the back straight: 40 dominoes topple in a wave ahead of the leader, stand back up behind |
| > | 395, 545 | Boost pads |

### 6.4 Picnic Park (circuit 2)

A lawn at the edge of a garden: the paddock is a lemonade stand, the infield a picnic blanket world. Outdoors with the town sky; white picket fence (1.2 m) 25 m beyond the outer road; hedges and giant flowers beyond.

```
            .. ...................X...............
            . ....................................
            . ....................@...............
            . ....................................
            ......................k...............
             ........1......................B.....
             .....................................
             .....................................
           #########################|####################
       #############################|#######)################
     ####)##########################|##########################
   ###########                      |                 ##########
  ########                                                #######
  ######                                              W    ######
 ######                                                     #####
 ######                   G                                 #####
 ######                                                     ##?##
 ######                                                     ##v##
 ######                                                     #####
 ######                                                     ######
 ###>##                                                     ######
 ######                                                      ######
 ######                                                      ########
 ######                                                        ########
 ###^##                                                         #########
 #######                                                          ########
  #######                                                    Q      ######
   #########                                                         ######
    ###############################################                  ######
      ######################(H#########################              ######
         ################################################            ######
                                                 #########           ###J##
                                                    ###^###          ######
                                                     #######         ######
                                                N     #######        ######
                                                       ######        ######
                                                       ######        ######
                                                       ######        ######
                                                       ######        ######
                                                       ###?##        ######
                                                       ######        ######
                                                       ######   Z    ######
                                                       #######      #######
                                                        ##################
                                                         #########(######
                                                           ############
```

Start (-3, -70) heading +x; arrival (-8, -99); kart (-8, -90); exit (-8, -108); podium (-33, -89); tower (12, -87).

| Mark | s (m) | What |
| --- | --- | --- |
| W | 33 to 62 | Sandwich Bend (right, R18) round a 10 m sandwich |
| ? | 70, 228 | Capsule rows |
| Q | 80 to 125 | Basket esses (left, right) round a picnic basket |
| J | 125 to 175 | Blanket Run on gingham road: ramp 129 to 140 (boost pad 132 to 136), watermelon-slice kicker lip at 140 (1.3 m), gap 140 to 148 over a lemonade puddle (a dip in the ground), landing 148 to 175 |
| Z | 175 to 219 | Juice Box hairpin (right, R14); the bendy straw arches over the road 9 m up (fades if the camera rises into it) |
| N | 239 to 283 | Gnome sweeper (left, R28, the long drift): 16 m garden gnome that blinks |
| H | 283 to 343 | Anthill Rise: crest 2.5 m, verges of packed earth; ants march across the infield |
| > | 390 | Boost pad on the flower border |
| G | 469 | Grandstand on a cake stand |

### 6.5 Sandcastle Cove (circuit 3)

A beach playset. The sea lies south beyond the Boardwalk with a gentle animated surface; the lagoon in the infield joins it through a channel that passes under the Plank Bridge. At night a lighthouse on the point sweeps its beam.

```
          . . .. ...................X...............
          .. ... ...................................
           ... . ...................@...............
            ........................................
            ........................k...............
             ..........1......................B.....
             .......................................
              .....
               #######################|####################
           ############)##############|#######)?###############
         #############################|##########################
        ##########                    |                ###########
       #######                                              #######
       ######    U                                           #######
       #####                                                  ######
      ######           G                                      ######
     #######                                                  ###?##
    #######                                                   ###v##
   #######                                                    ######
  ###^###                                                     ######
 #######                                                      ######
 ######                                                       ###O##
 ######                                                       ######
 ######                                                       ######
 ######                                         L             ######
 ######               ##########                              ######
 ###T##            ########(#######                           ######
 ######          #####################                      #######
 ######         #########    #####################################
 ######        #######          #################P#####(#########
 ######        ######    C         ###########################
 ######        ######
 ########    #######
  ####(#############
    ###############
      ##########
```

Start (8, -49) heading +x; arrival (3, -79); kart (3, -70); exit (3, -88); podium (-22, -69); tower (23, -67).

| Mark | s (m) | What |
| --- | --- | --- |
| ? | 18, 72 | Capsule rows |
| O | 64 to 107 | Boardwalk (plank road): three 2.4 m beach balls bounce across on 6 s cycles; their shadows grow where they will land |
| P | 132 to 164 | Plank Bridge: up 134 to 142, deck 1.2 m up from 142 to 154 over the channel (water at -0.5 m in a dip), down 154 to 162; rope rails |
| L | infield | Lagoon with bobbing rubber ducks |
| C | 164 to 268 | Crab Claw: right R22, left R18 135, right R14 180 round rocks and rock pools; crabs scuttle |
| T | 268 to 304 | Castle Gate: tunnel through an 18 m sandcastle from 278 to 296, 6.5 m inside, flags on the towers |
| U | 337 to 366 | Bucket corner (right, R18) round a bucket and spade |
| G | 376 | Grandstand of beach towels on a dune |

### 6.6 Starlight Bedroom (circuit 4)

A child's bedroom at night, lit by a moon nightlight. The only anticlockwise circuit. Walls 40 m beyond the road, a ceiling of glow-in-the-dark star stickers, a slowly turning planet mobile over the infield.

```
                      #####
                  #############
                #################
               ####################
               ######       ##########
              ######    M     #####(################################
              ######           #######################J##########(#####
              ######               #####################################
              ###v##                                             #######
              ###U##                                               ######
              ######                                               ######
              ######                                               ######
              ######                                               ######
              ######                                               ######
            ########                                               ######
       ############                                                ######
    ######Y######                                                  ##?###
   ############                                                    ######
  ########                                                         ######
 ###v###                                                           ######
 ######         G                                R                 ##^###
 ######                                                            ######
  ######                                                      K    ######
  ########                                                       #######
   ############                        |                    ############
     ##################################|##############################
       ###################)#>##########|#######)####?###############
           ############################|#########################
                 ....................................
                 ....................................
                 .......1......................B.....
                 ....................k...............
                 ....................................
                 ....................@...............
                 ....................................
                 ....................X...............
```

Start (6, 48) heading +x; arrival (1, 78); kart (1, 69); exit (1, 87); podium (-24, 68); tower (21, 66).

| Mark | s (m) | What |
| --- | --- | --- |
| R | infield | Toy rocket on its launch pad; lifts off on the final lap |
| ? | 25, 92 | Capsule rows |
| K | 42 to 70 | Alarm Clock corner (left, R18); hands tick; it rings for the final lap |
| | 117 to 139 | Slipper turn (left, R14) against a giant slipper |
| J | 139 to 185 | Book Stack Leap: up a tilted book 141 to 153 to 1.8 m, boost pad 153 to 158, lip at 160, gap 160 to 167 (the floor between the stacks; falling in sends the Grabber), second stack at 1.2 m from 167 to 176, down 176 to 184 |
| M | 206 to 245 | Nightlight loop (left, R15) round the glowing moon |
| U | 245 to 273 | Under the Bed: tunnel 249 to 271, bed base 6.5 m up, glowing star stickers, a dust bunny with googly eyes |
| Y | 273 to 318 | Cat's Tail chicane: a giant sleeping cat in the infield; every 9 s its tail sweeps across the road at s 296 in 1.2 s after a 1.5 s twitch warning; a hit pushes you sideways at 60 percent speed |
| > | 380 | Boost pad |
| G | 330 | Grandstand of stacked board-game boxes |

---

## 7. Technical plan

### 7.1 Modules

```
src/shared/kart/                shared by the browser and the API
  circuits.ts     the four circuit definitions (pieces, start, laps, profile keys, gaps, set-piece and capsule positions, medal times)
  profile.ts      h(s), gaps, surfaces, verge and rail extents, from a circuit definition
  rules.ts        classes, bodies, points, item odds, hit costs, minLapMs per circuit
  ghost.ts        ghost encode, decode and validateLap (server board rule)
src/experiences/kart/
  world.ts        KartWorld implements SpaceView; state machine (idle, menu, flyover, grid, countdown, running, finished, podium)
  kart.css        HUD, menus, results, order strip (imported from world.ts)
  build/road.ts   ribbons, verges, rails, decks, gaps, tunnels, decals, the layer table
  build/props.ts  shared procedural toys (blocks, crayons, tyres, flags, bunting, crowd, grandstands, signs) with merging and instancing
  build/blocktown.ts, picnic.ts, cove.ts, bedroom.ts   dressing, landmarks, hazards, lighting rig per circuit
  racekart.ts     RaceKart extends Vehicle: bodies, height and air, spin-outs, trick, assists, remote layout
  drivers.ts      today's kart-drivers.ts plus Ink, Barnaby, voices, podium poses
  ai.ts           racing line, plan, passing, drifting, hazards, items (seeded)
  items.ts        capsules, ball, marbles, bubble, plane, springs, hit resolution
  race.ts         grid, countdown, laps, standings, finish, cup points
  ghost.ts        record at 10 Hz and play back
  hud.ts          position, laps and time, minimap with faces, item slot, order strip (on the kit HUD)
  menu.ts         race menu, garage, trophies, assists, results, standings
  cinema.ts       flyover splines, grid pan, finish orbit, podium (kit camera)
  music.ts        songs as data for the kit sequencer
  save.ts         device profile and ghosts
  debug.ts        debugInfo, debug calls, z audit
```

`src/experiences/kart.ts` and `kart-drivers.ts` are retired once `world.ts` passes the old checks; `game.ts` `buildArea` constructs `KartWorld` for kind `kart`.

### 7.2 SpaceView hooks

- `scene`, `sun`, `colliders` (mutated in place when a circuit loads), `door` and `arrival` as getters per circuit (the game reads `door` every frame).
- `rideables()`: your kart. `extraColliders()`: computer karts, marbles, beach balls, the cat's tail.
- `step(h, player)`: race logic, AI, items, heights, hazards, boom gate collider by `player.riding`, the Grabber, ghost recording; fixed 1/60 s steps from the game.
- `rideAction(player)`: "Race menu" when stopped in the pit box; the item ("Throw ball") in a race; "Back on track" when lost; OK drift toggle in the remote layout; never "get off" outside the paddock.
- `actions(player)` on foot: trophy cabinet, timing tower, the framed sketch.
- `holdsTime()`: true in flyover, race, time trial and podium, so the pause menu stops the clock.
- `setQuality(tier)`: crowd counts, particles, shadows casting set, post chain, props distance.
- `render(renderer, camera)`: kit post chain; near plane 0.3 while racing (restored on leave); FOV with speed.
- `cutaway(cam)`: fade tunnel roofs and overhead arches the camera rises into.
- `resize`, `update` (animation, HUD), `dispose` (kit cleanup, restore camera).

### 7.3 Engine changes (small, reviewed separately)

1. `game.ts` `follow()`: riding height `v.pos.y + 1.35` (camera rides over crests and jumps).
2. New optional `SpaceView.rideBack?(player)`: when it returns an action, Back while riding runs it instead of dismounting ("Leave the race?" in races, "Drive back to the paddock to get out" elsewhere).
3. `Vehicle.drive` passes `this.pos.y` to `resolveCircle`, and its private parts become protected so `RaceKart` can extend it. The town's kart and scooter behave exactly as before (`playtest.ts` step 3).
4. `ExperienceCtx` gains the kit's camera override and shake (already planned by the kit).
5. Content: `Experience` kart gains optional `circuits?: string[]` (default: all four); `contentProblem` and the zod schema check the ids. Room 1 needs no migration: its stored track equals Block Town's line (matched by `trackId`), and `laps` keeps applying to a sketch track.
6. Any other room's kart area keeps working: its stored `track` becomes a "sketch circuit" with Block Town dressing placed automatically (today's behaviour, batched).

### 7.4 Road and elevation build

- `profile.ts` turns circuit keys into `h(s)` (raised cosine bumps, linear ramps with a curved kicker, flat decks) and gap spans. Unit tests bound slope (16 percent), crest curvature, kicker angle and landing straightness.
- `road.ts` builds per surface material a ribbon segment set between s-ranges (gingham, boardwalk, rug and so on), sharing edge vertices, never overlapping; gaps end with capped edges; decks and book tops get side faces; verges slope out to y -0.08; rails become box colliders along the edges.
- Karts: after `drive`, `RaceKart` reads `h(s, offset)`; on the ground it snaps to it (and applies a gentle slope force); off a kicker it becomes airborne with the launch velocity; landing squashes the body and may trigger a trick boost. Shadows stay on the ground (blob moved to the ground height).

### 7.5 Simulation and determinism

- Seeded PRNG (mulberry32) per race for AI choices, item rolls, hazard phases and rocket-start chances. `Math.random` stays only in pure visuals.
- `debugSimulate(seconds, { circuit, cls, seed, autopilotPlayer })` runs every kart headless at 60 Hz, returning laps, longest off-road time, Grabber count, finishing order and item hits.

### 7.6 Rendering and performance budget

Batching: static scenery merged per material (the `Batch` from `arcades.ts` moves into the kit); repeated props instanced (blocks, crayons, tyres, dominoes, crowd, capsules, ants, marbles); each kart and driver merged into about 6 draw calls plus one shared wheel `InstancedMesh` for all 32 wheels; name tags from one atlas. Props beyond the fog distance hidden every half second. One circuit in memory at a time (the previous one kept for quick restarts), built behind a curtain in at most 300 ms on a mid phone.

| Tier | Draw calls | Triangles | Lights | Shadows | Post-processing | Particles | Other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Low (phones, TV) | 160 or fewer | 150k | Hemisphere + 1 directional | None (blob shadows) | None | 150 | Engine render scale 0.6, crowd 48, fog 30 to 130 m, textures 512 px or smaller, no animated flags |
| Medium | 300 | 400k | Same | Sun 1024 (karts and big props cast) | Half-res bloom (strong in the Bedroom), vignette | 400 | Crowd 160, flag waves |
| High | 450 | 900k | Same, plus 2 point lights in the Bedroom (nightlight, rocket) | Sun 2048 | Full bloom, vignette, colour grade, boost speed lines, window light shafts in Block Town | 1200 | Crowd 400, ants and butterflies, mobile |

`debugInfo().render` reports `renderer.info` calls and triangles; the playtest fails if a tier exceeds its budget on any circuit.

### 7.7 Z-fighting and overlap prevention

Layer table (every horizontal surface belongs to exactly one layer):

| Layer | Surfaces | Height | Depth handling |
| --- | --- | --- | --- |
| Ground | Floor, lawn, sand | -0.04; dips go lower, never higher | `polygonOffset` +1 |
| Prints | Rugs, blanket hems, foam lines | -0.02, clipped away from the road corridor at build time | none needed |
| Road | Road ribbons, decks, book tops | `h(s)` | none |
| Paint | Start line, grid boxes, boost pads, puddle shine | `h + 0.004` | `decal()` offset -1 to -3 |
| Skid marks | Ring buffer of quads | `h + 0.006` | offset -4, depthWrite off |
| Curbs | Raised strips | 0.07 top, outer lip dips to -0.04 | not coplanar by shape |
| Glow | Light pools, dust rings | `h + 0.06` | additive, depthWrite off, renderOrder 2 |
| Skirts | Verges, deck sides | From the road edge down to -0.08 | meet the ground along a line only |

Rules: no two meshes share a plane over an overlapping area unless one is a decal; stacked props keep 2 mm gaps or a 1 to 3 degree twist; signs sit 1 cm proud of their boards with polygon offset; no road crosses another; ribbon segments meet edge to edge.

Depth precision: with near 0.1 and far 400, 24-bit depth resolves about 6 mm at 100 m. The world uses near 0.3 while racing (about 2 mm at 100 m). `debugInfo` reports `DEPTH_BITS`; on a 16-bit buffer (possible on the TV) near goes to 0.5 and fog closes to 150 m.

Checks:
- Unit tests (`tests/kart-circuits.test.ts`), per circuit: `trackProblem` null; minimum radius 12.5 m or more; zero curb folds on both edges; 8 m or more of ground between separate parts of the road; verges, rails and set pieces fit in half that gap; ramps, gaps, landings and tunnels on straights; capsules and pads 6 m or more from ramps and gaps; the grid fits on the start straight; slopes and curvature within limits.
- In-browser audit (`debugZAudit()`): collects world-space triangles facing up or down from every non-decal static mesh, buckets them on a 2 m grid, and reports pairs from different meshes that overlap in plan by more than 1 square cm within 3 mm of height; also any non-decal face within 5 mm above the road. The playtest asserts zero on all four circuits at every tier.
- Motion check: the playtest fast-forwards a lap and captures chase-camera frames at every ramp, deck and tunnel for review.

### 7.8 Server and score changes

- New action in `api/scores.ts`: `{ action: 'kartlap', roomId, areaId, browserId, name, circuit, body, ms, ghost }`. The server checks the area offers that circuit, the body exists, and runs `validateLap` from `src/shared/kart/ghost.ts`:
  - ghost of 10 Hz samples, x and z quantised to 5 cm, sample count matching `ms`;
  - starts within 6 m before the line and ends past it;
  - every step no longer than the fastest legal speed (body top x 1.35 boost x 1.15 tolerance) allows;
  - every sample within the road half width + curb + 6 m of the centre line;
  - forward progress sums to the lap length within 3 m, passes the one-third and two-thirds gates in order, and never jumps more than 25 m along the lap (the client's shortcut rule);
  - `ms` at least the circuit's `minLapMs`; rate limit 40 per minute as today.
- Keys: `kartlap:<room>:<area>:<circuit>` (Block Town keeps `lap:<room>:<area>`), `kartghost:<room>:<area>:<circuit>:<browserKey>` stored only while in the top 10.
- `GET /api/scores?roomId&areaId&circuit=` returns the board with body and ghost flags; `&ghost=<rank>` returns that rank's ghost by rank only (no browser keys leave the server).
- The old `lap` action stays for one release for cached clients, then goes.
- Cup trophies, medals and race results stay on the device: the server cannot check a race against client-side drivers, so they never reach a shared board.
- Honest saving: the lap flash shows "Saved to the board" only after the server confirms; on a rejection it says "Saved on this device" and keeps the ghost.

### 7.9 Headless testability

`debugInfo()`: state, circuit, class, seed, tier, render calls and triangles, depth bits, your kart (position, height, airborne, speed, drift, stage, boost, item, immunity), race (lap, place, standings, times, points), every computer kart (s, speed, laps, offMax, grabs, item), hazards (phase), capsules, ghost (recording, samples), boards loaded, z-audit result, and `at(s, offset)`.

Debug calls: `debugSeed`, `debugLoadCircuit`, `debugSimulate`, `debugNearFinish`, `debugGiveItem`, `debugTeleportS(s, offset)`, `debugSkipCinematic`, `debugShortRace(laps)`, `debugZAudit`, `debugLineUp`.

Playtest `scripts/karttest.ts` (added to `scripts/autobuild/playtests.txt` as desktop, `PHONE=1`, `PAD=1`, `REMOTE=1`), each driving real input:
1. Arrive, intro card, walk to the kart, get in (Interact, Action, A or OK).
2. Open the race menu and pick Single race on Block Town (focus navigation per device).
3. Countdown with a real rocket start (W, stick up, RT or Up).
4. Drift into a mini-turbo (Space and A, Brake plus stick, X plus stick, or OK toggles on the remote).
5. Item: capsule pickup by driving through, use with E, Action, A or Up; assert a hit on a placed kart.
6. Jump on Picnic Park with real gas; assert airborne, landing and trick boost (drift button or OK in the air).
7. Hazards: beach ball and cat's tail hit and recover.
8. Finish via `debugNearFinish`, results card navigated by the device, podium, Next race flyover skipped by input.
9. Time trial lap (centre-line drive as today), ghost saved, board accepted by the server; a doctored ghost is rejected.
10. B on the controller in a race asks before leaving; TV Back opens the pause menu; leave through the exit door.
11. Every circuit: `debugSimulate(150)` for each class (all drivers keep lapping, off-road under 1.5 s, no Grabber), `debugZAudit()` zero, render budget per tier.
12. Screenshots day and night per circuit.

Unit tests: `tests/kart-circuits.test.ts` (above), `tests/kart-rules.test.ts` (points, odds rows sum to 100, hit costs and immunity, class and body numbers, `minLapMs`), `tests/kart-ghost.test.ts` (round trip; valid lap passes; teleport, too fast, shortcut, backwards, wrong circuit fail), `tests/kart-ai.test.ts` (seeded sims finish on every circuit and class; same seed gives the same order), plus `tests/scores.test.ts` cases for `kartlap` and board isolation per circuit.

### 7.10 Build order

1. Foundations: `KartWorld` with Block Town re-dressed and batched, `RaceKart`, engine hooks, layer table, z audit, budgets, `karttest.ts` porting today's checks.
2. Race structure: 8 karts, Ink and Barnaby, HUD, results, cup points, flyover, grid pan, podium, music.
3. Items, capsules, AI items.
4. Elevation and Picnic Park, then Sandcastle Cove, then Starlight Bedroom.
5. Time trial, ghosts, server boards.
6. Onboarding, progression, unlocks, juice pass.
7. QA on every input path, then the TV and a real phone.

---

## 8. Scope

### Must-have for the first release (priority order)

1. `KartWorld` in `src/experiences/kart/` with the draw-call budgets met, keeping the handling and AI core.
2. Z-fighting and overlap protection: layer table, circuit unit tests, in-browser audit on every circuit and tier.
3. Control layouts for every input path, including the remote layout, Auto gas on touch, and B never abandoning a race by accident.
4. Block Town re-dressed as the playroom with its arch, dominoes, train and paddock (board carries over).
5. Race structure: 8-kart grid, Grand Prix (Toybox Cup, points, trophies), Single race, Free drive, three classes.
6. Cast of seven with voices, rival, cheers and sulks; three kart bodies and paints.
7. Flyover, grid pan, countdown and rocket start, final lap, finish orbit, results card, standings, podium.
8. HUD: position, lap and time, minimap with faces, item slot, order strip, lap splits, wrong way.
9. Items (six) with capsules, AI use and the items-off switch.
10. Elevation system and the Grabber; Picnic Park, Sandcastle Cove and Starlight Bedroom with their set pieces and hazards.
11. Time trial with your ghost, medals, server-validated boards per circuit, racing a board ghost.
12. Music for the paddock and each circuit, final-lap lift, jingles, all listed effects.
13. Onboarding: intro card, warm-up lap with Bolt, device-aware tip boards, contextual tips.
14. Progression: unlocks, trophy cabinet, stats.

### Nice-to-haves (priority order)

1. Rewind Cup: the four circuits backwards, with set pieces re-placed for the direction (jumps re-authored).
2. Barnaby's champion ghosts recorded for every circuit and class.
3. Weekly featured circuit with its own board; a daily seeded race.
4. "Randroid's original" bonus circuit from the page 1 drawing, smoothed, with Block Town dressing.
5. Look-behind on LB, RB or Tab; a horn button.
6. Replay of the last race with TV-style cameras from recorded positions.
7. Race as one of the characters (hide your avatar, seat the character).
8. Photo mode at the podium.
9. More hazards: a sprinkler that wets a corner in Picnic Park, the lighthouse beam blinding a corner at night.
10. A fifth circuit (a kitchen counter: cereal box tunnel, cookie jar hairpin).

---

## 9. Risks and open questions

Risks:
1. **Scope.** Four dressed circuits plus items is the bulk of the work. Mitigation: one shared prop kit, Block Town finished first as the quality bar, then one circuit per milestone; if time runs short, ship with three circuits and the cup as three races.
2. **Engine changes** (camera height, Back while riding, Vehicle height and protected members) touch the shared engine. Mitigation: each is a few lines with the town playtests rerun.
3. **TV performance.** The current scene is already 369 draw calls on low. Mitigation: batching first, budgets enforced by the playtest, low-tier fog and culling.
4. **TV remote keys.** I assume the remote sends one key at a time; the remote layout works either way, but needs checking on the S90H, with whether Up and OK repeat while held.
5. **Depth precision on the TV** (possible 16-bit depth). Mitigation: near plane, fog, generous separations, the audit reporting depth bits.
6. **Item frustration for young players.** Mitigation: hit immunity, 1.4 s worst cost, nothing targets first place, items off switch, Windup odds.
7. **Ghost validation false rejections.** Mitigation: tolerances tuned with real laps; rejected laps stay saved on the device and are reported honestly.
8. **AI on new geometry** (jumps, decks, hazards) may run wide or stall. Mitigation: seeded sims on every circuit and class in tests, the Grabber as a safety net.
9. **Trademark proximity.** A toy dinosaur named Rex in a world of racing toys sits close to a famous film character. Recommendation: rename him Stomp and keep the model. Names chosen to avoid known products: Toybox Grand Prix, Windup, Battery, Rocket, the Grabber, Rewind Cup.
10. **Build time on weak devices.** Mitigation: build behind a curtain within 300 ms, keep the last circuit cached.

Open questions for the creator:
1. Should shared-board laps come only from Time trial (my recommendation), or from free drive too?
2. Keep Block Town's existing board as is, or start fresh boards for the new season?
3. Is the "tiny karts, giant rooms" theme right for room 1's world?
4. OK to rename Rex to Stomp?
5. Should the page 1 drawing appear as a framed picture only, or also as the bonus circuit?
6. Is an 8-kart grid acceptable on the TV, or should the low tier race 6?

---

## Working files

All in `/tmp/toyboxes-worlds/kart/`:
- `look.mts`: drives the current build on a local dev server and takes the screenshots in `shots/`.
- `info.mts`: measures draw calls and triangles per tier on the current build.
- `circuits.mts`, `solve.mts`, `solvelib.mts`: build, solve and check candidate circuits with the repo's own code; `circuits.png` contact sheet.
- `circuit-pieces.ts`: the piece lists for circuits 2 to 4; `circuit-*.json`: centre lines of all four.
- `ascii.mts`, `plans.md`, `plans.png`: the text plans above and a labelled drawing of each circuit.
- `coords.mts`: world coordinates along Block Town.

## Decisions after review

Decisions on your questions:
1. Shared-board laps come only from time trial: yes. Races still save personal bests on the device. The race results card points people to Time trial for the board.
2. Block Town keeps the existing board: yes. Keep the centre line identical so the old laps stay valid.
3. "Tiny karts, giant rooms" is the theme: yes.
4. Rename Rex to Stomp: yes.
5. Frame the original drawing in the paddock only. No bonus circuit.
6. Grid size: 8 karts if the low tier meets your draw-call and frame budgets, otherwise 6 on low only. Boards come from time trial, so this cannot affect them.

Engine asks:
- "Camera follows kart height" is done in commit 52a6360: follow() adds v.pos.y.
- "Back while riding" is done as `SpaceView.rideBack(player)`: return true when you handled Back, otherwise the player gets off.
- Vehicle height and protected members are yours to change in src/world/vehicles.ts. Keep them backwards compatible, because the town's scooters and karts use the same class, and rerun scripts/playtest.ts desktop.
- Auto gas and the remote layout should live in your world as far as possible (rideAction, captureInput or a small generic hook). If you add a hook, keep it generic and list it in your report.
- Server-side lap re-validation from a recorded path goes in server/kart.ts with tests. Keep recordLap's contract working for the existing Block Town board.

Scope: work through must-haves 1 to 14 in order. If something must be cut, the fallback in your risk 1 (ship three circuits and a three-race cup) is acceptable, but everything you ship must be fully dressed and polished. Music (12) and onboarding (13) are cheap with the kit, so do not leave them to the end and then drop them.
