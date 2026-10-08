# Black Hole Bloom: design for room 12's black hole galaxy

> The design written before the build. The review decisions at the end override it where they differ. What shipped is recorded in `docs/ACCEPTANCE.md`. Paths under `/tmp/toyboxes-worlds/` were scratch files and no longer exist.

World kind `galaxy`, room 12 ("Black hole galaxy", owner estevan). Visitor page: "black hole galaxy", with a drawing of deep space crossed by diagonal streaks of coloured stars, a blue planet with a green ring, and a yellow, purple and green swirl on the right.

This builds up from the current build (`src/experiences/galaxy.ts`, `galaxy-shaders.ts`): the portal fall, the shader nebula, the accretion disk and photon ring, the iridescent hex platform, the comet streaks, bloom and lensing by tier, low gravity at 0.35, and the feeding frenzy board. All of that stays. What it lacks is a world: today it is one 10.5 m disc with one verb and one round.

Everything below was checked against the engine code (`game.ts`, `physics.ts`, `camera.ts`, `input.ts`, `touch.ts`, `space.ts`, `server/scores.ts`) and against the running build on port 5213 (screenshots in `/tmp/toyboxes-worlds/galaxy/shots/`).

---

## 1. Vision

### Pitch

A hungry black hole sits at the heart of a dim little galaxy. Kick it glowing orbs, win stars on the floating worlds around it, and every star you feed makes it bigger, lights a constellation and opens a new place. Feed it enough and a stair of debris spirals up to its edge. Step in, ride the warp, and watch it bloom into a brand new spiral galaxy with your name written in the stars.

### The fantasy

"I am a small explorer in a galaxy I can walk around, and the giant thing in the sky changes because of me." The black hole is the main character: it is huge, it is always in view, it reacts to everything you do (flares when fed, burps a jet of sparkles when it is happy, rumbles when it is about to grow), and it physically grows across the whole journey from a dark coin in the sky to a looming mouth that fills a third of the screen. The payoff is going inside it.

Secondary fantasies, each taken straight from the drawing:
- **Walking the ring of the ringed planet.** The drawing's blue planet with its green ring becomes a place: the ring is a flat, 6 m wide walkway that circles the planet. Running a lap around a planet, with its banded blue wall curving beside you, is the "walk around a world" moment that the flat physics can do for real.
- **Surfing a comet through the warp streaks.** The drawing's diagonal coloured streaks become a ride: you stand on a comet and steer it through the streak field, past the black hole's disk and through the gap in the ring.
- **Dodging a rock storm on a floating island,** with low-gravity hops.

### Title

**Black hole bloom.** The area keeps the name the creator gave it ("Black hole galaxy"); "Black hole bloom" is the title card on first visit and the name of the finale.

### Pillars

1. **The black hole is always the answer.** Every activity ends with something flying into it, and it visibly responds.
2. **Float, don't fall.** Low gravity, generous air control, and a star net that catches you. Nothing in this world punishes a child for a missed jump with more than a few seconds.
3. **See it, go there.** Every place you can visit is visible from the hub, with its own silhouette and its own constellation hanging above it.
4. **Arrows and OK are enough.** Every star can be earned with move plus interact. Jump and kick make you faster and find secrets.

### Art direction

The current trippy look is the base and it stays: fbm nebula, additive glow, iridescent glass, bloom, chromatic fringe, lensing near the hole. The changes are about form (distinct silhouettes for each island), legibility (walkable tops read instantly against the void), and pulling the drawing's exact colours forward.

**Palette.** The drawing was sampled directly (`colors.mjs` in my folder). Drawing colours are the anchors; the build's existing glow colours sit beside them.

| Role | Hex | Source and use |
| --- | --- | --- |
| Deep space | `#2b2340` | The drawing's background. Nebula base, mixed down to `#120d24` for depth so stars still pop |
| Void below | `#07051a` | Under the islands, the darkest value in the scene, so the drop reads |
| Planet blue | `#4aa3df` | The drawing's planet. Planet bands from `#1f4f9e` to `#7cc4f2` |
| Ring green | `#3fb68b` | The drawing's ring. The walkable ring top, gates, Ringworld constellation |
| Swirl gold | `#f4b740` | The drawing's swirl. Inner accretion disk, stars (the reward colour), Star sling pads |
| Swirl purple | `#8a6bd1` | The drawing's swirl. Mid disk, hub crystal emissive, nebula |
| Streak coral | `#e8574a` | The drawing's red streak accents. Hazard colour (meteor targets), never used for rewards |
| Glow mint | `#53f0c0` | Existing build. Interactables and the frenzy shrine |
| Glow sky | `#6cc4ff` | Existing build. Spark the guide, checkpoint pads |
| Hot white | `#fffaf0` | Photon ring, star cores, text on billboards |
| Ember | `#ff8a3d` | Cinder island cracks (warm, separate from hazard coral by shape) |
| Ice | `#bfe8ff` | Comet nucleus and the Comet dock |

Rules: gold always means reward, coral always means danger (and danger always also has a shape cue: a dashed ring), mint means "you can use this", sky blue means "Spark is pointing here".

**Lighting.** No sun. The key light is the accretion disk: a warm point light at the hole (medium and high) plus a cool lilac directional key from above and behind the camera for form and shadows. Hemisphere fill from purple above to near black below. Every island top has an emissive rim line so its edge reads at night-like contrast even on the low tier. The black hole's flares drive a global "pulse" uniform that brightens hub seams, island rims and the nebula in sync, so feeding it lights up the world.

**Materials.**
- Hub and Cinder: hex crystal tiles (existing). High: `MeshPhysicalMaterial` with iridescence and a PMREM of the nebula (existing). Medium and low: standard material with a cheap fake iridescence from a view-angle hue shift in `onBeforeCompile`, so low no longer looks flat navy.
- Island undersides: flat-shaded, noise-displaced icosahedra (inverted crystal clusters and rock roots) with emissive veins in the island's colour, tapering into the void. These sell "floating" and hide the physics truth that every collider is a pillar.
- Planet: the existing banded shader, recoloured to the drawing's blues, with a fresnel atmosphere in ring green.
- Ring walkway: opaque top (readability first) with the existing banded ring shader as a stripe pattern, plus bright green edge tubes.
- Orbs: a fresnel core shader instead of `MeshBasicMaterial`, so they glow as spheres even without bloom (today on low they render as flat white discs: see `shots/05-low-tier.png`).
- Comet: ice nucleus (displaced icosphere, sky white), additive ribbon tail in the drawing's six streak colours.

**Silhouettes.** Hub: a wide hex disc with a glowing rim and a crystal root. Ringworld: sphere plus flat ring, unmistakable. Cinder: a jagged dark basalt disc with a central spire and ember cracks. Comet dock: a crescent of ice with a moored comet and its long tail. Horizon stair: a rising spiral of stones that only exists late. Black hole: a black disc ringed in white-gold with the swirl around it. Each reads at 60 m on a phone.

**Mood.** Wonder first, then cosy. A lullaby in the hub, bright and bouncy in challenges, awe in the finale. Never scary: the black hole is hungry and a bit silly (it burps), not a threat.

**Reference games.** Super Mario Galaxy (hub observatory that grows, launch flights between planetoids, star bits that sing), Outer Wilds (every destination visible from the start, the pull of the central body), Journey (wordless guidance, the climb toward the light, a finale that changes the world), Rez (pickups that play the melody), Astro's Playroom (density of little rewards).

### Audio direction

Music runs on the kit's procedural sequencer (songs as data). One key family (D Lydian and D major pentatonic) across the whole world so transitions crossfade cleanly.

| Song | Tempo | Instruments | Notes |
| --- | --- | --- | --- |
| Hub: "Lullaby for a hungry star" | 72 BPM | Soft saw pad, celesta arpeggio, sub pulse | The sub pulse is the black hole's heartbeat; the disk brightness pulses with it. Adds a layer per completed island: bass (Ringworld), bell counter melody (Cinder), lead (Comet), choir pad (Horizon) |
| Feeding frenzy | 128 BPM | Four on the floor, plucked bass, chords | Each swallow plays the next note of a pentatonic riff quantised to the next eighth, so a good run sounds like a melody |
| Ring run | 140 BPM | Driving arpeggio, claps, filtered lead | Gate chimes climb a scale with each gate; the scale resets on a miss |
| Rock rain | 116 BPM | Toms, low brass stabs, ticking hats | Meteors land on beats (schedule is on the beat grid) so the rhythm is readable |
| Comet surf | 150 BPM | Soaring lead, wide pads, light drums | Each stardust ribbon is a phrase; collecting it plays the phrase |
| Horizon and bloom | 60 BPM rising | Choir pad, timpani swell, silence, then a big major chord | The swell tracks how close you are to the lip |

Signature sound effects (procedural WebAudio, like `sfxSpace` today):
- **Gulp:** descending sine plus a sub thump (exists as `swallow`, keep).
- **Burp jet:** filtered noise whoosh up, then sparkly high pings. The black hole's happy noise.
- **Star sling:** rising arpeggio spin-up, whoosh, soft "plink" on landing.
- **Bounce blossom:** a long, wobbly low-gravity boing.
- **Stardust:** pentatonic tinkle that climbs with each pickup in a chain.
- **Star collected:** five-note fanfare; then a glass harp as its constellation segment lights.
- **Meteor:** whistle that falls in pitch over the warning, then a crunch and pebbles.
- **Star net:** a soft "bloop" bubble, then a rising whistle as you are carried back.
- **Warp:** a roaring tunnel with a rising shepard tone, then total silence for one beat before the bloom chord.

---

## 2. Core loop and feel

### Moment to moment

- **30 seconds:** in the hub, kick orbs (or walk them) off the north lip and watch them spiral in. On an island, run a challenge: thread gates, dodge rocks, steer a comet.
- **5 minutes:** finish a challenge, earn one to three stars, watch each star fly from the results card into the black hole, see it grow, see a constellation segment light, see a new star sling switch on. Pick the next place.
- **Session:** a journey of 12 stars to the finale across 3 to 5 visits; afterwards, nova medals, lost moons, the daily storm and the boards.

### Movement numbers (verified in `game.ts`)

Gravity is `24 x 0.35 = 8.4 m/s²`, jump speed 7.6 m/s, so a jump peaks at **3.44 m** after 0.9 s and lands **1.81 s** later on flat ground. Walk is 6 m/s (run x1.3 = 7.8 m/s). Air control is full (the walk damping applies in the air too). A standing jump carries **10.9 m** walking and 14.1 m running. You can land on a top up to about 3.5 m above your feet (`groundHeight` accepts tops within 0.12 m of your height). There is no step-up: any top even 1 cm above your feet blocks you sideways until you jump onto it.

Level design rules that follow:
- Walkable surfaces are flat. Height changes happen by jump, bounce blossom or star sling, never by ramps.
- Comfortable jump gaps: 3 to 7 m. Hard: 8 to 10 m. Gaps over 11 m need run, so they are never on a required path.
- Ledges up to 2.5 m comfortable, 3.2 m maximum.
- `gravity()` is called every step, so it can vary by place: 0.35 everywhere, rising to 0.5 on the Horizon stair (you feel heavier near the hole), 0.25 on the Comet dock (extra floaty for the jump secret there).

### Traversal verbs

| Verb | How | Needs | Feel |
| --- | --- | --- | --- |
| Walk | Move | Any device | Existing |
| Float jump | Jump | Optional extra (no remote) | Existing; shortcuts and secrets |
| Star sling | Stand on a gold star pad, Interact | Any device | 0.6 s spin-up, then a scripted arc flight (2 to 3 s) to a landing pad on another island |
| Bounce blossom | Walk onto a flower pad while moving toward its arrow | Any device, automatic | A scripted arc across a gap or up a ledge, about 1.6 s |
| Comet lane | Walk onto a glowing stardust strip | Any device, automatic | Whisked along it at 14 m/s for its length |
| Star net | Fall off anything | Automatic | A bubble catches you below the edge and floats you back to the last checkpoint in about 1.3 s |

Star slings, bounce blossoms, comet lanes and the star net all use one new engine hook (`carry`, section 7) that lets the experience move the player along a scripted path. They are deterministic, which makes them testable and fair on the boards.

### Controls

| Action | Keyboard and mouse | Touch | Controller | TV remote |
| --- | --- | --- | --- | --- |
| Move | WASD or arrows | Floating stick | Left stick or d-pad | Arrows |
| Look | Drag, or J/L/I/K | Drag right half | Right stick | None: auto camera, and arenas lock the camera (below) |
| Interact (sling, start, kick the nearest orb, results buttons) | E or Enter | Action button (labelled "Fly", "Start", "Kick") | A | OK |
| Kick an orb | F | Kick button | X | OK does it when an orb is in front of you |
| Jump | Space | Jump button | Y | Not available; blossoms and slings cover every required path |
| Comet spin (magnet burst) | E, F or Space | Action button | A, X or Y | OK |
| Run (outside rounds only) | Shift | None | L3 | None |
| Cycle Spark's target | Tab | Tap the objective chip | LB/RB | Not needed (Spark always picks the next goal) |
| Menu, leave | Esc | Menu button | Start | Back (opens the menu; "Back to estevan's room" is in it) |

Remote parity rules:
- While a round runs, run is disabled for everyone (new `runScale` hook), so a remote player, a touch player and a keyboard player all move at 6 m/s. This matters for the boards.
- Every star threshold is reachable with arrows and OK. Jumps save about 0.4 s per gap in the ring run and reach 2 of the 8 lost moons; that is the whole advantage.
- In Rock rain the camera yaw is locked to a fixed three-quarter view, so arrows always mean the same screen direction. On the ring and the Horizon stair the auto camera eases behind your heading as it does today. The comet ride uses a chase camera.
- The results card, the Star chart and every dialog go through `UI.open` and the kit's results card, so arrows, OK and Back drive them.

---

## 3. Content and progression

### Structure: hub and spokes

```
                 Horizon stair (opens at 12 stars)
                          |
   Ringworld  -------  THE RIM (hub)  -------  Cinder
   (ring run)          frenzy shrine          (rock rain)
                       star chart
                          |
                     Comet dock
                    (comet surf)
```

The hub is reached on arrival and from every island by its return sling. Islands are reached by star slings on the hub rim.

### The challenges

**1. Wake it up (tutorial, hub).** Feed 5 orbs, untimed. Reward: the first star, which the black hole burps out onto the hub. Teaches move, kick (or OK), and that the hole reacts.

**2. Feeding frenzy (hub, upgraded).** 60 seconds at the shrine. Orbs arrive on a fixed schedule (same for everyone, so the board is fair) of plain orbs (1 point), gold orbs (3 points, they roll away from you a little) and big "moonball" orbs (5 points, need two kicks, the first one only shoves them). Kicked orbs bend around the hole's pull and stretch as they fall in. A swallow within 1.5 s of the last raises a streak counter that pitches the riff up (feel only, no multiplier, so the cap stays simple). Score: points. Stars at 10, 20, 30; nova (post-game) at 45. The schedule's total is at most 150, so `GALAXY_MAX_SCORE` and the existing board key keep working and old scores stay comparable.

**3. Ring run (Ringworld).** A two-lap time trial around the planet's ring, counter clockwise, through 16 gates per lap. The walkway has 4 gaps per lap (6 to 7 m), each with a bounce blossom at the approach edge (remote-friendly) that you can beat by jumping the gap yourself. Two comet lanes per lap whisk you along the long arcs. Gates alternate between the inner and outer half of the 6 m walkway, so the line matters. Missing a gate does not stop you, but the run only counts if every gate is passed in order: a missed gate glows coral and Spark points back to it. Falling triggers the star net to the last gate passed (time keeps running).
- Course length about 314 m (2 laps at a 25 m mid radius). Estimated: walking with blossoms about 48 s, clean jumps about 44 s.
- Stars: finish; 60 s or less; 52 s or less. Nova: 46 s or less.
- Your best run is saved as a ghost (a translucent comet sprite tracing your best line), shown from the second run on.

**4. Rock rain (Cinder).** A 60-second survival round on a hex-tile island. Meteors fall on a fixed, beat-aligned schedule. Each one is announced by a coral dashed ring on the floor that shrinks for 1.5 s and a beam of light from the sky; the impact knocks you back if you are inside the ring (a short tumble) and cracks the tiles, and a second hit on a cracked tile drops it into the void, leaving a hole. Holes heal after 10 s. Star shards appear on tiles in sequence (each lasts 4 s, walk over it to collect); a big gold shard every 15 s is worth 3. You have 3 shields; a hit or a fall costs one, and the round ends early at zero (the score stands). The rate climbs from one meteor every 1.6 s to two per second, with "lines" of five in the last 20 s.
- Score: shards. Stars at 10, 20, 30; nova at 40. The schedule total is capped (about 50).
- Post-game: the **daily storm**, a new seeded schedule each UTC day with its own board.

**5. Comet surf (Comet dock).** Interact at the moored comet to ride it on a fixed 65-second loop through the galaxy: out east past Cinder, along the outer edge of the black hole's disk, through the streak field, down through the gap between the blue planet and its ring, low over the hub, and home. You steer within a 5 m tube around the path (stick or arrows: left, right, up, down). 300 stardust motes hang in ribbons of 10 to 15; each ribbon plays a phrase of the melody as you collect it. Interact is a spin: a magnet burst that pulls in motes within 3 m for 0.6 s, with a 4 s cooldown. Drifting dark clouds knock 5 motes loose if you fly through them (they flicker coral first).
- Score: motes. Stars at 120, 210, 270; nova at 300 (every mote).

**6. The Horizon (finale, opens at 12 stars).** See "The finale" below.

### The finale

At 12 stars fed, the black hole is at full size (horizon radius 12 m) and debris from every island (ring shards, basalt, comet ice) spirals in and settles into a stair of ten stepping stones from the hub's north rim up to the lip of the photon ring, rising 1.2 m per stone over about 55 m. Gravity climbs from 0.35 to 0.5 as you approach. Each stone has a bounce blossom aimed at the next (remote path) and the gaps are 1 to 2 m (easy hops for jumpers). The music swells with your height. The comet streaks across the sky reverse direction and pour into the hole.

At the lip, Interact: "Step in".

The cinematic (kit camera override, 12 s, skippable after the first time):
1. The avatar falls in, arms out, and the camera follows over the photon ring.
2. The warp: a full-screen tunnel of the drawing's diagonal streaks in all six colours, spinning, accelerating (a new `WARP_FRAG` pass; on low a cheaper version, and with reduce motion a slow fade instead of the spin).
3. One beat of silence and black.
4. White flash, the bloom chord. The camera is high above the hub looking back: where the black hole was, a spiral galaxy is blooming, arms in purple, gold, green and blue (the nebula shader switches to a spiral mode). Every lit constellation line joins up and your name is drawn in new stars across the sky (canvas text sampled into points, local only).
5. You are back on the hub. A small, new black hole hangs where the old one was, hungry again.

After the bloom: nova medals appear on every challenge, the daily storm opens, the hub keeps the bloom sky, and the Star chart offers "Start the galaxy again" (behind a confirm dialog) to replay the journey with your bests kept.

### Progression: stars, growth and unlocks

Stars available: 1 (wake) + 3 (frenzy) + 3 (ring) + 3 (rock rain) + 3 (comet) + 2 (lost moons: 4 found, 8 found) = **15**. The finale needs 12, so a child can skip the three hardest stars.

Every star you earn flies from the results card into the black hole (2 s, skippable): the disk flares, the hole grows a notch (horizon radius `4.5 + 0.625 x stars`, capped at 12; disk outer radius 18 up to 28; its pull on frenzy orbs grows too), and one segment of a constellation lights in the sky above the island that earned it.

| Stars fed | What opens | What you see |
| --- | --- | --- |
| 0 | The hub, free kicking, the tutorial | A small dark hole; all islands are silhouettes with dark constellations |
| 1 | Ringworld sling; the frenzy shrine | Ringworld's sling beam switches on; its rim lights green |
| 3 | Cinder sling | Cinder's cracks start glowing ember |
| 6 | Comet dock sling | A comet arrives in a long arc and moors at the dock |
| 9 | Horizon teaser | Debris starts orbiting the hole; the first three stones settle |
| 12 | The Horizon stair; the finale | The stair is complete; a beam rises from the lip |
| Bloom | Nova medals, daily storm, the bloom sky, cosmetics | Spiral galaxy sky, your name in stars |

**Lost moons (8).** Small glowing moonlets in hiding places. Six need only walking, slings, blossoms or steering; two need a jump.
1. On the far side of the ring, behind the planet, on a little shelf (walk).
2. On top of the exit vortex arch (jump from the shrine plinth, 2.4 m then 2.6 m).
3. On Cinder's central spire (jump: ledge at 2.4 m, top at 4.8 m).
4. Floating on the comet path in an awkward corner of the tube (steer).
5. In the Star chart: Interact with the orrery's tiny black hole three times (OK).
6. On a ledge behind the Comet dock, reached by a hidden bounce blossom (walk).
7. Feed a gold orb to the hole five times, frenzy or free play (kick or OK).
8. On a side stone of the Horizon stair, one blossom off the main line (walk).

**Cosmetics** (local, only in this world, toggled in the Star chart): a stardust trail at 5 stars, a trail in the drawing's six streak colours at 10, a tiny orbiting moon at 8 lost moons, a green ring halo (like the planet's) after the bloom. Drawn by the experience at the player's position, no avatar changes needed.

### Difficulty curve

- Visit 1: tutorial (no fail state), the first ring run (blossoms carry you, 1 star for finishing), maybe a first frenzy.
- Visits 2 and 3: two-star thresholds in the frenzy and ring run, Rock rain opens (the first challenge with a fail state, gentle at the start).
- Visits 3 to 5: comet surf, three-star chasing, the finale.
- After: nova medals (tuned so roughly 1 in 10 players gets each), the daily storm, the boards.

Rock rain eases off for the first 15 s and never puts two meteors where they would trap a player standing still. The comet ride cannot be failed. The ring run cannot be failed (only slowed).

### Personal bests on this device

Saved in `localStorage` under `toyboxes.galaxy.v2.<roomId>.<areaId>` (versioned JSON; a missing or older save starts fresh): stars per challenge, stars fed, moons (bitmask), bests per mode, nova medals, bloom flag, intro seen, chosen cosmetic, the ring ghost (best run sampled at 10 Hz, about 500 points, compressed to int16). Bests show on each island's billboard ("Your best 47.3 s") and on the results card ("New best!" with the gap).

### Shared boards (server validated)

| Board | Better | Validation (rules in `src/shared/galaxy-rules.ts`, shared by client and server) |
| --- | --- | --- |
| Feeding frenzy (existing key `galaxy:<room>:<area>`) | Higher | Integer, 0 to `GALAXY_MAX_SCORE` (150); the fixed schedule's total is asserted below it in tests |
| Ring run | Lower | Integer ms, plus 32 gate split times: strictly increasing, each segment no faster than its minimum (arc length at 6 m/s, comet lanes at their fixed time), total under 10 minutes |
| Rock rain | Higher | Integer, 0 to the fixed schedule's shard total |
| Comet surf | Higher | Integer, 0 to 300 |
| Daily storm | Higher | Date key must be today or yesterday (UTC); score up to that day's schedule total |
| Galaxy keepers (who bloomed it) | Earliest first | The server checks this browser already has a one-star result on all four main boards (its own records), then adds it once, with the time. "You are keeper number 7" |

Rate limits as today (`limit()` per browser and per IP). Names follow `scorename:<bk>` like the other boards. Never presented as live: boards say "Best runs here", not "players online".

### The first 5 minutes

| Time | What happens |
| --- | --- |
| 0:00 | Portal fall (the existing warp, fixed so the hole mask warps too). First visit only: a 6 s flyover (kit camera) from the black hole, past the ringed planet and the dark islands, settling behind the player. Any button skips. Intro card: "Black hole bloom. Feed the black hole. Watch the galaxy grow." with device glyphs |
| 0:10 | Spark, a little comet sprite, pops out of the portal, circles you and zips to a glowing orb 3 m ahead. Prompt: "Kick the orb" |
| 0:20 | First kick: the orb arcs, stretches and is swallowed; the disk flares; a 5-pip "Wake it up" meter appears with one pip lit; the camera nudges toward the hole for half a second |
| 0:20 to 1:30 | Four more orbs near the lip. Players discover walking orbs off the edge works too. A floating arc of stardust above the hub invites a jump (the jump glyph shows once; never on TV) |
| 1:30 | The hole rumbles and burps a jet; a gold star shoots out and lands on the hub beside the Ringworld sling. Spark flies to it. Walk into it: fanfare, it flies back in, the hole grows, the first green constellation star lights, the sling beam switches on. Banner: "Ringworld is open" |
| 2:00 | Spark circles the sling. Prompt: "Fly to Ringworld". OK. Flight over the void with the planet growing ahead. Landing on the ring |
| 2:15 | Start pad: "Start the ring run". 3, 2, 1, Go. Blossoms carry you over gaps, comet lanes whisk you, gate chimes climb |
| 3:30 | Finish: results card with a star or two flying into the far-off hole, board position, "Play again", "Next", "Leave" |
| 4:00 | Return sling home, or explore the ring and find the moon behind the planet. Back at the hub, the frenzy shrine is lit and Cinder's sling shows "3 stars" |

### The 30th visit

The galaxy is bloomed and the hub plays the full five-layer theme. The player checks the daily storm (new seed, new board, about 2 minutes), races their own ring ghost for a nova, tries to beat a friend's name on the frenzy board, and still has one lost moon to find. Their name is on the keepers wall at the hub. Each challenge is short (60 to 70 s) and restarts in one press, so a visit can be two minutes or twenty.

---

## 4. Onboarding

No text walls. Everything is taught by the world, Spark and one-line prompts that already name the action.

- **Spark leads.** Spark always flies to the next useful thing (an orb, the star, the active sling, the start pad, a missed gate) and circles it. When the target is off screen, a small sky-blue arrow at the screen edge points to it (DOM HUD).
- **Context prompts** (existing system) name the action with the device's glyph: "Kick the orb", "Fly to Cinder", "Start the rock rain", "Ride the comet", "Step in".
- **Diegetic signs.** Each sling has a spinning hologram of its destination (a ring, a rock, a comet) and a star-count lock ("3" with a star) while closed. Each challenge's start pad has a billboard with its stars, your best and the board.
- **First time in each challenge** a 3-panel kit intro card (icon plus one line each, for example: "Pass every gate", "Blossoms carry you over gaps", "Jumping is faster"), shown once per device.
- **Safe failure teaches.** The first fall shows the star net with no penalty outside rounds; players learn the edge is safe to explore.
- **Jump is an invitation, never a gate.** Stardust arcs and lost moons sit just above reach; the jump glyph appears near them, except on TV.
- **The black hole explains itself.** Feed it and it grows. No meter for "mass" beyond the visible size and the constellations.

---

## 5. Juice list

| Event | VFX | SFX | Camera | HUD |
| --- | --- | --- | --- | --- |
| Arrive | Portal spiral warp (mask fixed), motes rush past | Portal whoosh, hub lullaby fades in | Flyover (first visit) | Intro card (first visit), place chip |
| Kick an orb | Kick swing, orb squash then stretch along velocity, spark burst at the foot | Kick thump, orb hum doppler | Tiny nudge toward the kick | None |
| Orb swallowed | Orb spaghettifies, disk flare, ring flash, seams pulse outward across the hub | Gulp, riff note on the beat (frenzy) | None | Score pop "+1" or "+3" flying from the hole to the counter |
| Streak (frenzy) | Disk gets hotter per step | Riff pitches up | None | Streak chip "x4" |
| Black hole burp | Polar jets of sparkles for 1 s | Burp jet | Small shake (off with reduce motion) | None |
| Star earned | Star bursts out gold, flies an arc into the hole, constellation segment draws on | Fanfare, glass harp | Kit camera glance at the hole (1.2 s, skippable) | Star counter ticks, banner "Star!" |
| Hole grows | Horizon and disk scale up over 1.5 s with a ripple through the lens | Deep rumble | Shake 0.3 | Toast for a new unlock: "Cinder is open" |
| Sling launch | Pad spins up, gold ring burst, comet trail behind the avatar | Spin-up arpeggio, whoosh | FOV +8 degrees, lag behind (reduced with reduce motion) | Destination name banner on landing |
| Landing | Dust ring, pad flash | Plink | Settle | None |
| Bounce blossom | Petals compress then fling, pollen sparkles | Long boing | Slight lift | None |
| Comet lane | Lane lights under you, speed lines | Rising whoosh | FOV +5 | None |
| Fall and star net | Bubble forms, avatar curls, bubble floats back, pops | Bloop, rising whistle, pop | Camera follows the bubble | In rounds: "-1 shield" or the time keeps running |
| Gate passed | Gate ring flashes green, sparks along the hoop | Chime, climbing the scale | None | Gate count "12/32", split vs best (green or coral) |
| Gate missed | Gate glows coral, Spark flies back to it | Low buzz | None | "Missed a gate" chip |
| Lap | Ring walkway pulse runs around the planet | Lap jingle | None | "Final lap!" banner |
| Meteor warning | Coral dashed ring shrinking, beam from the sky | Falling whistle | None | None |
| Meteor impact | Crater flash, rock burst, tiles crack (instance colour) | Crunch, pebbles | Shake by distance | None |
| Tile drops | Tile tumbles into the void, glowing edges around the hole | Stone drop | None | None |
| Hit by a meteor | Tumble arc, shield shatters around the avatar | Thud, glass crack | Shake 0.4 | Shield pips lose one, red flash on the pip |
| Shard collected | Shard bursts into stardust that streams to the HUD | Tinkle | None | "+1" pop, shard count |
| Comet ride start | Comet flares, tail lengthens | Engine whoosh bed | Chase cam takes over | Mote counter, ride progress bar |
| Stardust ribbon | Motes burst, ribbon flashes when complete | Phrase of the melody | None | "+12" pop, ribbon complete star |
| Spin (comet) | Magnet ring pulse | Whirr | Small roll (off with reduce motion) | Cooldown ring around the counter |
| Dark cloud | Motes scatter out of the tail | Muffled thump | Shake 0.2 | "-5" pop in coral |
| Countdown | Start pad ring fills | Beeps (exist) | None | Kit 3-2-1-Go |
| Round end | Everything freezes for 0.3 s, then a sparkle sweep | End sting | Kit podium camera on the avatar | Results card with stars dropping in one by one, board rank, PB delta |
| New best | Gold confetti | Extra fanfare | None | "New best!" banner |
| Lost moon found | Moon pops, rises, orbits you, then flies to its constellation | Bell chord | Glance at the sky | "Moon 3 of 8" toast |
| Horizon stone settles | Debris spirals in and locks with a flash | Stone chime | None | None |
| Step in (finale) | See "The finale" | Warp, silence, bloom chord | Full cinematic | Banner "Black hole bloom" then your name in stars |

---

## 6. World layout

### Coordinates and scale

x east, z south, y up (so "north" is -z, the direction you face on arrival). The avatar is 1.6 m; the follow camera sits about 6.2 m behind at a 0.36 rad pitch. The camera's far plane is 400 m and the sky sphere is 260 m, so the playable world fits inside about 140 m by 140 m. The town's day and night clock is ignored: it is always space.

### Top-down plan (1 character is about 5 m)

```
 z
-80                              . . streak field (sky only, flows lower left to upper right)
-70                                                   ___
-62            ______                               (  H  )  black hole (24, y 12, -62)
-55          /  ring  \            lip *            (_____)  horizon r 4.5 to 12, disk r 18 to 28
-50         |  ( P )   |         *
-45          \________/        *     Horizon stair (10 stones, y 1.2 to 12)
-40       Ringworld          *
-30       planet (-38,-50)  *
-20       r 16, ring r 22 to 28, top y 6
-12                      [ blossom N ]
 -6                ___________________                       ________
  0               |    THE RIM (hub)  |  ------------------>|  CINDER |  (54, -6), r 11, top y 3
  6               |  r 13, top y 0    |                      |________|
 10               |  arrival (0, 6)   |
                  |___________________|
 20
 30                                                 ____
 36                                               (DOCK)~~~~ comet   (36, 36), r 7, top y 8
 40
     -60   -40   -20     0     20     40     60   x
```

### The Rim (hub)

- Hex crystal disc, radius 13 m (up from 10.5), top y 0, about 155 instanced tiles (size 1.2). Crystal root underside down to y -9.
- Energy rail at r 13.6 (36 box colliders, 40 m tall as today, so nobody floats off). Its glow only shows within 4 m of the player (today the faint glow all round reads as horizontal stripes across the sky: `shots/03-turn-1.png`).
- **Arrival** (0, 6), yaw about pi + 0.12 (facing just west of north), so the postcard view frames the planet left of centre and the black hole right of centre with streaks running lower left to upper right, like the drawing.
- **Exit vortex** (-8.5, 8.5), facing the centre (the existing ring and swirl). Collider circle r 1.0.
- **Frenzy shrine** (-7.5, -1.5) with its board 5.6 m up (existing art, moved). Plinth top 2.4 m (route to lost moon 2).
- **Star chart** (7.5, 3): a waist-high orrery (r 1.2 collider, h 1.1) with tiny glowing models of every island and the hole, star pips over each. Interact opens a focusable panel: stars per challenge, bests, boards (tabs), cosmetics, quick travel to any open island, "Start the galaxy again".
- **Keepers wall** (after the first bloom anywhere in this area): a ring of floating name glyphs over the Star chart.
- **Star slings** (pads r 1.2, just inside the rim): Ringworld (-8.5, -9), Cinder (11.5, -3), Comet dock (8, 9.5).
- **Horizon blossom** (-3, -12), appears at 12 stars: a bounce blossom that lifts you over the rail onto the first stair stone.
- **Feeding lip:** the north and north-east rim (bearing -30 to +45 degrees from north). Orbs spawn in the northern half, r 2 to 11, clear of pads.
- Sight lines: north to the hole and the planet; east to Cinder's ember glow; south-east to the comet's tail; turning around, the exit vortex.

### Ringworld (ring run)

- Planet sphere centre (-38, 6, -50), radius 16 (y -10 to 22). Collider: circle r 16, h 22, blocks the camera (so the camera never clips into the planet when you face outward on the inner edge).
- Walkway: flat annulus, inner r 22, outer r 28 (6 m wide), top y 6, visual thickness 1 m. Physics: 48 box colliders around the ring (each 6 m deep radially and 3.67 m wide, so adjacent outer corners meet at r 28; half width = 28 x tan 3.75 degrees), h 6. They overlap on the inner edge and leave no gap on the outer edge. The 6 m void between the planet and the walkway is a real drop.
- 4 gaps per lap, 6 to 7 m of arc, at about 70, 160, 250 and 340 degrees from the start (segments simply omitted). Bounce blossoms at each approach edge.
- 16 gates (3.5 m wide, 3.2 m tall hoops), alternating inner and outer half; lap 2 swaps sides.
- 2 comet lanes per lap, 25 m each, on the longest arcs.
- Landing pad, start and finish at the point nearest the hub, on the mid line (r 25): about (-22.9, 6, -30.1). The sling flight from the hub is about 26 m.
- Return sling beside the start pad. Lost moon 1 on a shelf on the far side.
- Sight lines: the planet's banded wall on your inside the whole lap; the black hole across the void to the east; the hub below and behind.

### Cinder (rock rain)

- Centre (54, 3, -6), radius 11, top y 3, about 100 hex tiles; each tile is its own circle collider (r 1.1, h 3) held in `extraColliders()` so tiles can drop and return. Neighbouring circles overlap 0.12 m; the tiny holes at the junctions are smaller than the player's foot circle, so you only fall through a removed tile when you walk into its middle 0.7 m.
- Central spire: r 1 collider to 4.8 m with a ledge ring at 2.4 m (route to lost moon 3). It doubles as cover-free decor: meteors never target within 2 m of it.
- Landing pad and start pad on the west edge (44.5, 3, -4.5). Return sling beside it.
- Camera in rounds: yaw locked looking east across the island from behind the start pad, pitch 0.75, distance 11 m, so the whole arena is visible and arrows map to the screen.

### Comet dock (comet surf)

- Crescent island centre (36, 8, 36), radius 7, top y 8; gravity 0.25 here. A comet moored on the east side at (43, 9, 36). Hidden bounce blossom on the back to a 3 m ledge (lost moon 6).
- Comet path: a closed Catmull-Rom spline of about 16 control points and about 850 m: east to (70, 20, 10), over Cinder (54, 25, -20), skimming the outer disk (44, 18, -46) and behind the hole (24, 22, -95), west through the streak field (-10, 30, -95), down through the 6 m void between the planet and its ring at y 6 (about (-19, 6, -50)), under the ring plane (-38, -4, -78), up and low over the hub (0, 18, 0), and home. Speed 12 to 14 m/s (about 65 s). The tube is 5 m in open space and narrows to 1.5 m through the ring gap (the comet slows and the camera pulls in: the ride's big moment). The steering clamp keeps at least 2 m between the tube's edge and any visible solid.

### The Horizon stair (finale)

- Ten stones (r 1.6 to 2.4, centres 5 to 6.4 m apart, so edge gaps of 1 to 2.4 m) from (-4, 1.2, -16.5) curving west then east: (-8, 2.4, -21), (-9, 3.6, -26), (-8, 4.8, -32), (-6, 6, -38), (-3, 7.2, -43), (1, 8.4, -47), (4, 9.6, -51), (7, 10.8, -55), to the lip (10, 12, -59), 14 m from the hole's centre. At least 4 m clear of Ringworld's outer edge. Each stone is a circle collider with its top at the listed height; a blossom on each aims at the next. The first stone sits 1.4 m outside the rail, reached by the Horizon blossom.
- Lost moon 8 on a side stone off stone 6.

### Physics feasibility: what is real and what is faked

- **Real:** walking on floating flat tops at different heights, jumping between them, falling off them, standing on the ring around a planet, tiles dropping out from under you, gates you pass through (2D segment crossing plus a height check).
- **Faked:** every floating island is physically a pillar from y 0 to its top. Nobody ever sees this, because you are caught by the star net before you get near y 0 (the rescue triggers 2.5 m below the top you left), and nothing walkable is ever placed under another walkable thing. The void "floor" at y 0 outside the hub is never reached. Flights, blossoms, comet lanes and the comet ride are scripted paths, not physics.
- **Not attempted:** walking around a sphere. The ring is the honest version of that fantasy; the planet itself is scenery you run beside. Moving platforms you can stand on are also out (the engine does not carry a player on a moving top); things that move are hazards, scenery or rides. A slow vertical bob of 0.2 m on decorative stones is fine (the ground snap follows).

---

## 7. Technical plan

### What is kept

The portal warp, nebula, disk, photon ring, lens and final passes, iridescent tiles and PMREM, streaks, motes, the drone, the orb kick and pull simulation, the frenzy board key and `recordFrenzy`, `debugInfo` and `galaxytest.ts`. Bugs to fix on the way:
- During the arrival warp the bloom mask darkens an unwarped disc at the hole's position (a crisp black circle over the swirl: `shots/01-arrival-warp.png`). Apply the same warp to the mask lookup.
- The fence's base glow draws stripes across the horizon (`shots/03-turn-1.png`). Base alpha to 0 away from the player.
- Orbs on low are flat white discs (`shots/05-low-tier.png`). Fresnel orb shader.
- Orb spawning uses `Math.random`, so frenzy rounds are not comparable. Fixed seeded schedule.
- `frenzySeconds` is module state that leaks between visits. Move it onto the instance.
- Kicking is impossible on a TV remote. Add the "Kick the orb" action on Interact.

### Files

Move the world into its own folder, `src/experiences/galaxy/`:

| File | Contents |
| --- | --- |
| `index.ts` | `Galaxy implements SpaceView`: zones, the state machine (free, tutorial, round, flight, cinematic), hooks, `debugInfo` and debug methods |
| `galaxy.css` | HUD styles (objective chip, star counter, edge arrow, mode readouts), imported from `index.ts` |
| `shaders.ts` | Today's `galaxy-shaders.ts` plus: fresnel orb, fake iridescence chunk, warp tunnel, spiral galaxy mode for the nebula, constellation lines, bubble, meteor beam, comet tail |
| `sky.ts` | Nebula (live or baked by tier), stars, streaks (flow can reverse), motes, constellations, the bloom sky, name in stars |
| `blackhole.ts` | Horizon, disk front and back, photon ring, jets, growth animation, the lens and mask uniforms |
| `islands.ts` | Island builders (hex disc, ring walkway, basalt, ice crescent, stones), undersides, rims, their colliders |
| `traverse.ts` | Star slings, bounce blossoms, comet lanes, the star net; produces `carry` poses from the pure arc maths in shared code |
| `spark.ts` | The guide sprite and its target logic |
| `modes/frenzy.ts`, `modes/ring.ts`, `modes/storm.ts`, `modes/comet.ts`, `modes/finale.ts` | One file per challenge: setup, step, HUD, results |
| `progress.ts` | Local save (versioned), stars, moons, unlocks, cosmetics |
| `audio.ts` | Songs as data for the kit sequencer and the galaxy's own SFX |
| `src/shared/galaxy-rules.ts` | Pure and shared with the server: course geometry (gates, gaps, lanes), minimum split times, schedules (frenzy, storm, daily seed), comet path and mote list, star thresholds, unlock thresholds, arc maths, validators |

`game.ts` keeps one line changed: the import path.

### Engine additions (small, generic, optional hooks)

These are the only engine changes needed, all backwards compatible:

1. **`PlayerState` gains `y`, `vy` and `grounded`.** Today `step()` cannot tell a player standing on an island from one falling past it. Three fields in `playerState()`.
2. **`SpaceView.carry?(h, player, move): Carry | null`.** Called each step before walking. When it returns a pose, the game puts the player there and skips walking, jumping and gravity:
   ```ts
   interface Carry { x: number; y: number; z: number; yaw: number; pose: 'fly' | 'surf' | 'float' | 'tumble'; speed: number }
   ```
   `move` is the current move input (for comet steering). `speed` feeds `follow()` so the auto camera behaves. When it returns null again, normal physics resumes from that spot (landings end exactly on a top). About 30 lines in `frame()` and `follow()`.
3. **Avatar poses** `fly`, `surf`, `float` and `tumble` in `avatar.animate()` (next to the kart and scooter poses).
4. **`SpaceView.runScale?(): number`** so rounds can turn off run for fairness across devices (1 = no run bonus).
5. **`debug.state()` adds `camYaw`** so playtests can steer with real arrow keys.
6. From the kit camera module: a cinematic override (flyover, star glance, podium, finale) and a "framing" mode that locks yaw, pitch and distance (Rock rain) and a chase framing (comet). Movement stays camera relative to the locked yaw.

Not needed (considered and rejected): a lowered void floor (the star net catches you first), step-up for ramps (all tops are flat), arrival height (the hub is at y 0, so arrival, the exit and return spots work unchanged).

### SpaceView hooks used

| Hook | Use |
| --- | --- |
| `colliders` | Static: hub tiles' disc (as today the floor itself), rail, shrine, chart, exit, ring walkway boxes, planet, Cinder spire, dock, stones (stones added when the stair opens) |
| `extraColliders()` | Cinder tiles (they drop and return) |
| `actions(player)` | Sling pads ("Fly to Cinder"), start pads, the Star chart, the comet, "Step in", and a dynamic "Kick the orb" at the nearest orb in front within 1.9 m (this is the remote's kick) |
| `kickAction` | The existing F, X, Kick button kick |
| `step(h, player)` | All simulation at the fixed step: orbs, rounds, gates, meteors, shards, stardust, rescue triggers, unlock animations, Spark |
| `carry(h, player, move)` | Slings, blossoms, comet lanes, the star net, meteor tumbles, the comet ride, the finale fall |
| `gravity()` | 0.35, or 0.25 on the dock, or 0.35 to 0.5 on the stair by distance to the hole |
| `runScale()` | 1 during rounds |
| `holdsTime()` | True during rounds, flights and cinematics (the menu pauses them) |
| `setQuality(tier)` | Tier table below |
| `render()` | Kit post chain with the galaxy's lens, warp and mask passes inserted |
| `update(night, t, phase, focus)` | Visuals; the shadow camera follows `focus` |

### Simulation notes

- **Orbs:** keep today's model (ground slide, walk-into nudge, kick 13 m/s plus 4.2 up, pull `420 / dist` plus swirl). Instanced cores and halos (2 draw calls instead of 2 per orb). Schedule: `frenzySchedule()` returns `{ t, x, z, kind }[]`, seeded, fixed.
- **Arcs:** `slingArc(from, to)` is a cubic Bezier with apex `0.25 x distance + 6` m, duration `1.2 + distance / 30` s, eased in and out, ending exactly on the landing top. Unit tests sample it against every collider top to prove it never passes through a solid.
- **Star net:** trigger when not grounded and `y < lastTop - 2.5`, or grounded at y 0 outside the hub disc (belt and braces). 0.3 s bubble hold, then an arc to the zone's checkpoint (last gate, the start pad, or the last stone).
- **Gates:** segment crossing of the player's last two positions against the gate line, with `top <= y <= top + 3.2`.
- **Meteors:** schedule `{ beat, x, z, r }`; warning starts 1.5 s before; impact applies a 0.5 s tumble carry 3 m away from the centre if inside `r`; tile state machine: whole, cracked, gone (10 s), returning.
- **Comet:** arc-length parametrised spline; position = path point + frame offset from steering (smoothed, clamped to 5 m); motes collected within 1.2 m (3 m during a spin).
- **Determinism:** every round is a pure function of its schedule and the fixed step, so `debugSimulate(seconds)` can fast-forward like the kart track's.

### Performance budget per tier

The cost here is fill rate (full-screen shaders and additive layers), not triangles: the planned geometry is about 100k triangles including the avatar.

| | Low (phones on Auto fallback, TV) | Medium (phones, TV ceiling) | High (desktop) |
| --- | --- | --- | --- |
| Draw calls (hub view, worst view) | 70, 95 | 110, 140 | 140, 180 |
| Triangles | under 120k | under 250k | under 400k |
| Lights | Hemisphere + directional | + disk point light | + disk point light |
| Shadows | None (blob shadow) | 1024 map following the player, plus or minus 14 m | 2048 map, plus or minus 16 m |
| Sky | Nebula baked once into a 256 px cube render target at load; stars and streaks live | Live nebula, 4 octaves | Live nebula, 6 octaves |
| Disk | Baked polar canvas texture rotated by a uniform, no back disk | Live, 3 octaves, back disk | Live, 4 octaves, back disk |
| Particles | 400 motes, 40 streaks, kit budget low | 2000 motes, 120 streaks | 6000 motes, 220 streaks |
| Materials | Standard with fake iridescence | Standard with fake iridescence | Physical, iridescence, PMREM |
| Post | None (direct render); the warp is a fade | Bloom at half res, final pass (grade, vignette, light fringe, mask) | Bloom full res, lens pass, final pass |
| Distant islands | Undersides at the lowest detail, boards hidden beyond 40 m | Boards hidden beyond 60 m | All |

Targets measured by the playtest at each tier (as `galaxytest.ts` does now): low holds 30 fps on the TV and 60 fps on a mid phone, medium 50 fps on a mid phone, high 60 fps on a laptop. The engine's render scale adapts underneath.

### Z-fighting prevention

- Every decal on a top (sling and start pads, landing rings, meteor warnings, comet lanes, checkpoint pads) sits 0.02 to 0.04 m above the top with `polygonOffset` (factor -1, units -4) and `depthWrite: false`. Two decals never share a height (each type has its own offset).
- Hex seams stay 0.015 m above tile tops; tile tops keep today's per-tile height jitter so neighbours never share a plane.
- Island rims and edge tubes sit outside the top's footprint, never on it. Undersides start 0.05 m below the top.
- The ring walkway is one mesh (top, sides, bottom); gates stand on it with feet 0.03 m above.
- Additive layers (disk, back disk, photon ring, jets, streaks) get explicit `renderOrder` so sorting never flickers.
- A unit test walks the collider list and asserts no two walkable tops of different islands overlap in x and z (nothing walkable under anything walkable), and the screenshots are checked in motion (the playtest records a short sequence while flying).

### Server and score changes

- `src/shared/galaxy-rules.ts` (pure): schedules, maxima, minimum splits, thresholds, validators.
- If the kit's generic boards land first: register galaxy modes `frenzy` (keeping the key `galaxy:<room>:<area>`), `ring` (lower), `storm` (higher), `comet` (higher), `daily:<yyyymmdd>` (higher), `keepers`. Otherwise extend `server/scores.ts` with `recordGalaxy(mode, ...)`, keys `galaxy-ring:`, `galaxy-storm:`, `galaxy-comet:`, `galaxy-daily:<date>:` (expire after 3 days) and `galaxy-keepers:`, the zod union in `api/scores.ts`, `api.ts` and the `ScoreBoard` type (the galaxy board returns all its boards in one GET), and `clearScores` deletes them all.
- `keepers`: the server reads this browser's records on the four main boards and requires a one-star result on each before adding it (with `Date.now()`) to a sorted set, once.

### Testability

**`debugInfo()`** returns: tier, zone, carry state and pose, stars (per challenge), stars fed, hole radius, unlocks, moons, the active round (mode, state, time, score, shields, gates passed, split list), orbs, meteors and tiles summary, comet progress and motes, Spark's target, checkpoint, composer state.

**Debug methods** (through `experienceCall`): `debugGrant(stars)`, `debugShortRound(mode, seconds)`, `debugCourse('short')` (ring run with 3 gates and 1 gap), `debugWarp(zone)` (uses `carry` to place the player on an island top, since `teleport` puts you at y 0), `debugSimulate(seconds)`, `debugSkipIntro()`, `debugReset()`.

**Playtest** `scripts/galaxytest.ts`, extended, driving real input in four variants (all four lines go into `scripts/autobuild/playtests.txt`):
- Desktop: arrival, intro skip, tutorial with real F kicks, the first star by walking with arrow keys, sling with E (assert zone `ring`, y 6), a short ring run steered by a small controller loop on arrow keys using `camYaw` (assert every gate in order and a lap time posted), a fall from the walkway (assert the star net returns you to the last gate), a short frenzy that reaches the board, a short rock rain with real movement, a short comet ride steered with arrows, `debugGrant(12)` then the Horizon stair via blossoms and "Step in", the bloom, and the exit. Screenshots at each step and frame times per tier.
- `PHONE=1`: the same with taps on `.tbtn-action`, `.tbtn-kick`, `.tbtn-jump`, and stick drags through CDP touch events.
- `PAD=1`: an injected standard gamepad (as `neontest.ts`), stick and A, X, Y.
- `REMOTE=1`: only ArrowUp/Down/Left/Right, Enter and the TV Back key code (10009). Must earn the tutorial star, one ring run star, one rock rain star and one comet star, and leave through the menu, with no jump or kick events sent.

**Unit tests** `tests/galaxy.test.ts`: schedules are deterministic and their totals are under the board caps; split validation accepts a recorded legal run and rejects a too-fast segment and out-of-order splits; sling and blossom arcs end exactly on their targets and clear every solid; ring walkway colliders cover the annulus (grid sample: inside gives top 6, gaps and outside give 0); gate crossing maths; star net trigger; unlock thresholds; save migration (no save, v2, corrupt JSON); the frenzy "Kick the orb" action appears only with an orb in front within range; no walkable top overlaps another.

### Accessibility and settings

Reduce motion (read from `local.settings()`): no shake, no FOV kicks, no warp spin (a fade), slower and lower sling arcs, a steady chase camera, no roll on the comet spin. Hazards are shape plus colour (dashed rings, coral). Text follows the text-size setting. Audio cues always have a visual twin.

---

## 8. Scope

### Must-have for the first AAA-quality release (in order)

1. Engine additions 1 to 5 (player height, `carry`, poses, `runScale`, `camYaw`), with unit tests.
2. Folder move, the six bug fixes above, the fresnel orbs, the fake iridescence on low and medium, the low-tier baked sky and disk.
3. Hub rebuild (r 13, layout, slings, Star chart, Spark, objective HUD, edge arrow) and the local save.
4. The black hole growth system (radius, disk, pull, constellations, unlock reveals) and the star-into-hole moment.
5. Tutorial (wake it up) and the upgraded frenzy (fixed schedule, orb types, Interact kick, music riff).
6. Traversal: star slings, bounce blossoms, the star net.
7. Ringworld and the ring run (gates, gaps, comet lanes, splits, board with split validation).
8. Cinder and rock rain (tiles that drop, meteors on the beat, shards, shields, locked camera, board).
9. Comet dock and comet surf (chase camera, steering, ribbons that play the melody, spin, board).
10. The Horizon stair and the finale cinematic with the bloom sky.
11. Audio: the hub theme with layers, the four challenge songs, the signature SFX.
12. Kit integration: banners, countdown, results card, intro cards, camera, post.
13. Playtests for desktop, `PHONE=1`, `PAD=1`, `REMOTE=1`, unit tests, `docs/VERB_SHEET.md` rows and the `docs/ACCEPTANCE.md` entry.

### Nice-to-haves (in order)

1. Ring run ghost of your best.
2. Lost moons (all 8) and the two moon stars. (If cut, the finale stays at 12 of 13.)
3. Galaxy keepers wall.
4. Daily storm and its board.
5. Nova medals.
6. Cosmetic trails and the halo.
7. Your name in stars at the bloom.
8. Star garden island: a calm constellation puzzle (step on star pads in order to draw a constellation), 3 more stars, at (-40, 10, 28).
9. A tiny-planet visual trick on moonlets (a curvature vertex shader) for scenery only.

---

## 9. Risks and open questions

- **The `carry` hook is the keystone.** Slings, blossoms, lanes, the star net, tumbles, the comet ride and the finale all depend on it. It is small, but it touches `game.ts`'s frame loop, `follow()` and the avatar. It should be agreed with the engine lead before anything else.
- **The kit is still being built.** Galaxy needs custom passes (lens, warp, hole mask) inside the kit's post chain, a camera framing lock, and the sequencer's beat clock for the rock rain schedule. If the kit post cannot take custom passes, the galaxy keeps its own composer (as today) and uses only the kit's bloom settings.
- **TV GPU.** Full-screen fbm is too heavy for the S90H at 1080p, hence the baked sky and disk on low. This needs a real-device check; the fallback is dropping the motes and streaks further.
- **Board fairness across devices.** Run is off in rounds, but jumps (not on the remote) still save about 3.4 s in a ring run. The remote player gets every star, not every board position. Is that acceptable to the creator? The alternative is a separate "no jump" board, which I do not recommend (it splits a small player base).
- **Validation limits.** The higher-is-better boards can only be capped, not proven (no replays). The caps come from the fixed schedules, which keeps the worst cheat to a perfect score. The ring run splits make fake times hard. Is that enough for a kids' site? I think yes.
- **Motion comfort.** Long sling arcs and the warp could bother some players. Reduce motion covers it; the default arcs keep the horizon level and the camera behind.
- **Scale of the world vs the far plane.** Everything sits within about 100 m of the hub; the comet path reaches about 95 m north. The 400 m far plane is fine, but distant islands at low tier need the LOD steps in the budget table.
- **Scope.** This is about four times today's galaxy. The must-have order front-loads the parts that change the feel most (growth, slings, Ringworld) so a cut after item 7 still ships a real world.
- **Open: should progress be shared per room?** Today it is per device (personal journey), which fits "visits are solo". A shared "the galaxy has been fed N stars by everyone" counter would be lovely but must never look live; I left it out.
- **Open: should the existing frenzy board be reset** when the schedule changes? Old scores came from a random spawner. I suggest keeping them (same 1 point per plain orb) and letting the creator clear it with the existing admin tool if it looks off.
- **Open: the guide's name.** "Spark" is generic and safe; the creator may want estevan to name it.

## Decisions after review

Your engine asks are all in the kit now (check the signatures in src/world/space.ts and src/experiences/common.ts):
1. `PlayerState` has `y`, `vy` and `grounded`.
2. `carry(h, player, move)` returns `{ x, y, z, yaw, pose?, speed? }` or null. `move` has the raw stick x and y plus the camera-relative world direction wx and wz. While you carry, the game skips walking, jumping and gravity; when you return null, normal physics resumes from that spot.
3. Avatar poses fly, surf, float and tumble exist, plus dance, cheer, crouch and aim, and `ctx.swing`, `ctx.squash` and `ctx.hold`.
4. `runScale()` exists.
5. `debug.state()` returns `camYaw` and `carried`.
6. Camera framing uses `cameraShot(dt)`:
   - Return a shot without `lockPlayer` for fixed, rock-rain style framing or chase framing. Walking is then relative to the shot's view.
   - Use `lockPlayer` with `skip` for flyovers and the finale.
   - Use `ctx.teleport(x, z, yaw, y?)` and `ctx.impulse` if you need them.

Decision on fairness: no device may get a board advantage, so a TV remote that cannot jump must be able to set the same times. In boarded rounds, either jumping must not save time on any route, or jump does nothing useful (repurpose it with `jumpAction`). Jumping stays free everywhere else, for fun and secrets.

Keep everything the creator asked for before: the trippy, high-quality art with graphics tiers, and low gravity where jumps float. Keep the existing frenzy board's data. Fix the bugs you found in the current build. Scope: work through your must-have list in order, fully polished.
