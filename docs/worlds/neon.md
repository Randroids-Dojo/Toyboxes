# Club Nova: design doc for the neon space party (kind `neon`)

> The design written before the build. The review decisions at the end override it where they differ. What shipped is recorded in `docs/ACCEPTANCE.md`. Paths under `/tmp/toyboxes-worlds/` were scratch files and no longer exist.

Room 11, owner Chels. Area id stays `neon-party`, kind stays `neon`. Source page: "Neon space themed. Laser tag. Light sabers. Disco glow party dance competition." Drawing: a purple starburst of rays shooting out from the centre (`room11-page1.png`).

The current build (`src/experiences/neon.ts`, 150 lines: four floating drones, a facing check, a four-tile "press on NOW" dance) is replaced completely. This doc assumes the shared kit (particles, post, hud, music, camera, scores) lands as described in the brief, and asks the engine for four small hooks (section 7.1).

---

## 1. Vision

### 1.1 Pitch

**Club Nova** is the brightest party in space, and tonight Chels is hosting. Tag the robot crew in glow-in-the-dark laser tag, out-duel the Prism Five with your own prism blade, then take the spotlight in a disco dance off judged by three very serious robots. Everything in the station moves to the music, so the better your timing, the brighter you glow.

One sentence for the creator: **a Hi-Fi Rush style rhythm-action party night with three real games (a laser tag shooter with robot teams, a one-button blade duel, a one-button dance rhythm game), stitched together by a DJ robot, playable start to finish with just the arrows and OK.**

### 1.2 The fantasy

You are the new guest at the coolest club in the galaxy. The robots are your party friends and rivals, never enemies. You arrive, the music hits, the floor lights up under your feet, and the DJ waves you over. By the end of the night you are on the podium in a suit that glows a little brighter than when you came in.

### 1.3 Names

| Thing | Name | Why |
| --- | --- | --- |
| The world | Club Nova | Short, readable, original. In-world marquee: "Chels presents Club Nova" (owner name from content). |
| The drawing | The Nova Core (hanging sculpture) and the Nova floor (16-ray dance floor) | The starburst becomes the centrepiece twice, plus the sky. |
| Laser tag arena | Comet Yard | |
| Blade platform | Blade Ring | |
| Lounge | Glow Lab | Wardrobe, boards, sync booth. |
| Energy blades | **prism blades** | Original, and "prism" fits the core trick: blades bend light, so they deflect laser bolts. Never "lightsaber". |
| Main mode | Party night | Three events back to back, then a podium. |
| Host | Orbit, the DJ robot | Vinyl record face that spins on the beat. |

### 1.4 Pillars

1. **On the beat.** One audio-clock beat drives everything: the Nova Core pulses, the floor bursts, the crowd bobs, bots telegraph on the beat, and your laser shots are stronger when fired on the beat. Rhythm is the thread through all three games.
2. **One button, deep play.** OK is enough for every rhythm mechanic and for laser tag (with arrows to move). Mastery is timing, reading and positioning, not button count.
3. **A party, not a test.** No game over screens. Getting tagged out means glowing back in at base. Losing a duel ends with a bow. Every night ends on a podium, and finishing always earns a star.
4. **Glow is feedback.** Every input lights something: the floor under your feet, your suit trims, the Core, the crowd.

### 1.5 Art direction

**Look in one line:** dark glossy space club, clean edge lights on black, chunky toy robots, bold candy neons, bloom on high tiers. References: Tron Legacy (edge lights on dark surfaces, restraint), Beat Saber (neon blades, sweeping lasers synced to the music), Splatoon (energy, chunky readable shapes, bold team colours), Just Dance (dancer-centric framing, colour pops behind silhouettes), Hi-Fi Rush (the whole world animates on the beat, comic-style hit flashes).

**Palette**

| Role | Hex | Use |
| --- | --- | --- |
| Void | `#0A0620` | Sky base, deepest shadows |
| Deck | `#120B33` | Floors (glossy) |
| Walls | `#1B1147` | Walls, cover blocks |
| Panel | `#2A1A66` | Raised panels, robot bodies (dark) |
| Nova violet (sampled from the drawing) | `#8668CF` | Hero colour: Nova Core, floor rays, UI borders |
| Light violet | `#B49CFF` | Core glow, highlights |
| UV | `#6B3BFF` | Sky rays, deep glow |
| Hot pink | `#FF3DAE` | Magenta team, Strike phase, rival |
| Cyan | `#2DE8FF` | Cyan team (yours), Guard phase |
| Lime | `#A8FF3E` | Beat shot, Perfect sparkles |
| Gold | `#FFC93C` | Stars, medals, bank shots, judges' cards |
| Orange | `#FF8A3D` | Brick, warnings |
| White-hot | `#FFF4FE` | Bolt cores, Perfect flashes, text |
| UI panel | `#140C34` at 92% | HUD panels, with a 2 px `#8668CF` border |

Teams are cyan versus magenta, never red versus green, and each team also has a shape: cyan bots have round dome heads and a circle badge, magenta bots have wedge heads with twin fins and a triangle badge. Note types on the beat bar differ by shape as well as colour.

**Lighting.** Low ambient (hemisphere `#4A36A8` over `#0A0620`, intensity 0.7), one directional "core light" `#E6DAFF` straight down from the Nova Core (casts shadows from dynamic things only, on medium and high), and one point light inside the Core on medium and high. Everything else that glows is emissive material plus bloom. On low (no bloom) glow is faked with additive halo quads behind neon strips (one instanced mesh). Moving colour comes from cheap rotating "gobo" light pools (additive floor decals, the kit's `lightPoolTexture` idea) rather than real spot lights.

Town day and night still matter a little: by day the station runs a "matinee" (ambient +30%, fewer lasers, readable for younger kids); at night it runs the "late show" (darker, sweeping lasers on medium and high). Readability is checked in both.

**Materials.**
- Floors: glossy dark standard material (roughness 0.25, metalness 0.35) with a PMREM env map of the procedural sky on medium and high. The Nova floor and the arena floor are custom shaders (rays, grid, beat ripples, footprints).
- Robots: soft plastic (roughness 0.45) in dark panel colours with emissive bands in their team or personal colour, and LED faces from a canvas atlas (happy, focused, surprised, dizzy, cheering, bow).
- Mirrors (arena): chrome (metalness 1, roughness 0.08) with env map; on low, a bright gradient canvas fakes the sheen. Hex-cell edge lights make them unmistakable.
- Glass: transparent 0.22, depthWrite off, edge lines additive.
- Neon tubes and blades: basic material with colour multiplied above 1 so only they bloom.

**Silhouettes.** The player is the chunky toy figure plus glow trims. Bots are the same height as the player (about 1.5 m) so shots at 1.1 m read honestly; captain Volt is 2 m with broad shoulders. Each duelist has a unique outline (gear head, star head, box, ribbons, crest and cape). Judges are instantly readable: Tempo has a metronome head with a swinging pendulum, Groove wears giant headphones, Sparkle has a disco ball head. Crowd robots are simple beans in many colours.

**The drawing, used three ways.**
1. The **Nova Core**: a violet sphere with about 48 crystal spikes of irregular length and width, biased sideways like the drawing's rays, plus additive ray streaks behind it. It hangs at 7.5 m over the dance floor and pulses on every beat.
2. The **Nova floor**: a 6.5 m radius disc with 16 rays etched as light lanes. On every beat a ring of light bursts outward along the rays; your footsteps light ray segments; dance notes travel inward along them.
3. The **sky**: a nebula shader with a giant violet starburst behind the station, so the whole backdrop is the drawing at planet scale.

**Mood.** The best birthday party in space: loud colour, kind robots, a little silly, never scary.

### 1.6 Audio direction

**Music.** Original synthwave, nu-disco and French-house-flavoured songs, written as data for the kit's procedural sequencer: four-on-the-floor kick, offbeat open hats, octave disco bass, gated clap, saw pads with filter sweeps, pulse arpeggios and a formant "ooh" lead. Sidechain pumping on pads and bass, risers into drops, a low-pass "through the wall" filter for zones, and a tape-stop flourish when a song is paused.

| Song | BPM | Style | Used in |
| --- | --- | --- | --- |
| Hello Nova | 100 | Lounge disco, filtered | Roaming, sync check, menus |
| Nova Lights | 110 | Disco funk | Dance (Rookie), duel vs Sprocket |
| Comet Chase | 124 | Driving synthwave | Laser tag |
| Glitter Gravity | 118 | Bubbly nu-disco | Dance, duel vs Twinkle |
| Neon Heart | 128 | Synthpop with a half-time bridge | Dance, duel vs Brick (half-time) and Mirage (swung remix) |
| Supernova | 132 to 140 | House into eurobeat, one tempo change | Dance finale, duel vs Nova Knight |

Dance cuts run 90 to 120 seconds (Rookie cut about 80). Structure: intro 4 bars (count-in), verse 8 to 16, build 8, drop 16, break 4 to 8 (freestyle spotlight), drop 16, outro 4.

**Signature sounds** (all synthesised, all with a visual twin):
- **Nova pulse:** soft sub thump plus shimmer on bar 1 of every phrase, with the Core flare.
- **Blaster:** a short "pew" pitched to a chord tone of the current song, so firing on the beat makes music. Beat shots add a bright harmonic and sparkle.
- **Tag:** rising two-note "bling-bloop". **Tagged out (you):** a gentle descending power-down wobble, never harsh.
- **Bank shot:** metallic glide "ping". **Reflect:** "tchang" plus whoosh.
- **Prism blade:** filtered saw hum that rises with swing speed. **Parry:** "shing" harmonised to the chord; Perfect adds a high bell.
- **Feint read:** reverse whoosh then a sparkle. **Crush bind:** grinding hum rising in pitch until the push.
- **Dance hit sound:** a soft clap or shaker on every hit (setting, default on), which helps kids feel the grid.
- **Crowd:** filtered noise swell plus bleepy robot cheer arpeggio. **Judges' cards:** "thwip" flip plus a bell per point counted.

---

## 2. Core loop and feel

### 2.1 Loops

- **Moment to moment:** hear the beat, read the cue (a bot's visor flash, a duelist's wind-up, a note gem), press OK on time, get a glow burst and points.
- **Session (5 to 10 minutes):** a party night (laser tag, blade duel, dance off, podium) or a few free play rounds of one game.
- **Long term:** five nights of rising difficulty, stars on every chart, duelist and tag difficulty, unlockable suits, blade colours and victory poses, personal bests, shared boards.

### 2.2 The beat clock (shared by everything)

One `BeatClock` maps performance time to song time as heard (section 7.4). It feeds the world animation, the beat bar, the duel cues, bot telegraphs and beat shots. When the music is muted or audio is unavailable the clock still runs (virtual clock), and every cue keeps its visual twin, so silent play works.

### 2.3 Laser tag (Comet Yard)

**Format.** Team tag: you plus robot allies (cyan) against a robot crew (magenta). 2v2 on Rookie, 3v3 normally, 4v4 on Supernova. Matches last 90 or 120 seconds. Each tag scores a team point; most points at the horn wins. A tie goes to "sudden glow": next tag wins.

**Suits.** Everyone has 3 glow pips. A bolt hit removes one. At zero you are tagged out: suit lights fade, and after 3 seconds you glow back in at your base with 1.5 seconds of shimmer (cannot be hit). Pips regenerate one per 2.5 seconds after 3 seconds without a hit; standing on your base pad refills fast.

**Aim without a second stick.** OK fires at the **locked target**. The lock picks the best enemy in line of sight within 24 m and inside a 40 degree half-cone around your facing, or a 25 degree half-cone around the camera's centre (whichever fits better), preferring near and central targets. The lock is sticky: it holds until the target leaves 75 degrees, loses line of sight, or is tagged out. A bracket reticle on the target shows exactly what OK will hit. With no lock, OK fires straight ahead along your facing.

**Lock-on camera** (default on for remote and touch, soft for mouse users): while locked, the camera eases round to frame you and the target. Because walking is camera-relative, up then means toward the target and left or right circles around it, like classic adventure-game targeting. This gives TV remote players real strafing with just arrows and OK.

**Bolts.** Your bolts fly at 34 m/s and home gently (up to 120 degrees per second) toward the lock, so moving targets are fair but cover still blocks. Bot bolts fly at 13 to 19 m/s with no homing, so they can be dodged by moving.

**Heat and beat shots.** You can fire every 0.3 s. Six quick off-beat shots overheat the blaster for 1.4 s. A shot fired within 90 ms of a beat is a **beat shot**: it adds no heat, flies brighter, and scores +50 on a tag. Firing on every beat is sustainable forever, so the game quietly teaches rhythm. A beat dot under the reticle pulses on the beat.

**Ricochets.** Four to eight **mirror panels** stand in the arena. Bolts bounce off them once (twice with the Echo power-up). When an enemy has no direct line of sight but a one-bounce path exists in your cone, the lock shows a dotted bank line with a bounce glyph; OK fires the bank shot (+100 bonus on a tag). Glint and captain Volt use bank shots too, so mirrors cut both ways.

**Deflect.** Your prism blade is always on your hip. If an enemy bolt will reach you within 0.22 s, OK swings the blade instead of firing and sends the bolt back at its shooter (a reflect, +150 on a tag). A "!" ring flashes around you when a deflect is possible. Kick (F, X, the Blade touch button) is a dedicated blade swing for players who have it, but the remote gets the same move contextually through OK. Deflects on the beat glow brighter.

**Power-ups** spawn on two pads every 30 s with a beam from the ceiling: **Prism shield** (blocks the next 3 bolts) and **Overdrive** (8 seconds of no heat). Echo (bolts bounce twice) arrives on Headliner night.

**Readability for players who cannot turn the camera:** edge arrows on the screen pulse toward any bot telegraphing a shot at you; allies mark enemies they can see with a "!" ping; a small radar (top right) shows enemies your team can currently see. Bots telegraph every shot: visor flash plus a thin aim line flicker (aim lines only on Easy) for 0.32 to 0.55 s.

**Robot AI** (detail in section 3.5 and 7.6): perception with field of view, line of sight and memory; utility-scored behaviours (engage, strafe, take cover, recharge, flank, grab power-up, support); grid A* navigation with path smoothing; an aim model with reaction time, lead and error; and an **attack token** system so only one or two bots shoot at you at once. Allies are deliberately a little weaker than enemies and prefer to mark targets and draw fire, so you stay the hero.

**Optional extras.** Jump hops over bolts (bolts fly at 1.1 m; a well-timed hop clears them). Kick swings the blade. Neither is ever required.

### 2.4 Prism blade duels (Blade Ring)

A one-button fighting rhythm game, closest to Punch-Out meets Rhythm Heaven. You face a robot duelist in a side-on camera. The duelist's song plays and the bout alternates two-bar phrases:

**Guard phrases (it attacks, you parry).** The duelist winds up one beat before each strike: a ghost arc shows the blade path and an approach ring shrinks onto the clash point by your blade. Press OK as the ring closes.
- **Strike:** one press.
- **Flurry:** two to four strikes on eighth notes, one press each.
- **Crush:** a long glowing wind-up. Press as it lands and keep holding through the bind (the blades lock, sparks stream, a meter fills), then let go on the "Push" cue to shove the duelist back.
- **Feint:** the wind-up flickers and pulls back (distinct shimmer and a reverse whoosh). Do not press. Reading it scores "Read it!"; pressing is a "Whiff" (combo resets, no damage).

**Strike phrases (you attack).** Glowing crest targets pop on the duelist's body with approach rings. Press as each ring closes to land a tag; the duelist's glow bar drops. From Mirage onward, some strike phrases are **call and response**: the duelist taps out a rhythm on its own guard in one bar (you hear and see it), then you play it back in the next. On Hard ("Echo" difficulty) the rings in response bars are hidden, so you play from memory.

**Winning.** You have 5 glow pips; a missed strike or a dropped crush costs one. The duelist needs a set number of tags (Sprocket 10, Nova Knight 24); each chart has about 30% more openings than needed. Land them all before the song ends for a KO (bonus); otherwise the higher remaining glow share wins at the end. Run out of pips and the bout ends with a bow: "Good bout!".

Your avatar's parry and strike directions (high, low, left, right, thrust) are chosen automatically from the duelist's attack, so OK alone produces a real-looking sword fight. Any button counts as a press (OK, Space, E, F, J, K, A, X, Y, bumpers, triggers, a tap anywhere), so fast flurries can be split across two thumbs or two keys.

**First phrase practice loop.** The first guard phrase of a duelist's first bout repeats (drums keep going) until you parry two in a row, up to three loops, then the song proceeds.

### 2.5 Dance off (Nova floor)

A proper one-button rhythm game on the drawing's starburst floor. You stand at the centre ring, a rival robot dances beside you, three judges watch from their desk, and a ring of robot crowd dances on the balconies.

**Reading notes.** A **beat bar** across the lower third of the screen (a canvas lane in the HUD) carries note gems from right to left into a glowing gate. This is the proven, couch-readable format (think Taiko). The same notes also run in-world as light pulses down the floor rays into your feet, for spectacle and for advanced players who switch the bar off.

**Note types (all one button).**
- **Tap** (round gem): press. Gem colour shows subdivision: quarter pink, eighth cyan, sixteenth gold, so syncopation is readable at a glance.
- **Double** (two linked gems): two quick presses.
- **Hold** (gem with a glowing tail): press, keep holding, let go when the tail ends. Your avatar spins or slides while you hold.
- **Pose** (big star gem, ends a phrase): worth double, triggers a pose with a camera flash.
- **Spotlight** (freestyle bars, shimmering lane): no notes. Any press that lands on the eighth-note grid triggers a move and scores Flair; off-grid presses are "sloppy" and cost Flair, so mashing loses. Arrows, stick or a swipe pick which move (optional style); OK alone cycles moves.

**Timing windows** (on the calibrated clock): Perfect within 45 ms, Great within 90 ms, Good within 135 ms, otherwise Miss. Easy charts widen windows by 20%. Each judgment shows a small early or late tick so players see their tendency. Stray presses with no note nearby are ignored outside spotlight bars: no penalty for nerves.

**Combo and Glow time.** Consecutive non-misses build a combo; the multiplier steps to 2x at 10, 3x at 30, 4x at 60. Perfects fill a **Glow meter**; when full, the next phrase starts **Glow time** automatically for 4 bars: double points, rainbow floor, sweeping lasers, glitter rain, an extra lead layer in the music, the crowd jumping. Automatic triggering keeps it one-button.

**Rival meter.** A tug-of-war bar at the top shows you against the rival (whose performance is scripted from a seeded skill profile). It is drama; the judges decide.

**Judges.** Three robots react live (nods on streaks, a shrug on misses) and flip cards at the end:
- **Tempo** (timing): 10 x accuracy squared, where accuracy weights Perfect 1, Great 0.67, Good 0.33.
- **Groove** (consistency): 10 x (max combo / notes) to the power 0.7.
- **Sparkle** (flair): 10 x (0.5 x Perfect share + 0.3 x spotlight on-grid share + 0.2 x holds kept share).

Each card rounds to the nearest half point; total out of 30.

**No fail.** You cannot fail a song. Misses dim the floor around you and lower the cards, nothing more.

**Free dancing.** Outside a dance off, pressing OK while standing on the Nova floor does a dance move on the next beat with a floor burst and a crowd cheer. It teaches "on the beat" before any game starts.

### 2.6 Party night

Start a night at the glowing **star pad** in front of the dance floor. Orbit scratches the record, the lights cut for one beat, and a title card shows tonight's three events. A warp beam from the Core carries you to each venue in turn:

1. **Laser tag** (Comet Yard), then a results card.
2. **Blade duel** (Blade Ring), then a results card.
3. **Dance off** (Nova floor), then the **night podium**: judges' cards, stars flying into your total, an unlock reveal, the night score and your board rank.

Each event can be retried once inside the night ("Try again" on its results card); the retry's result counts. Leaving mid-night saves your place for 60 minutes ("Resume party night" on the star pad). Free play terminals at each venue run any unlocked game on its own.

### 2.7 Controls by input path

The rule: everything in the core game works with move plus OK. Rhythm games accept OK alone. Kick and Jump are only ever extras.

| Context | Keyboard and mouse | Touch | Controller | TV remote |
| --- | --- | --- | --- | --- |
| Walk | WASD or arrows, Shift to run | Floating stick | Left stick or d-pad, L3 to run | Arrows |
| Look | Mouse drag, J and L | Drag on the right side | Right stick | None (auto camera) |
| Use (terminals, star pad, wardrobe, exit) | E or Enter | Action button (named) | A | OK |
| Free dance on the Nova floor | E or Enter | Action ("Dance") | A | OK |
| Laser tag: fire (or deflect when the "!" ring shows) | E, Enter or left click (dragging still turns the camera) | Action ("Tag") | A or RT | OK |
| Laser tag: blade swing (optional) | F | Kick button ("Blade") | X | Not needed: OK deflects |
| Laser tag: hop (optional) | Space | Jump button | Y | Not needed |
| Duel and dance: hit, hold | Space, Enter, E, F, J, K or D (any; two keys for streams) | Tap or hold anywhere on screen (any finger) | A, X, Y, LB, RB, LT, RT or d-pad (any) | OK |
| Spotlight move choice (optional) | Arrows or WASD with a press | Swipe | Stick or d-pad with a press | Arrows with OK |
| Pause | Esc or P | Menu button | Start | Back |
| Menus, song select, wardrobe | Arrows, Enter, Esc | Tap | D-pad, A, B | Arrows, OK, Back |

During duels and dances the player is held in place (engine hook, section 7.1), so movement keys never walk you off the floor, the touch stick and buttons hide, and a full-screen tap zone takes over (menu button stays).

### 2.8 Feel targets

- Input to visible response: one frame for presses (the gate flash and avatar move start on the frame after the event).
- Judgment uses the input event's own timestamp, never the frame time, so a 30 fps TV judges as fairly as a 120 Hz monitor.
- Laser tag: reticle lock acquires in under 0.1 s; a bot tag takes about 1 s of focused fire; you survive about 6 s standing in the open against two Normal bots and much longer moving or in cover.
- Hit stop: 40 to 50 ms freeze of the struck robot's animation only (audio and clock never stop).
- Camera shake: small and short; none with Reduce motion.

---

## 3. Content and progression

### 3.1 Modes

| Mode | Where | Length | Free play difficulties |
| --- | --- | --- | --- |
| Party night | Star pad | 5 to 9 min | Nights 1 to 5 |
| Laser tag (team tag) | Comet Yard terminal | 90 to 120 s | Easy, Normal, Hard |
| Blade duel | Blade Ring terminal or a duelist's pedestal | 60 to 100 s | Normal, Echo (hard) |
| Dance off | Ask Orbit at the DJ booth | 80 to 120 s | Easy, Normal, Hard, plus Supernova on the finale song |
| Free dance | Anywhere on the Nova floor | Endless | |
| Sync check | Jukebox in the Glow Lab (and automatically the first time) | 20 s | |

### 3.2 Nights

| Night | Unlocks after | Laser tag | Duel | Dance off | Multiplier |
| --- | --- | --- | --- | --- | --- |
| 1 Rookie night | Start | 2v2 Easy, 90 s, Prism Yard layout | Sprocket | Nova Lights, Easy (Rookie cut), rival Twirl | 1.0 |
| 2 Rising star night | Night 1 finished | 3v3 Easy, 120 s | Twinkle | Glitter Gravity, Normal, rival Shimmer | 1.25 |
| 3 Headliner night | Night 2 finished | 3v3 Normal, Mirror maze layout, Echo power-up | Brick | Neon Heart, Normal, rival Boogie | 1.5 |
| 4 Superstar night | Night 3 finished | 3v3 Hard, Core ring layout | Mirage | Supernova, Normal, rival Strobe | 1.75 |
| 5 Supernova night | Night 4 finished | 4v4 Hard with captain Volt | Nova Knight | Supernova, Supernova difficulty, rival: Orbit himself | 2.0 |

Finishing a night unlocks the next one regardless of score (never hard-locked), plus that night's song and duelist in free play.

**Difficulty curve.** Each night adds exactly one new idea per game and raises one number:
- Laser tag goes 2v2 Easy, then 3v3 Easy, Normal and Hard, then 4v4 with a boss. Mirrors matter from night 3 (Glint banks at you), and the layouts change on nights 3 and 4.
- Duels go singles, then flurries, crushes, feints and swing, then call and response with a tempo change.
- Dance goes from quarter notes at 2 notes per second to sixteenth doubles and syncopation at 6.5.

Free play lets anyone drop back a level at any time, and Easy windows are 20% wider.

### 3.3 Charts and density

Charts are hand-authored as compact per-bar strings on a sixteenth grid (with a triplet bar form), in shared code. Density caps per difficulty (peak notes per second over any 2 s window): Easy 2.0, Normal 3.5, Hard 5.0, Supernova 6.5. Minimum gap between notes: Easy a quarter note, Normal an eighth, Hard and Supernova a sixteenth (never under 105 ms). Typical note counts for a 100 second song: Easy 110, Normal 200, Hard 300, Supernova 420. Every chart has at least one spotlight break and one Glow time opportunity. Must-have count: 4 dance songs x 3 difficulties + the Supernova chart = 13 charts, 5 duel scripts (each with a Normal and an Echo variant derived automatically by hiding response rings).

### 3.4 Duelists (the Prism Five)

| # | Name | Look | Song | New idea | Tags to win |
| --- | --- | --- | --- | --- | --- |
| 1 | Sprocket | Small gear-headed training bot, yellow blade | Nova Lights 110 | Single strikes on quarters, openings on quarters | 10 |
| 2 | Twinkle | Star-shaped head, twin pink blades | Glitter Gravity 118 | Flurries on eighths | 14 |
| 3 | Brick | Big boxy bot, orange great-blade | Neon Heart, half-time feel | Crush holds and the push | 16 |
| 4 | Mirage | Slim, violet light ribbons, afterimages | Neon Heart swung remix | Feints, swing rhythm, first call and response | 20 |
| 5 | Nova Knight | Tall, crested helmet, white-gold, cape of light | Supernova 132 to 140 | Everything, plus the tempo change mid-bout | 24 |

Duelists stand on pedestals around the Blade Ring; locked ones are dark silhouettes, which shows what is coming.

### 3.5 Robot teams

| Bot | Team | Role | Personality |
| --- | --- | --- | --- |
| Pip | Cyan | Support | Stays within 6 m of you, marks enemies, distracts |
| Dash | Cyan | Runner | Grabs power-ups, flanks the far lane |
| Sky | Cyan (4v4) | Anchor | Holds the middle near the Core |
| Zap | Magenta | Rusher | Closes distance, hops, short telegraphs |
| Bloop | Magenta | Cautious | Loves cover, peeks, retreats to recharge early |
| Glint | Magenta | Trick shot | Hunts bank shots off mirrors |
| Volt | Magenta (Supernova) | Captain | Front shield that drops while he fires; flank him or bank around it |

| Knob | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Reaction after first sight | 0.9 s | 0.6 s | 0.38 s |
| Aim error (standard deviation) | 10 deg | 6 deg | 3.5 deg |
| Lead on moving targets | 0 | 0.5 | 0.85 |
| Telegraph before each shot | 0.55 s | 0.42 s | 0.32 s |
| Fire cooldown | 1.6 s | 1.2 s | 0.95 s |
| Bolt speed | 13 m/s | 16 m/s | 19 m/s |
| Attack tokens on you | 1 | 2 | 2 (3 on Supernova) |
| Flank chance when blocked | 10% | 30% | 50% |
| Mirror use | None | Glint only | Glint and Volt |

A gentle helper: after two lost matches in a row, Orbit offers "Want easier bots?" (one OK).

### 3.6 Scoring, stars and medals

| Game | Points |
| --- | --- |
| Laser tag | Tag 100, bank shot +100, reflect +150, beat shot +50, assist 25, power-up 25, team win 1000, most tags 300 |
| Duel | Parry Perfect 300, Great 200, Good 100; feint read 150; crush kept 500; strike tags as parries; KO 2000; no pips lost 3000; combo multiplier as dance |
| Dance | Perfect 300, Great 200, Good 100; hold 50 per beat held; pose x2; combo multiplier 1 to 4x; Glow time x2 |
| Party night | (tag + duel + dance) x night multiplier |

**Stars.** Every challenge gives up to three stars (bronze, silver, gold); platinum is a crown with no star.

| Challenge | Bronze (1) | Silver (2) | Gold (3) | Platinum crown |
| --- | --- | --- | --- | --- |
| Night event: tag | Finish | Team wins | Win and reach par (Easy 1500, Normal 2200, Hard 3000) | |
| Night event: duel | Finish | Win | Win with 90% accuracy | |
| Night event: dance | Finish | Judges 21+ | Judges 26+ | |
| Free play dance chart | Judges 18+ | Judges 23+ | Judges 27+ | Judges 30 |
| Free play duel (per difficulty) | Win | 80% accuracy | 90% accuracy | Flawless (no pips lost, no whiffs) |
| Free play tag (per difficulty) | Win | Par | Par x 1.3 | Par x 1.6 |

Stars available at launch: nights 45, dance charts 39, duels 30, tag 9: **123 stars**.

### 3.7 Unlocks

Cosmetics only, all earned by stars, never bought.

| Stars | Unlock |
| --- | --- |
| 0 | Starter suit (glow trims in your shirt colour), cyan blade, Wave victory pose |
| 3 | Pink blade |
| 6 | Retro wave suit (pink and cyan stripes) |
| 9 | Disco point pose |
| 12 | Lime blade |
| 16 | Circuit suit (edge-light lines) |
| 20 | Gold blade |
| 25 | Mirror ball suit (sequin sparkle shader) |
| 30 | Space glide pose |
| 36 | Violet blade |
| 42 | Nebula suit (animated nebula trims) |
| 50 | Comet suit (light trail when running) |
| 60 | White-hot blade |
| 70 | Robot pal helmet |
| 85 | Prism blade (cycles the rainbow) |
| 100 | Supernova suit (gold and white, starburst back plate) |
| Every dance chart crowned | Nova crown |

Your suit trims show in every mode, your blade in duels and tag deflects, and your pose on every results card. Cosmetics live in this world only (never in the town).

### 3.8 Personal bests on this device

One versioned localStorage record (`toyboxes.nova.v1.<roomId>.<areaId>`): sync settings, stars and crowns per challenge, best score and best judgment log per chart (for a future ghost rival), unlocked and equipped cosmetics, nights finished, tutorials seen, an in-progress night. Corrupt or old records migrate or reset safely. Results cards compare against the local best ("New best!") even offline.

### 3.9 Shared boards (server validated)

| Board | Mode id | Order | Shown |
| --- | --- | --- | --- |
| Party nights | `night` | Higher | Glow Lab wall (left), night podium |
| Laser tag | `tag:easy`, `tag:normal`, `tag:hard` | Higher | Comet Yard terminal, Glow Lab wall (middle, cycles) |
| Duels | `duel:<duelist>:<normal or echo>` (10) | Higher | Blade Ring terminal, results card |
| Dance | `dance:<song>:<difficulty>` (13) | Higher | Song select, results card, Glow Lab wall (right, cycles) |

The server always computes the score itself from a compact play log using shared code (section 7.9). Boards show names only; nothing implies other players are present. Success appears only after the server confirms ("On the board: 4th"); otherwise "Couldn't reach the board. Your best is saved on this device."

### 3.10 The first five minutes

| Time | What happens |
| --- | --- |
| 0:00 | Warp in through the portal (tunnel streaks, portal pop). First visit only: a 4 second flyover (skippable with any button) sweeps from the Nova Core down the rays to you. Hello Nova plays; the floor pulses. |
| 0:05 | Intro card (kit, first visit): "Club Nova. Laser tag, prism blades and a dance off. Start a party night at the glowing star." OK closes it. |
| 0:10 | A bright ray on the floor leads from the dock to the star pad. Orbit waves from the booth: "New face! Party night?" Walking onto the Nova floor lights the rays under your feet. |
| 0:20 | Star pad: "Start party night". First time only, a **sound check** (20 s): Orbit claps eight beats, you press OK on each, then hold OK while a light fills. This sets your sync offset and tests that your device reports a held button. Reward: "You've got rhythm!". |
| 0:45 | Warp to the cyan base. A practice bot drifts into view: the reticle locks, "OK: tag!". Two tags later: 3, 2, 1, GO on the beat. Rookie 2v2, 90 s. |
| 2:25 | Results card, one to three stars. Warp to the Blade Ring. |
| 2:40 | Sprocket bows. The first guard phrase loops until you parry two in a row. A 60 s bout. |
| 3:50 | Warp to the Nova floor. Dance off on Nova Lights Easy: the first 4 bars are quarter notes with a "Tap on the gems" hint. |
| 5:10 | Podium: judges' cards flip, stars fly into the counter, the pink blade unlocks (3 stars) and, with 6 or more, the Retro wave suit; the night board rank appears. Free play terminals light up. |

### 3.11 The 30th visit

All five nights are done. You are chasing gold on Hard dance charts and the Supernova crown, an Echo flawless against Nova Knight (call and response from memory at 140 BPM), par x 1.6 in Hard laser tag with Glint banking shots at you, and a top 3 spot on the Party nights board. You have most suits; the Supernova suit (100 stars) is the visible long goal on the wardrobe. A typical session: one night for the board, two dance charts for stars, a quick Hard tag match. Nice-to-haves (daily remix night, ghost rival, Pro charts) are what keep the 50th visit fresh.

---

## 4. Onboarding

No walls of text. Every lesson is a moment in the world.

1. **Signposting by light.** Floor rays lead from the dock to the star pad and from the Nova floor to each venue, each venue's ray in its colour. Big neon signs with icons (blaster, blade, note) are visible from the atrium.
2. **Show first.** Through the Comet Yard glass you see bots playing an attract match. Two duelists spar on the beat in the Blade Ring. The crowd dances. Orbit DJs. Players see each game before trying it.
3. **The world teaches the beat.** Footsteps on the Nova floor play notes on the beat; free dancing with OK bursts the floor. By the time a rhythm game starts, the player has already pressed on the beat for fun.
4. **Device glyph prompts, once.** The engine prompt shows the right glyph (OK, E, A or a labelled touch button). The first time each mechanic appears, a short bubble names it: "OK: tag!", "Press as the ring closes", "Hold!", "Don't press the shimmer", "Tap on the gems". Each bubble is six words or fewer and never returns once learned (`seenHint`).
5. **Practice loops, not tutorials.** The first strike phrase, first crush and first dance bars loop gently (drums continue) until the player succeeds, at most three times, then the game continues regardless.
6. **Teach one new idea per night.** Night 2 adds flurries and doubles, night 3 crushes, holds and mirrors, night 4 feints and swing, night 5 call and response from memory and the tempo change.
7. **Early or late ticks** under the gate teach calibration without numbers. The sync booth exists for those who want them.

---

## 5. Juice list

Every row has a visual twin for its sound. Reduce motion removes shake, camera cuts and full-screen flashes; flashes never exceed 3 per second over large areas.

| Event | VFX | SFX | Camera | HUD |
| --- | --- | --- | --- | --- |
| Arrive | Warp streaks (post pass on medium and high), portal pop, rays light up in sequence | Portal whoosh, music fades in from low-pass | First visit flyover, else quick dolly | Place chip, intro card once |
| Every beat | Core pulse (scale 1.04, flare), ring burst along floor rays, crowd bob, arena trims chase | Music | None | Beat dot pulses |
| Bar 1 of a phrase | Brighter burst, Core spikes flash in sequence | Nova pulse sub thump | None | None |
| Step on the Nova floor | Ray segment under foot lights in suit colour, fades over a beat | Soft synth note quantised to the beat | None | None |
| Free dance (OK on the floor) | Avatar move, floor burst ring, crowd cheer pose | Clap on the beat, cheer | None | None |
| Approach a venue | Sign flickers on, venue ray brightens | Venue layer swells | None | Prompt with glyph |
| Open a terminal | Holo panel unfolds | Blip in key | None | Dialog |
| Equip in the wardrobe | Glow wipe up the suit trims, mirror sparkle | Rising chord | Turntable orbit of the avatar | Item name |
| Unlock | Item spins on a pedestal with a starburst flare behind it | Fanfare arpeggio | Push in | "Unlocked" banner |
| Countdown | Numbers land on beats, airlock doors open on GO | Beeps on beats, GO chord | Slight push on GO | Kit 3-2-1-GO |
| Lock acquired | Four reticle corners snap in | Tick | Lock-on framing eases in | Reticle |
| Bank path found | Dotted line with a bounce glyph | Soft ping | None | None |
| Fire | Muzzle flash sprite, bolt with trail | Pitched pew | None | Heat bar fills |
| Beat shot | White-cored bolt, lime sparkle ring | Pew plus bright harmonic | None | Beat dot flashes lime |
| Overheat | Blaster vents steam sprites | Hiss | None | Heat bar flashes orange |
| Bolt hits cover | Spark burst, brief light pool | Tick | None | None |
| Mirror bounce | Hex ripple flash on the mirror | Metallic ping | None | None |
| Tag a bot | Bot pip dims, stagger, 40 ms hit stop on the bot | Bling-bloop | 1% push | Hit marker, "+100" pop |
| Bot tagged out | Lights off, spin, pixel dissolve, warp beam home | Power-down | None | Team score bump, small "Tagged!" |
| Bank shot tag | Gold trail on the bolt path | Ping plus chime | Micro zoom | "Bank shot! +200" gold |
| Reflect | Blade arc, white flash, bolt reverses | Tchang plus whoosh | Tiny shake | "Reflect! +250" |
| Deflect available | "!" ring around you | Rising whee | None | None |
| Enemy telegraph | Visor flash, aim line on Easy | Charge note, panned | None | Edge arrow if off screen |
| You get hit | Pip pops off with sparks, edge vignette in the shooter's colour from their side | Soft bonk | Small shake | Pip lost |
| You are tagged out | Desaturate, suit lights fade, respawn ring at base | Gentle power-down, warp chime | Hold, then snap behind you | "Glowing back in 3" |
| Power-up spawn and pickup | Ceiling beam; aura on pickup | Chime; bleep chord | None | Icon with timer ring |
| Last 10 seconds | Timer turns gold | Riser, beeps on the last 3 beats | None | Kit timer bar pulses |
| Match won or lost | Confetti cannons in the winning colour, bots cheer or sulk kindly | Cheer or "aww" bleeps | Kit podium shot | Results card |
| Duel phase change | "Guard" (cyan) or "Strike" (pink) slides in on the bar line | Whoosh | Gentle sway | Banner |
| Wind-up | Ghost arc, approach ring closing on the clash point | Charge note on the beat before | None | Ring |
| Parry Perfect | Big white spark burst with a starburst flare at the clash, 50 ms hit stop on the duelist | Harmonised shing plus bell | 2% push | "Perfect", combo |
| Parry Great or Good | Smaller sparks | Quieter shing | None | "Great" or "Good" |
| Hit taken | Crest flash, pip pops, avatar recoils | Bonk | Small shake | Combo crack "x0" |
| Feint read or whiff | Duelist jerks back with sparkle; or your blade swishes at air with a wobble | Reverse whoosh plus sparkle; or swish | None | "Read it!" or grey "Whiff" |
| Crush bind | Blades lock, spark stream, meter fills around the clash | Grinding hum rising | Slow push in | Hold meter, "Push!" cue |
| Strike lands | Crest spark, duelist glow bar chunk with a trailing ghost bar | Tink-bling | None | Glow bar |
| KO or bout lost | Duelist kneels and bows, light burst; or your avatar bows and the duelist offers a hand | Glass chime cascade and cheer; or warm "good bout" chord | Kit cinematic orbit | "Bout won!" or "Good bout!" |
| Dance note Perfect | Gate flash white, starburst ring at your feet, floor rays burst in the note colour, crisp move | Clap | None | "Perfect", early or late tick |
| Dance note Great or Good | Smaller ring, softer burst | Clap | None | "Great" or "Good" |
| Dance miss | Gem shatters grey, avatar wobble, floor dims near you for a beat | Soft thud | None | "Miss", combo crack |
| Combo 10, 25, 50, 100 | Core flare, crowd cheer pose, judges nod | Crowd swell | Cut to a wider framing on 50 and 100 | Combo pop |
| Hold | Tail glows while held, sparkle stream, spin or slide move | Sustained shimmer | None | Tail fill |
| Glow time | Rainbow floor, laser sweeps, glitter rain, crowd jumps | Lead layer joins, riser | Crane shot (cuts only on phrase boundaries) | "Glow time! x2" |
| Spotlight bars | Spotlight narrows to you, crowd quiets | Drums thin out | Front medium framing | Lane shimmers "Free!" |
| Rival takes or loses the lead | Spotlight swings | Crowd "ooh" | None | Rival meter star moves |
| Judges' cards | Drum roll, cards flip one by one, numbers count up | Thwip plus bell per point | Pan across the judges | Card totals, medal reveal |
| New best | Gold confetti | Fanfare | None | "New best!" banner |
| Board confirmed | None | Chime | None | "On the board: 4th" toast |
| Night start | Lights cut for one beat, Core erupts, lineup title card | Record scratch, drop | Orbit close-up then wide | Lineup card |
| Night podium | Podium rises on the Nova floor, confetti, stars fly into the counter | Fanfare, cheer | Kit podium orbit | Night results card |
| Exit | Portal swirl | Whoosh | Fade | None |

---

## 6. World layout

Units are metres. x is east, z is south (yaw 0 faces +z, so north is -z). Origin is the centre of the Nova floor, under the Nova Core. All walkable surfaces are at y = 0 (the solver blocks low steps, so there are no raised walk-on floors). Overall footprint: x from -35 to 35, z from -51 to 26.

```
                     z=-51 +------------------------------------------+
                           |   MAGENTA BASE pad (0,-47.5)  screen     |
                           |   box      mirror        mirror     box  |
                           |        box        CORE        box        |
                           | box          (0,-35) r1.3          box   |   COMET YARD
                           |        box                    box        |   x -15..15
                           |   box      mirror        mirror     box  |   z -50..-20
                           |   CYAN BASE pad (0,-22.5)    screen      |   walls 2.8 high
                     z=-20 +-------------+  airlock  +-----------------+
                                         |  x +-3.5  |   tag terminal (2.6,-14)
                     z=-15     ..........+-----------+..........
                            .    "CLUB NOVA" sign (0,-12.2) y5.8      .
                          .        DJ booth (0,-10), Orbit             .
   BLADE RING            .                                              .          GLOW LAB
  +----------+  bridge  .            NOVA FLOOR r6.5                     .  bridge +---------------+
  | pedestals|==========|               (0,0)                             |========| wardrobe      |
  |  duel    | x-20..-15|         Nova Core above at y7.5                 | x15..20| boards (east) |
  | (-27,0)  |  z +-3    .                                    judges     .         | sync jukebox  |
  +----------+            .           star pad (0,8.5)       (6.8,6.2) .          | milkshake bar |
     r7                     .            ATRIUM r15                  .            +---------------+
                               ..........+-----------+..........                  x 20..34, z -8..8
                                         |   DOCK    |
                                         | arrival   |  (0,19.5) facing north
                                         | exit ring |  (0,25.2), door spot (0,24.4)
                     z=26                +-----------+
```

### 6.1 Zones and features

| Feature | Position | Size | Collider | Notes |
| --- | --- | --- | --- | --- |
| Arrival | (0, 19.5), yaw pi (facing north) | | | Frames the Nova floor, star pad, "Club Nova" sign and the arena light pillar on axis |
| Exit portal | Ring at (0, 25.2), centre y 2.0, radius 1.6, facing north | | Circle r 1.0 at the ring base | Door spot (0, 24.4), range 1.7. Label "Back to Chels's room". Visible from the whole Nova floor |
| Dock | x -5 to 5, z 14 to 26 | 10 x 12 | Rails at x = +-5.2, h 1.1, blocksCamera off; end rail behind the portal | |
| Atrium deck | Circle r 15 at origin | | Glass rail ring at r 15.2 (28 boxes, h 1.1, blocksCamera off) with gaps for the north (x +-3.5), south (x +-5), west and east (z +-3) spokes | Crowd balconies beyond the rail at r 16 to 20 in four quadrants (visual only, unreachable) |
| Nova floor | Disc r 6.5 at origin | | None | 16 rays; flat, separate mesh in a hole of the deck (no overlap) |
| Nova Core | (0, 7.5, 0) | Core r 1.6, spikes up to 4.5 m | None (lowest tip about 3 m up, above any jump) | Light shaft cone to the floor |
| Star pad | (0, 8.5) | r 1.2 | None | "Start party night" (range 1.8) |
| DJ booth | Arc centred (0, -10) | About 6 x 1.2, h 1.15 | 3 rotated boxes | Orbit behind at (0, -11.2). "Pick a song" at (0, -8.6) |
| "Club Nova" sign | (0, 5.8 up, -12.2), facing south | 11 x 2.4 | Two pylons at x +-5, r 0.3 | From the arrival camera (about 3.4 m up, 5.8 m behind you) the sign sits about 4 degrees above horizontal, inside the frame's top edge (about 9 degrees), with the arena's light pillar framed under it through the airlock |
| Judges' desk | (6.8, 6.2), turned to face the origin | 3.6 x 1.0, h 1.1 | 1 box | Clear of the dock path (x within +-5) and 7 m from the star pad |
| Rival spot (dance only) | (-3.0, -1.5) on the floor | | None | You dance at (0, 0) facing south |
| Airlock | x -3.5 to 3.5, z -20 to -15 | 7 x 5 | Side walls at x = +-3.7 (0.4 thick, h 3.2) | Light curtain doors; tag terminal at (2.6, -14) |
| Comet Yard | x -15 to 15, z -50 to -20 | 30 x 30 | Perimeter walls 0.6 thick, h 2.8 (blocksCamera on); south wall upper half is glass (visual) | Floor: grid shader, halves tinted by team |
| West bridge | x -20 to -15, z -3 to 3 | 5 x 6 | Rails at z = +-3.2, h 1.1 | Hex light arch at x -20 (violet) |
| Blade Ring | Disc r 7 at (-27, 0) | | Rail ring r 7.3 except the bridge gap | Duel ring marking r 4.5. You duel at (-26.0, 0) facing west; the duelist at (-28.2, 0) facing east (2.2 m apart) |
| Duelist pedestals | 5 at radius 5.8 around (-27, 0), angles 130 to 230 degrees (west arc) | r 0.6, h 0.5 | Circles | Locked duelists are dark silhouettes |
| Duel terminal | (-21.5, 2.2) | | Small box | "Choose a duel" |
| East bridge | x 15 to 20, z -3 to 3 | | Rails at z = +-3.2 | Gold "Glow Lab" sign at x 20, y 4 |
| Glow Lab | x 20 to 34, z -8 to 8 | 14 x 16 | Walls h 3.2 with the west doorway z -3 to 3 | |
| Wardrobe mirror | (26.5, -5.0) | 1.2 x 2.4 oval mirror on a pedestal | Box 1.4 x 0.6 | "Try on suits" at (26.5, -3.6) |
| Hall of fame | East wall x 33.7; boards at z -4.6, 0, 4.6 | Each 4.2 x 2.9, bottom at y 1.2 | Wall | Nights, laser tag, dance |
| Sync jukebox | (23.0, 6.2) | | Box 1.0 x 0.6 | "Sync check" at (23.0, 5.0) |
| Milkshake bar | Counter (30.0, 6.4) | 5.0 x 1.0, h 1.1 | Box | Robot bartender, glowing drinks (decor) |
| Sofas | (23.5, -6.6) and (30.5, -6.6) | 3.0 x 0.9, h 0.5 | Boxes | Lounging robots |

Walking times (6 m/s): arrival to star pad 11 m (2 s), Nova floor to the airlock 15 m, to the Blade Ring 20 m, to the Glow Lab 20 m.

### 6.2 Comet Yard cover (Prism Yard layout)

The arena is point-symmetric about its centre C = (0, -35): every piece at (x, z) has a twin at (-x, -70 - z) with the same rotation, so both teams see the same map.

| Piece | Cyan half positions | Size, height | Blocks shots |
| --- | --- | --- | --- |
| Core pillar | (0, -35), shared | Circle r 1.3, h 4 (with a 10 m light beam) | Yes |
| Spawn screen | (0, -26.0) | 4.0 x 0.4, h 1.6 | Yes (no line of sight out of base to the Core) |
| Light boxes | (-9.5, -25.0), (9.5, -25.0), (-4.5, -30.0), (4.5, -30.0) | 1.2 x 1.2, h 1.5 | Yes |
| Flank boxes | (-10.5, -35), (10.5, -35), shared | 1.2 x 1.2, h 1.5 | Yes |
| Lane walls | (-12.5, -29.0), (12.5, -29.0), along z | 0.4 x 3.0, h 1.6 | Yes |
| Mirrors | (-6.5, -33.0) turned +40 deg, (6.5, -33.0) turned -40 deg | 2.6 x 0.3, h 2.2 | Reflect |
| Base pad | (0, -22.5) | r 2.5 | No (recharge zone; 4 spawn points) |
| Power-up pad | (12.5, -31.5) | r 0.8 | No |

Cover blocks are 1.5 to 1.6 m tall: taller than the avatar's head, low enough that the follow camera (about 3.4 m up) sees over them, so they are flagged not to block the camera. Gaps between pieces are at least 1.6 m so neither the player (r 0.36) nor bots (r 0.45) can wedge. Two more layouts for later nights reuse the same instanced pieces: **Mirror maze** (eight mirrors, fewer boxes) and **Core ring** (six boxes in a ring around the Core). Between layouts, cover sinks into the floor and rises in its new spots over one bar, with glowing edges: a cheap, spectacular transformation.

### 6.3 Sight lines

- From the arrival, straight north: star pad, Nova floor, the lower spikes and light shaft of the Core, the DJ booth, the "Club Nova" sign, and through the airlock the Comet Yard's light pillar 55 m away. The flyover establishes the full Core.
- From the Nova floor: west to the violet hex arch of the Blade Ring, east to the gold Glow Lab sign, south to the exit portal ring, north to the booth and airlock.
- Inside Comet Yard: no straight line from base pad to enemy base pad (the Core and spawn screens block it; a unit test checks); each lane offers a mirror bank line into the far half.
- The Blade Ring's side-on duel camera looks south to north across the ring, with the atrium's glow behind the duelists.

### 6.4 Collisions and safety

About 100 static colliders in total, plus bots as moving circles through `extraColliders` (blocksCamera off). The station has rails everywhere; nothing to fall off, no traps. The Nova Core and signs float above head and jump height. The arena perimeter blocks the camera so it lifts over walls instead of clipping.

---

## 7. Technical plan

### 7.1 What this world needs from the engine and the kit

Engine facts this plan relies on, checked in the code:
- **Low steps block walking.** `resolveCircle` blocks any collider taller than your feet, and `groundHeight` only steps 0.12 m, so all walkable floors are at y = 0.
- **Interact needs a target in range.** `game.ts` only runs Interact when an interactable is in range, so the tag "fire" action sits at the player's own spot.
- **Kick is space-first.** Kick goes to `kickAction` when it returns something; otherwise the avatar plays its kick.
- **Pause freezes only `step`.** `holdsTime` freezes `step`, while `update` and `render` still run every frame, so the music pause and HUD can live in `update`.
- **Input has no timestamps.** Presses are collected once per frame without timing, hence `rhythm-input.ts`.
- **No player control from experiences.** `PlayerState` has no height, and `ExperienceCtx` cannot move or pose the player, hence the hooks below.
- **TV Back opens the menu.** On a TV, Back maps to pause in play.

Small, generic engine hooks (each useful to other worlds):

1. **`SpaceView.holdPlayer?(): { x: number; z: number; yaw: number } | null`**. While non-null, the game snaps the player there, zeroes velocity, ignores move, jump and kick (no kick animation), and hides the touch stick, Kick, Jump and Action buttons (menu stays). Used for duels, dances, countdowns and respawns.
2. **`ExperienceCtx.teleport(x, z, yaw)`**: wraps the existing `placePlayer` and snaps the camera. Used by the night's warps and laser tag respawns.
3. **`ExperienceCtx.avatar`**: `attach(slot, object)` for `handR`, `handL`, `head`, `torso`, `feet`; `detach(object)`; `pose(fn | null)` where `fn(limbs, dt)` runs after the walk cycle and may set limb rotations and rig offsets. Used for suits, the blade and blaster, dance moves, parries and bows.
4. Optional: **`PlayerState.y`** (feet height) for hop-dodging bolts.

From the kit: music (songs as data, schedule-ahead independent of frame rate, exposed context start time and tempo map, pause and resume at a bar, layer mute for Glow time, a zone low-pass, short preview loops for song select), post (bloom, grade, vignette per tier), hud (banners, countdown, score pops, timer bar, results card with custom rows for judges' cards, intro card), particles, camera (override for duel, dance and podium shots, lock-on framing helper, shake), scores (generic boards per area and mode with a per-mode server rule that turns a log into a score, plus run tickets; section 7.9).

Without the kit the world still needs a sequencer and post stack, so if the kit slips, `music.ts` and `post` are the first things to build locally behind the same interfaces.

### 7.2 Files

Everything lives in `src/experiences/neon/`, with its stylesheet imported from `index.ts`.

| File | Role |
| --- | --- |
| `index.ts` | `NeonParty implements SpaceView`: builds zones, owns the mode state machine (roam, night, tag, duel, dance, results), wires hooks, `debugInfo` and debug methods. Imports `./neon.css`. |
| `neon.css` | HUD styles: beat bar, rival meter, tag HUD, duel bars, judges' cards, tap zone, terminals. Safe areas and TV overscan (5%). |
| `station.ts` | Static geometry: deck shape with holes, rails, booth, signs, Comet Yard shell, Blade Ring, Glow Lab, dock, portal. Batches by material (the `Batch` pattern from `arcades.ts`), colliders, and an exported layer registry for z-fighting tests. |
| `sky.ts` | Nebula and starburst sky shader, star points, ringed planet, light streak ships. |
| `core.ts` | Nova Core (instanced spikes, ray streaks, beat pulse) and the light shaft. |
| `shaders.ts` | GLSL for the Nova floor (rays, beat bursts, footprints, note pulses), arena grid, mirror ripple, blade glow. |
| `robots.ts` | Robot builder (bots, duelists, judges, Orbit) from rounded parts with an LED face atlas; merged per material, 3 to 4 draws per robot. |
| `crowd.ts` | Instanced dancing crowd: one geometry with a per-vertex part attribute; the vertex shader bobs bodies and swings arms from beat uniforms. |
| `style.ts` | Glow suits, blades, blaster, victory poses and the dance and duel pose library (about 16 dance moves, parry and strike poses) driven through `ctx.avatar.pose`. |
| `clock.ts` | `BeatClock`: audio and performance time mapping, offsets, pause and resume, silent fallback. |
| `rhythm-input.ts` | Timestamped presses and releases from keys, pads and the touch tap zone. |
| `beat-bar.ts` | Canvas lane renderer for the HUD. |
| `dance.ts` | Dance off mode: chart playback, judging, combo, Glow time, rival, judges, cameras. |
| `duel.ts` | Duel mode: script playback, duelist animation, parries, crushes, feints, strike phrases. |
| `tag.ts` | Laser tag match: rules, bolts (pooled, instanced), lock-on, deflect, power-ups, HUD, radar. |
| `bots.ts` | Bot brains: perception, utility choice, grid navigation, aim model, tokens, fixed-tick sim. |
| `night.ts` | Party night director, Orbit's lines, warps, results flow, resume. |
| `menus.ts` | Song select (with preview loops), duel select, tag setup, sync check, wardrobe, party settings. All through `UI.open`. |
| `music.ts` | The six songs as sequencer data, zone filters, hit sounds. |
| `save.ts` | Local progress record and migrations. |
| `boards.ts` | Run tickets, submit logs, read and paint boards (`boardTexture`). |

Shared rules (run in the browser and on the server) in `src/shared/neon/`:

| File | Role |
| --- | --- |
| `songs.ts` | Song meta: id, tempo map, bars, duration. |
| `charts.ts` | Chart grammar parser and all chart data; note counts and durations. |
| `judge.ts` | Windows, press to note matching, holds, spotlight grid, combo, Glow time, scoring, judges' cards, stars. |
| `duel.ts` | Duel scripts, Echo variants, duel scoring and win rules. |
| `tag.ts` | Arena layouts, segment line of sight, mirror reflection, lock-on pick, tag scoring and plausibility caps. |
| `progress.ts` | Star totals and the unlock table. |
| `rules.ts` | Per-mode server validators: log in, score out. |

The old `src/experiences/neon.ts`, `src/shared/neon.ts`, `tests/neon.test.ts` and `scripts/neontest.ts` are replaced. `game.ts` imports `NeonParty` from `../experiences/neon/index`. `docs/VERB_SHEET.md` and `docs/ACCEPTANCE.md` get rewritten neon sections.

### 7.3 SpaceView hooks

| Hook | Use |
| --- | --- |
| `step(h, player)` | Bots and bolts on their own fixed 1/60 s accumulator (deterministic whatever the frame rate), miss sweeping for rhythm notes, night timers, footstep tracking on the Nova floor. |
| `update(night, t, ...)` | Every frame, even while paused: beat-driven visuals, beat bar, HUD, matinee or late show by `night`. Also detects `ctx.ui.isOpen` to pause and resume the song. |
| `actions(player)` | Roam: star pad, terminals, Orbit, wardrobe, jukebox, free dance on the Nova floor (an action at the player's own spot, only while on the floor, which nothing else overlaps). Tag: one "Tag" action at the player's spot with a long range. Rhythm modes: none (input comes from `rhythm-input.ts`). |
| `kickAction(player)` | Tag only: "Blade" swing. Null elsewhere. |
| `extraColliders()` | Bot circles (h 1.5, blocksCamera off). |
| `holdsTime()` | True during matches, duels, dances and countdowns. The engine freezes `step`; `update` pauses the music and, on resume, restarts one bar early with a four-beat count-in; notes before the pause point are never re-judged. |
| `holdPlayer()` (new) | Duel and dance spots, countdowns, tagged-out holds. |
| `gravity()` | 1.0. |
| `setQuality(tier)` | Swaps materials, crowd count (`InstancedMesh.count`, no reallocation), particle budgets, sky octaves, shadows and post. |
| `render(renderer, camera)` | Reads the camera (lock-on cone uses the camera's centre) and runs the kit post stack; returns false on low. |
| `resize()` | Rebuilds post targets, re-lays the beat bar canvas. |
| `dispose()` | Stops music, removes listeners and the tap zone, disposes the tree. |

### 7.4 Timing core

**Clock.** The sequencer schedules on the AudioContext clock. `BeatClock` keeps a smoothed mapping from `performance.now()` to the context time currently being heard, using `ctx.getOutputTimestamp()` (which includes output latency) when available, else `ctx.currentTime - baseLatency - outputLatency` sampled each frame. The mapping is low-pass filtered with outlier rejection, because `currentTime` advances in coarse steps on some Android devices, and re-anchored after suspends.

- Heard song time: `heard(p) = ctxHeard(p) - songStart`.
- Judge time for a press with event timestamp `p`: `heard(p) - inputOffset`.
- Draw time for a frame at `p`: `heard(p) + displayLag + videoOffset` (displayLag defaults to one frame).
- Tempo maps convert beats to seconds (Supernova changes tempo once).

**Input.** `rhythm-input.ts` captures its own timestamped events while a rhythm mode is active and no dialog is open:
- Keys: window keydown and keyup in the capture phase, using `e.timeStamp`; `e.repeat` ignored; a second keydown without a keyup is treated as a repeat (TV remotes); if `timeStamp` is not on the performance timeline, `performance.now()` is used.
- Touch: a full-screen `.nova-tap` overlay (pointerdown and pointerup, any number of fingers, `touch-action: none`), shown only during rhythm play, leaving the menu button corner free.
- Pads: polled each frame (A, X, Y, LB, RB, LT, RT, d-pad; B and Start keep their engine meanings), timestamped with `gamepad.timestamp` when it changed this frame, else the poll time minus half a frame.
- Any held source counts as holding.

**Calibration.**
- The first rhythm encounter runs the sound check: 8 claps, the median offset becomes `inputOffset` (clamped to -60 to 300 ms, since some players anticipate), and a hold test checks that the device reports a held button. If it does not (some TV remotes), **Easy holds** turns on: a hold counts once its head is hit.
- After every song with at least 20 hits, if the median error exceeds 15 ms the offset moves by half of it (at most 25 ms per song) with a small "Sync tuned" toast.
- The Glow Lab jukebox reruns the check and offers nudges of 10 ms with left and right (remote-friendly), plus an optional flash test for `videoOffset`.
- Values are stored per device.

**Judging** (pure, in `src/shared/neon/judge.ts`): presses are processed in time order; each matches the earliest unjudged note whose window contains it (closest if two qualify). Notes whose Good window passes are swept as misses in `step`. Holds: the head is a tap; ticks accrue per beat while held; release more than 120 ms before the tail is "Dropped" (combo break). Spotlight slots sit on the eighth-note grid; a press within 60 ms of a slot is on-grid, otherwise sloppy, at most one per slot. In duels, a press inside a feint window is a whiff.

**Laser tag uses the same clock** for beat shots (90 ms) and for bot telegraphs, which start on beats.

### 7.5 Rendering and performance budget

Targets: Samsung TV on low at a steady 30 fps (p75 at most 33 ms), phones on medium at 50 to 60 fps, desktop on high at 60 fps at 1080p. Judging never depends on frame rate.

| Budget (worst case: dance off with full crowd) | Low | Medium | High |
| --- | --- | --- | --- |
| Draw calls | 90 | 160 | 260 |
| Triangles | 150k | 400k | 900k |
| Lights | Hemisphere and directional, no shadows | Plus core point light; 1024 shadow map, dynamic casters only | Plus 2048 shadow map |
| Shadows | Blob shadows (kit `blob`) | Directional, tight box following the player | Same, softer |
| Post | None (render returns false); fake glow with additive halo quads | Half-res bloom, grade, vignette | Full-res bloom, grade, vignette, chromatic pulse on drops, Core light shafts, warp on arrival |
| Crowd robots | 16 | 40 | 80 (all instanced, 2 draws) |
| Live particles | 300 | 1200 | 4000 |
| Sky | Gradient sphere, 300 stars | Shader with 3 octaves, 1500 stars | 5 octaves, 4000 stars, streak ships |
| Floor | Simplified ray shader, no env map | Full ray shader with env map | Same |
| Robots | One merged mesh per robot beyond 25 m | 3 draws each | 4 draws each with animated faces |
| Lasers (late show) | None | 4 sweeping beams | 8 beams |

Further rules:
- Static geometry is merged per material per zone. Cover pieces, bolts, spikes, crowd and halos are instanced.
- No per-frame allocations in `step` or `update`: pooled bolts, particles and scratch vectors.
- Bots think at 10 Hz, staggered. Attract-mode bots only simulate when the player is within 35 m of the arena; on low they idle instead.
- Shaders compile with `renderer.compile` during the arrival fade to avoid first-use hitches.
- Canvas textures repaint only when content changes (boards, faces).
- GPU texture memory stays under 32 MB.
- `debugInfo` reports `renderer.info.render.calls` and triangles so playtests can assert these budgets per tier.

### 7.6 Bot brains

- **Perception:** enemies within 22 m, inside a 140 degree field of view, with a clear segment (2D, against colliders taller than 1.2 m; mirrors block direct sight) are seen. Last-seen positions are remembered for 4 s. Allies share what they see (team vision drives the radar and pings).
- **Choice:** utility scores each think tick for engage (visible target, 2+ pips), seek cover (1 pip or targeted by 2+), recharge (low and near base), flank (target hidden behind cover over 3 s), power-up (spawned, per personality), support (allies near the player), and patrol (lane waypoints). There is hysteresis so bots do not dither.
- **Navigation:** a 1 m grid over the arena with cells blocked by inflated colliders; A* with an octile heuristic; string-pulled paths; replans on target moves over 2 m or every 1 s. Stuck detection: under 0.3 m of progress in 2 s while pathing triggers a replan, then a nudge to the nearest free cell.
- **Movement:** seek plus separation, resolved against colliders with `resolveCircle`; strafing perpendicular to the target at a preferred range of 7 to 12 m; occasional hops (Zap).
- **Firing:** take an attack token (if targeting the player), wait for reaction time, telegraph on the next beat, fire with lead and Gaussian error per difficulty, cooldown. Bank-shot bots test one-bounce lines via mirror reflection of the target.
- **Volt:** front shield arc (blocks bolts within 60 degrees of his facing) that drops while he fires.
- **Determinism:** seeded PRNG (from the run ticket), fixed ticks, so a seed plus an input log reproduces a match.

### 7.7 Procedural assets only

All geometry is built in code (Lathe, Box, rounded boxes from `kit.ts`, Shape with holes, instanced cones). All textures are canvas (LED faces atlas, signs with `glowText` style, boards via `boardTexture`, halos, gobos) or shader procedural (sky, floor, grid, mirror, blade glow). Fonts are the app's bundled Lilita One and Atkinson Hyperlegible. No asset files, no network fetches, no paid services.

### 7.8 Z-fighting prevention

- **One floor per area of ground.** The deck is a single Shape with a hole exactly where the Nova floor disc sits; arena, ring, lab and dock floors abut along seams covered by raised trim strips (top 1 cm above the floor). No two floor surfaces overlap.
- **Flat overlays** (light pools, gobos, base pads, power-up pads, duel ring marking) sit at registered heights at least 8 mm apart in any overlapping region (from 12 mm up), with `depthWrite: false`, `polygonOffset` (factor -1 to -4 by layer) and an explicit `renderOrder`. The depth precision at 100 m with the engine's 0.1 m near plane is about 6 mm, so 8 mm keeps every overlay clean at arena distances.
- **Neon strips on walls** are boxes 3 cm deep centred 1 cm proud of the surface: no face lies in the wall's plane.
- **Merged neighbours** never share coplanar faces: they either leave a 2 mm gap or overlap by at least 1 cm with no coincident faces.
- **Mirrors and boards** are single meshes whose canvas or shader includes the frame, never a plane laid on a box.
- **Tests** (section 7.11) check the layer registry and every pair of static boxes for coplanar overlapping faces. The playtest takes two screenshots of the same view one frame apart with a 1 mm camera jitter and fails on flicker in floor regions.

### 7.9 Server and scores

Boards use the kit's generic per-area, per-mode sorted sets, keyed `neon:<roomId>:<areaId>:<mode>`, with names from the existing `scorename:<browserKey>`. The neon rules plug in as per-mode validators in `src/shared/neon/rules.ts`.

**Run tickets.**
- `runStart {roomId, areaId, browserId, mode, nightRunId?}` returns `{runId, seed}` and stores `neonrun:<roomId>:<areaId>:<bk>:<runId>` with its mode and server start time (expires after 2 hours).
- `runFinish {runId, name, log}` checks the ticket (single use, right mode, server-measured elapsed time at least 97% of the play time the log implies: the song length for dances, the KO point or song end for duels, the match length plus any overtime for tag), recomputes the score from the log with shared code, updates the board if improved, and returns `{score, best, improved, rank}`.
- Limits: 30 starts and 30 finishes per minute per browser, plus the existing per-IP limit.

**Logs** (all under 2 KB):
- Dance: one character per note in chart order (P, G, O for Good, M), a tail character per hold (H kept, D dropped), and one per spotlight slot (F on-grid, S sloppy, `.` none). The server replays combo, Glow time, multipliers and judges' cards exactly, and checks the length against the chart.
- Duel: the same over the duel script's events (parries, feints R or W, crushes H or D, strike openings).
- Laser tag: a list of `{t, kind}` events (tag, bank, reflect, beat, assist, pickup) plus the final team scores. Caps: no two tags within 0.6 s, tags at most duration / 2, banks and reflects at most tags, times inside the match, team score at least your tags. The server computes points.

**Night aggregation.**
- `runStart` for a night returns a night run.
- Each event's finish carries the night run id; the server stores validated event scores under `neonnight:<roomId>:<areaId>:<bk>:<nightRunId>`.
- When the third arrives it applies the night multiplier and records the `night` board.

**Clearing.** The creator's clear-scores tool deletes neon boards by enumerating mode ids from shared data, so no index key is needed.

**Client.** `api.neonStart`, `api.neonFinish` and `api.neonBoard` live in `src/net/api.ts`. Offline or failed starts still play; the run is local only and the card says so.

This is honest validation for a kids' game: a forged log can at most reach a perfect score, which the shared max-score function already bounds, and replay validation of top tag entries (seed plus input log) is possible later because the sim is deterministic.

### 7.10 Headless testability

**`debugInfo()`:**
- mode, phase, tier, draw calls, triangles;
- clock: song time, beat, bpm, offsets, and the next 8 notes or cues with due times in `performance.now()` terms (so scripts can press on time);
- judgments, combo, score, glow, rival, judges' cards;
- tag: bots (position, state, pips, team), lock target and path type, bolts, team scores, heat;
- duel: phase, cue type, both glow bars;
- night: index, event, stars;
- save summary, last board response.

**Debug methods:** `debugShort()` (8-bar test chart, 4-bar duel, 20 s tag), `debugSeed(n)`, `debugSkipTo(mode)`, `debugSetOffset(ms)`, `debugSimulateTag(seconds)` (bots-only fast-forward), `debugUnlockAll()`.

**Determinism:** seeded PRNG everywhere, fixed-tick sims, charts as data, and a virtual clock in tests (no audio needed).

### 7.11 Unit tests (vitest)

| File | Covers |
| --- | --- |
| `tests/neon-judge.test.ts` | Windows and boundaries, early and late, nearest-note matching, doubles, holds (kept, dropped, Easy holds), TV repeat keydowns and missing keyups, offsets, spotlight grid and sloppy presses, feint whiffs, no re-judging after pause |
| `tests/neon-charts.test.ts` | Every chart parses, notes sorted, minimum gaps and density caps per difficulty, holds do not overlap the next note, lengths fit the song, spotlight and Glow time present, max scores; duel scripts alternate phases and have 30% spare openings |
| `tests/neon-clock.test.ts` | Mapping with fake output timestamps, coarse `currentTime` smoothing, suspend and resume re-anchoring, tempo map conversions across the Supernova tempo change |
| `tests/neon-tag.test.ts` | Segment line of sight, mirror reflection and bank solutions, lock pick (cone, sticky, camera), layouts point-symmetric, every open cell reachable from both bases, no base-to-base sight line, each mirror offers a bank line, bots sim: same seed gives the same result, no bot stuck over 3 s in 120 s, bots stay in bounds, at most the token count fire at the player, Normal versus Normal ends within a sane score spread |
| `tests/neon-scores.test.ts` | Validators reject wrong lengths, impossible counts, early finishes, reused tickets, wrong modes; scores match the client function; night aggregation and multiplier; boards ordering and rename |
| `tests/neon-layers.test.ts` | Overlay layer separation and no coplanar overlapping faces among static boxes |
| `tests/neon-progress.test.ts` | Star totals, unlock thresholds, save migration and corrupt record recovery |

### 7.12 Playtests

`scripts/neontest.ts` drives real input in Chromium (swiftshader flags) against a local dev server and memory store, claims a local room and publishes the area through the dev admin, then runs in four modes. Each line goes into `scripts/autobuild/playtests.txt`.

| Mode | Input | Notes |
| --- | --- | --- |
| Desktop | Keyboard and mouse: WASD, E, F, Space, mouse click to fire | |
| `PHONE=1` | 390 x 844, real touch: stick drags, Action and Blade buttons, taps on the tap zone; holds via CDP touchStart and touchEnd | |
| `PAD=1` | Injected standard gamepad: stick, A, X, RT | |
| `REMOTE=1` | Tizen user agent (so `IS_TV` and TV glyphs apply); only ArrowUp, ArrowDown, ArrowLeft, ArrowRight and Enter, plus Back sent as keyCode 10009 through CDP `Input.dispatchKeyEvent` | Asserts nothing else was needed |

**Flow per mode:**
1. Arrive; intro card; walk to the star pad; sound check (presses on the claps, read from `debugInfo`); Easy holds detection.
2. Short night: tag (lock, fire, at least 2 tags, a bank shot via a scripted position, a deflect via OK when the "!" ring shows, get tagged out once and respawn).
3. Duel: parry, read a feint, hold and push a crush, land strikes, KO.
4. Dance: at least 85% Perfect or Great by pressing on the due times, a hold, spotlight presses, Glow time triggered.
5. Results and judges' cards; board submit confirmed by the dev server; pause and resume with Back mid-song (no notes re-judged); retry; wardrobe equip; song select with preview; exit through the portal back to the room.

Also: a "press nothing" pass confirming no-fail and misses; screenshots at each step of the flow into `/tmp/toyboxes-neon-<mode>`; frame times and draw calls per tier (galaxytest pattern), failing above the budgets in 7.5.

---

## 8. Scope

### 8.1 Must-have for the first AAA-quality release (priority order)

1. **Engine hooks** (`holdPlayer`, `teleport`, `avatar` attach and pose) and the **timing core**: `BeatClock`, `rhythm-input`, shared `judge`, sound check, offsets, Easy holds. Everything else stands on this.
2. **Dance off vertical slice**: Nova floor, Nova Core, beat bar, one song with three charts, judging, combo, Glow time, judges, rival meter, results, no fail, free dancing. This proves the feel early.
3. **Station art pass**: atrium, dock and portal, sky, booth and sign, Blade Ring, Glow Lab, Comet Yard shell; tiers and post; z-fighting rules and tests.
4. **Laser tag**: lock-on and lock-on camera, bolts, heat and beat shots, mirrors and bank shots, deflect, pips and respawn, 2 power-ups, bots with full brains and tokens, Prism Yard plus the two variant layouts, radar and edge arrows.
5. **Blade duels**: duel camera, strikes, flurries, crushes, feints, strike phrases, call and response, Echo variant, all five duelists.
6. **Music**: the six songs and remaining charts (13 dance charts, 5 duel scripts).
7. **Party night**: Orbit, five nights, warps, retries, resume, podium.
8. **Boards and progress**: run tickets, validators, night aggregation, boards in world, local save, stars, unlocks, wardrobe (all suits, blades and poses in 3.7).
9. **Onboarding and juice pass**: intro flyover, practice loops, hint bubbles, the full juice table, attract modes in each venue.
10. **Tests, playtests and performance passes** on all four input paths and three tiers; VERB_SHEET and ACCEPTANCE updates.

**Cut line if time runs short** (in this order, keeping the game whole): Mirror maze and Core ring layouts (keep Prism Yard), duelists 4 and 5 become Echo variants of 2 and 3, one dance song (keep three plus Supernova), late show lasers, Comet suit trail.

### 8.2 Nice-to-haves (priority order)

1. **Daily remix night**: a date-seeded night (layout, bot mix, chart remix) with its own board; server checks the date.
2. **Ghost rival**: dance against your own best log.
3. **Bolt rally**: a blade score attack where drones fire bolts on the beat and you deflect them back.
4. **Core control** laser tag variant (light the Core to score over time).
5. **Pro charts**: four directions (arrows, d-pad, swipes) with separate boards.
6. Reflective Nova floor on high (half-res planar reflection).
7. A seventh song (Moonroller, 122 BPM roller disco) with charts.
8. Photo pose camera on results cards.
9. Roller skates on the Nova floor as a rideable.

---

## 9. Risks and open questions

### Risks

| Risk | Mitigation |
| --- | --- |
| TV audio, display and remote latency is unknown and may be large (100 to 250 ms) | Event timestamps, the output timestamp mapping, sound check on first play, auto tuning per song, manual nudges; windows generous enough for 30 fps and remote jitter. Needs a real S90H session. |
| TV remotes may not report held OK reliably (repeats, early keyups) | Repeat-tolerant input, a hold test in the sound check, automatic Easy holds. |
| `getOutputTimestamp`, `outputLatency` or high-resolution `e.timeStamp` missing on Tizen | Fallback mapping and `performance.now()`; calibration absorbs constant error. |
| Audio scheduling stutters on weak CPUs | The kit sequencer schedules ahead with a lookahead timer independent of rendering; judge and visuals follow the audio clock, never the reverse. |
| Scope is large for one engineer | One timing core powers duel and dance; robots share one builder; content is data; vertical slice first; explicit cut line. |
| Engine hooks or the kit land late | Hooks are small and listed precisely; local fallbacks for music and post behind the same interfaces. |
| Headless timing flakiness | Judging by event timestamps, scripts press against due times from `debugInfo`, thresholds at 85% rather than 100%. |
| Bloom and crowds too heavy on TV | Low tier has no post, fake glow, 16 crowd robots, blob shadows; budgets asserted in playtests. |
| Photosensitivity with neon strobes | Flash rate caps, small flash areas, Reduce motion respected everywhere. |
| Kids finding rhythm timing hard | No fail, Easy charts with wide windows, practice loops, early or late ticks, hit sounds, Easy holds, gentle bot downgrade offer. |
| Board cheating | Server computes scores from logs with caps and tickets; perfect scores bounded; deterministic sims allow replay checks later. |
| Lock-on camera discomfort | Eased framing, toggle in party settings, soft mode for mouse users. |

### Open questions for the creator and the engine lead

1. Can the engine add `holdPlayer`, `ctx.teleport` and `ctx.avatar` (attach and pose) as specified, and `PlayerState.y`?
2. Will the kit's scores module accept per-mode "log to score" validators and run tickets, or should neon add its own `runStart` and `runFinish` actions to `api/scores.ts`?
3. Will the kit sequencer support pause and resume at a bar, layer mutes, zone filters and preview loops?
4. Is it fine to have about 27 boards for this one area (per song and difficulty, per duelist and difficulty, per tag difficulty, plus nights)?
5. Should runs with the Wide timing assist save local bests but stay off boards (the proposal), or show on boards with a marker?
6. Should the night podium name the owner ("Chels's party night") and should Chels's own best get a special spot on the Hall of fame?
7. Is the daily remix (date-seeded, server-checked date) welcome for the first update after launch?
8. Any appetite for the cosmetics to follow the player into the town later (out of scope here)?

## Decisions after review

Answers to your questions:
1. Hooks are all in the kit now.
   - `holdPlayer` is `captureInput()`. While it returns labels, the game stops moving the player and stops handling interact, kick and jump. You read `ctx.input` yourself and set the touch button labels (null hides a button). For a full-screen tap zone, add your own DOM element.
   - `ctx.teleport(x, z, yaw, y?)`.
   - Attaching and posing use `ctx.hold(object3d)`, the right hand; `ctx.pose('dance' | 'aim' | 'cheer' | ...)`; and `ctx.swing()`.
   - `PlayerState` has `y`, `vy` and `grounded`.
   - Press timing: `ctx.input.pressedAt(action)` gives event times on the performance.now base. `ctx.input.takeDirs()` gives arrows, WASD, d-pad and stick flicks with their times.
2. Boards use the generic system in src/shared/score-modes.ts. A mode can need a one-use run ticket (`ticket.minMs`, started with `api.runStart`) and can have the server compute the score from your play log (`fromLog`, pure shared code, log up to 24k characters). Do not add separate runStart or runFinish actions.
3. Music (src/audio/music.ts) has layers, `queue(section)`, `only(section)` for preview and practice loops, and `filter(hz)` for zone muffling.
   - `pause()` and `resume()` hold the beat clock at the heard beat; they do not wait for a bar line. If you need bar-aligned resumes, add a short count-in in your own code.
   - `beat()` and `beatTime()` are latency corrected.
4. About 27 boards is too many to browse. Keep it to about 12 at most: one per song at the normal chart, duels, laser tag, and party nights. `api.modeBoards` fetches up to 12 at once.
5. Wide timing assist runs save local bests only and stay off the boards: yes.
6. The night podium can say "Chels presents Club Nova". No special Hall of Fame spot for the owner: boards cannot know who the owner is, and names are labels, not identity.
7. No daily remix for now.
8. Cosmetics stay in this world.

Scope: work through your must-have list in order, fully polished. One timing core first, then dance (the visitor's headline "dance competition"), then laser tag, then duels, then party nights. If you must cut, cut from the bottom and say so.
