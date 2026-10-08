# Little Puffington: a fart simulator

> The design written before the build. The review decisions at the end override it where they differ. What shipped is recorded in `docs/ACCEPTANCE.md`. Paths under `/tmp/toyboxes-worlds/` were scratch files and no longer exist.

World design for room 2's "Fart simulator" area (owner jessica). Kind `fart`, area id `puff-challenge`. Phase 1 design doc.

The current build (`src/experiences/fart.ts`, 96 lines) is a flat 18 m pad, a cycling pressure bar and a gold hoop. You can't fly, nothing reacts, the sound is one 0.28 s sawtooth, and the camera starts almost straight down because the arrival point is 3 m from a 10 m tall wall that blocks the camera (seen in a local run, `/tmp/toyboxes-worlds/fart/shots/arrival.png`). This doc replaces it completely.

---

## 1. Vision

### Pitch

**Eat beans. Toot. Fly. Cause polite chaos at the poshest village fete in the land.**

Little Puffington is holding its Summer Fete, and everyone is on their best behaviour: the Mayor in his top hat, ladies with teacups, a brass band in the bandstand, a library where you can hear a pin drop. You are the one kid in town whose toots are a superpower. Beans make you a rocket. Fizzy pop makes you flutter and hover. Cabbage leaves a cloud that clears a picnic. Every toot makes a sound, a cartoon cloud and a reaction, and the whole prim little village is your toy.

### The fantasy

- **Power:** your toots move you. Hop, scoot, double-jump, hover and rocket to the top of the bell tower.
- **Mischief:** the town is the straight man. Make the Mayor's hat pop off, scatter the pigeons, make the fountain bubble, get the dog blamed.
- **Mastery:** four trials with golden beans to earn and shared boards to top (a sky rally, a stealth library, a rhythm game with the brass band, a stink-cloud puzzle in the park).

### Comedy pillars (the rules every feature follows)

1. **Wind-up, release, reaction.** Comedy is timing. Big toots have an "uh oh" wind-up (shaking, rising slide whistle), the release, then a beat of silence (0.3 to 0.5 s) before the townsfolk do a double take.
2. **Pompous versus silly.** The village takes itself very seriously, so every toot punctures it. The target of the joke is the town's dignity, never the player.
3. **Never gross.** Toots are musical instruments and weather. Clouds are candy-coloured (green, pink, purple, gold), never brown, never wet. Nothing about bodies beyond a cartoon toot and a "Pee-yew!".
4. **Someone always laughs with you.** Gran Butterworth ("That's my beans!") and little Pip giggle at every toot. Nobody is mean to the player.
5. **Every toot does something.** It moves you, pushes things, startles people, leaves a cloud. The world is a toy first, a game second.

### Title

**Little Puffington**, subtitled "a fart simulator" (the owner's name for the area stays on the door sign in the room: "Fart simulator"). In-game copy says "toot" almost everywhere; the word "fart" appears only in the title card. No trademarked names: the village, characters, songs and machines are all invented.

### Reference games

- **Untitled Goose Game:** a to-do list of mischief in a prim English village, characters with routines who react, comic chases.
- **Katamari Damacy:** absurd joy, saturated toy colours, a jaunty soundtrack.
- **Mario Party:** mini-game punch: 3-2-1 countdown, a short sharp challenge, stars, a results screen with cheering and sulking characters.
- **Rhythm Heaven:** one-button rhythm where the comedy is in the reactions.
- **A Short Hike:** a small dense world you learn to fly around; vertical exploration as the reward.
- **Wallace and Gromit, Animal Crossing:** English village whimsy, bunting, gibberish voices.

### Art direction

**Look:** a storybook village at a summer fete, built like a premium toy set. Chunky rounded shapes, slightly crooked buildings (1 to 3 degree leans), oversized chimneys and hats, bunting everywhere. Toon-shaded characters with bold plum outlines; soft-lit architecture with baked vertex-colour shading. Matches the town's toy style, pushed further toward Pixar-short charm.

**Palette (hex):**

| Role | Colours |
| --- | --- |
| Sky | top `#7EC8F2`, horizon haze `#FCE9C8` |
| Grass | lit `#9CCB6B`, shade `#6FA35A`, flowers `#FFD45C` `#FF8FB1` `#FFFFFF` |
| Paths and cobbles | `#E9D3A8`, grout `#C9AE80` |
| Cottage walls | cream `#FFF1D6`, butter `#FFE29A`, blush `#F9C6B8`, mint `#CDEBD3` |
| Timber and roofs | timber `#6B4A3A`, terracotta `#D9663F`, slate blue `#6C7FA8`, moss `#7F9F5A` |
| Bunting (matches the town) | `#E8574A` `#FFD45C` `#4AA3DF` `#3FB68B` `#F58A6B` `#8A6BD1` |
| Brass | `#F2B33D`, highlight `#FFE7A3` |
| Ink and outline | deep plum `#2B1D3A`; shadows tinted lilac `#6E5A9E` |
| Bean gas | core `#8FD14F`, rim `#D4F58A`, deep `#5E9E2E` |
| Fizzy gas | pink `#FF8FC8`, bubble blue `#9FE3FF` |
| Cabbage gas | purple `#9B7BD6`, sour green `#B7E36A` |
| Golden gas | `#FFD24A`, sparkle `#FFF3B0` |
| UI | cream panel `#FFF7E6`, plum text `#2B1D3A`, tomato accent `#E8574A`, bean green `#6FBF3B` |

**Lighting:**
- Day: warm key light `#FFE6B8` at about 40 degrees elevation for long, soft shadows; hemisphere light sky `#CFEFFF`, ground `#8A76B8` so shadows read lilac, not grey. Slight warm horizon fog to soften distance and hide the edge.
- Night (the shared 24-minute clock): moonlight `#9DB4FF` at 0.5, paper lanterns on the bunting, fairy lights round the bandstand, glowing cottage windows, lamp light pools on the paths (`lightPoolTexture`). **Toots glow in the dark** at night (emissive clouds), which kids will love and which keeps clouds readable.
- One shadow-casting light only. Point lights only on high tier at night (bandstand and tea garden).

**Materials:**
- Characters: `MeshToonMaterial` with a 3-step canvas gradient map, a fresnel rim (medium and high, via `onBeforeCompile`), and inverted-hull plum outlines (medium and high).
- Architecture: `MeshStandardMaterial`, roughness 0.8, vertex colours for baked ambient occlusion (darker at the base and under eaves), small repeating canvas textures for brick, timber, tiles and cobbles.
- Brass (tuba, bell, weathercock): standard material, metalness 0.6, warm emissive tint so bloom catches it.
- Clouds: a custom toon puff shader (two light bands, bright rim, per-instance colour and fade, a slow vertex "boil").

**Silhouettes and landmarks** (each readable from anywhere, for orientation): the striped hot-air balloon (centre, 15 m), the leaning bell tower with an onion cap (north-west, 17 m), the library's columned front with "SILENCE" on the pediment (north-east), the octagonal bandstand with a striped canopy (west), the windmill weathervane (far west), the giant bean-can sign over Gran's stall (south, by the arrival).

**Characters** (taller than the player, about 1.9 to 2.1 m, so you feel small and mischievous; built from rounded parts like the avatar):
- **Mayor Pemberton:** pear-shaped, tall black top hat with a gold band, red sash, walrus moustache, monocle.
- **Gran Butterworth:** round, bun hair, big glasses, yellow apron with beans on it. Runs the bean stall. Your biggest fan.
- **Lady Featherstone:** tall and thin, enormous purple feathered hat, pearls, always holding a teacup.
- **Mrs. Primrose:** short and round, flower hat and floral dress. Tea garden.
- **Grandpa Wimble:** flat cap, cardigan, big ears, usually asleep ("Bless you!" when a toot wakes him).
- **Mr. Fizzwhistle:** lanky, pink striped blazer, boater hat, squeaky voice. Pop cart.
- **Mr. Sprout:** stout, green overalls, straw hat, huge ginger beard. Veg stall.
- **Constable Bobbins:** dome helmet, whistle, big boots. Chases you after too much mischief.
- **Pip:** a small kid with a propeller beanie and a whoopee cushion. Giggles and copies your toots.
- **Ms. Hush:** the librarian. Beehive, cat-eye glasses, finger to her lips.
- **Maestro Oompah and the Puffington Brass Band:** conductor, tuba (a hero prop), trumpet, clarinet, drum.
- **Biscuit the pug:** tan with a black face. Perfect for taking the blame.
- Picnickers, ducks, a flock of pigeons.

Faces are a shared canvas atlas of eight expressions (neutral, gasp, pee-yew, laugh, angry, sleepy, suspicious, happy) on a face plane, so reactions read at a distance.

### Audio direction

**Music** (the kit sequencer, songs as data):
- **Village:** "Puffington March", an oompah brass-band march in B flat, 104 BPM, 2/4. Tuba bass on the beat, snare and cymbal on the off-beat, a clarinet melody, a trumpet countermelody, glockenspiel sparkles on high tier. It is diegetic: louder near the bandstand (gain 1.0 within 8 m, 0.35 at the far edge). At night the same tune plays softer, with less drums and a darker filter, like an evening serenade.
- **Library:** a tiptoe pizzicato in D minor, 84 BPM, triangle plucks and a bassoon walking bass, the clock tick as the hi-hat. A tension layer (accordion drone, heartbeat kick) fades in as your pressure passes 75%.
- **Rocket Rings:** a fast galop at 152 BPM.
- **Picnic Panic:** a breezy accordion waltz, 3/4, 132 BPM.
- **Brass Band Bash:** the trial songs themselves (section 3).
- **Stings:** results fanfare, sad trombone on a fail, "dun dun DUNNN" when someone is blamed.

**Signature sound: the toot synth.** Every toot is synthesised live, so it can be expressive: pitch, length and wobble follow what you ate and how long you hold. The recipe (WebAudio):
- Source: a sawtooth or square oscillator, 55 to 180 Hz, with a pitch glide (a small overshoot at the start for the "bwap", then sliding down) and a slow random wobble on `detune`.
- **Lip buzz:** amplitude modulation at 12 to 35 Hz through a pulse-shaped LFO. The buzz rate slows down at the end of the toot, which is what makes it sound like a sputter.
- Brass body: two parallel band-pass filters (300 to 500 Hz and 900 to 1400 Hz) and a low-pass to tame it.
- Air: band-passed noise at about a fifth of the level.
- Sub: a sine an octave down for big ones.
- The ending: a 40 ms gap and a tiny "pt" click. Long toots have a 30% chance of an afterthought 0.5 to 0.9 s later: one small high squeak. This is the funniest sound in the game; keep it rare.

| Gas or voice | Recipe |
| --- | --- |
| Beans tap | saw 95 to 70 Hz, 0.35 s, buzz 22 to 16 Hz, body at 420 Hz |
| Beans rocket | saw 120 to 60 Hz, 1.1 s, buzz 28 to 12 Hz, sub sine, slide whistle up 500 to 2000 Hz, noise whoosh |
| Fizzy | square blips 520 to 760 Hz, 70 ms each, a bubble pop on each |
| Cabbage | saw 70 to 55 Hz, 0.9 s, slow wobbly buzz 9 to 6 Hz, extra noise |
| Squeeze (silent) | just a quiet "pfffff" of band-passed noise and a faint high squeal |
| Empty | one sad "eep" |
| Voice: squeaky duck | pitch x4, formants 1.1 and 2.7 kHz, quacky envelope |
| Voice: kazoo | pitch x2.2, soft clipping, narrow band-pass at 1.2 kHz |
| Voice: trombone | slow glide, 5.5 Hz vibrato, a "wah" filter sweep |
| Voice: bike horn | two square tones a third apart, rubbery honk envelope |
| Voice: opera | formant vowel "ah" to "oh", 6 Hz vibrato, soprano pitch, short echo |
| Voice: golden toot | a brass triad with a filter swell, timpani thump and cymbal |

Voices are cosmetic timbres; the gas type still sets the articulation (beans long and brassy, fizzy short and rapid, cabbage slow and wobbly).

**Other signature sounds (all synthesised):** tummy rumble (60 Hz sine with a 7 Hz wobble plus swept noise), slide whistle for rockets, spring "boing" for bouncy canopies, the church bell (FM with inharmonic partials, 4 s decay), clock tick and BONG, radiator clank, teacup "tink", tin clatter, gnome "clonk", pigeon coos and wing flaps, the constable's whistle (2.8 kHz with a fast trill), splashes, bubbles. **Voices** are Animal-Crossing-style gibberish: per-character pitch, short syllables with random vowel formants. Gasps are an inhaled "hhuh" plus "oh!"; "Pee-yew!" is a high "pee" and a falling "yew"; giggles are four rising "hee"s.

**No sound is essential.** Every sound has a visual twin: toots pop comic lettering in the world ("TOOT!", "PARP!", "pip!", "PFFFFT", "KA-PARP!", "eep."), and noise in the library is drawn as rings on the floor.

---

## 2. Core loop and feel

### Moment to moment

**Eat, toot, fly, react, refill.** You walk to a stall and eat; your tummy gauge fills with that gas. Toots spend it: each one makes a sound, a cloud and a push. Push yourself up and around the village; push props over; startle and stink out the townsfolk. When the tummy runs low, you find food or follow puff crumbs (floating mini clouds that refill a little, laid along good routes like coins in a platformer).

**Mid loop (minutes):** tick off mischief on the village list (each earns a golden bean), find the trials, play them for golden beans and board times.

**Long loop (visits):** fill the bean jar to unlock toot voices and cloud styles at the Toot-o-Matic, get gold on every trial, climb the shared boards, race your own ghost.

### The gas tank

One tummy, one gas type at a time: **you are what you eat.** Eating sets the type and refills to 100. Kids get it instantly, and the gauge colour and icon always show what your next toot will do.

| Gas | Where | Feel | Best for |
| --- | --- | --- | --- |
| **Beans** (green, round puffs) | Gran's bean stall, bean tins on the rally route | Big, brassy, powerful | Rockets, double boosts, knocking things over |
| **Fizzy pop** (pink and blue bubbles) | Mr. Fizzwhistle's pop cart, cans on the rally route | Rapid squeaky blips | Fluttering, hovering, long glides |
| **Cabbage** (purple-green swirls with stink lines) | Mr. Sprout's veg stall | Slow, low, wobbly | Big lingering stink clouds that drift on the wind |

Shapes differ as well as colours (round puffs, bubbles, swirls), so the types read for colour-blind players.

### Moves and numbers

The engine's walk speed is 6 m/s, gravity 24 m/s^2, and a normal jump reaches 1.2 m. All toot moves below are designed against those numbers (heights are apex above take-off).

| Move | Input | Beans | Fizzy | Cabbage | Gas cost |
| --- | --- | --- | --- | --- | --- |
| **Toot hop** | Toot while standing on the ground | vy 6.0, 0.75 m | vy 5.0, 0.52 m | vy 4.5, 0.42 m | 8 |
| **Toot scoot** | Toot while walking or running | vy 4.4 plus a forward burst of 8 m/s fading over 0.25 s (about 2 m extra) | same, weaker burst | short burst, big cloud trail | 8 |
| **Air boost** | Toot or Jump in the air | vy = max(vy, 0) + 10, about +2.1 m; 2 per airtime | each tap vy = min(vy + 4, 5), no limit (flutter) | 1 per airtime, +1.0 m | 15 (fizzy 6 per tap) |
| **Big one (rocket)** | Stand still on the ground, hold Toot 0.35 to 1.0 s, release | vy 13 to 20, 3.5 to 8.3 m, ground shockwave | vy 10 to 15, 2.1 to 4.7 m | vy 9 to 13, plus a huge cloud ring | 25 + 15 x charge |
| **Hover** | Hold Toot in the air | sink at 1.0 m/s, about 3 s | rise gently (0.4 m/s) up to 3 m above where you started, walk speed x1.15, about 4.5 s | sink at 1.8 m/s, drops stink puffs (crop dusting) | 30, 22 or 18 per s |
| **Squeeze** (indoors only) | Hold Toot inside the library | silent, slow release, leaves a drifting cloud | same | same | 20 per s |

Reach checks, using these numbers: jump plus two bean boosts reaches about 5.4 m; a full rocket 8.3 m; a rocket from the bell tower balcony (9 m) reaches 17 m. So the whole vertical map is reachable, and the high spots need combinations, which is where the skill is.

**Bouncy canopies.** Market awnings, the bandstand canopy, the pop cart umbrella and the balloon are trampolines: falling onto one bounces you to vy = max(9, 0.8 x your landing speed), with a "boing" and a squash of the canvas. The balloon crown is a super bounce (vy 16, +5.3 m). This also solves an engine limit (section 7: you can't stand on overhangs), and it makes the town feel springy.

**Landing:** above 6 m you land with a pancake squash, a dust ring and an "oof" boing. No fall damage, ever.

**Rules that keep it readable:**
- A big one needs you standing still ("plant your feet"). Moving toots are scoots. The prompt always tells you which you'll get: "Toot" while moving, "Toot (hold for a big one)" while standing, "Toot boost (hold to hover)" in the air.
- In the air, a press fires immediately. On the ground while standing, a tap fires on release (at most 0.35 s later, which reads as comic anticipation, not lag). Jump is always instant for players who want a crisp hop.
- In the band trial every press fires instantly (no hold logic), so rhythm is exact.
- Empty tummy: a sad "eep", a tiny puff, the gauge flashes, and the prompt says "Find food".

### Toots push the world

Every toot is also an event with a position, a **noise radius** and a **push**:

| Toot | Noise radius | Push radius (props, pigeons, hats) |
| --- | --- | --- |
| Beans tap or boost | 12 m | 2.5 m |
| Beans rocket | 18 m | 4 m shockwave along the ground |
| Fizzy blip | 7 m | 1.5 m |
| Cabbage | 9 m | 1.8 m, plus the cloud |
| Hover | 8 m, continuous | under you, 1.5 m |
| Squeeze | silent | none |

Townsfolk in the noise radius react by distance: inside half the radius, a big double take (eyes pop, hop back, drop what they're holding); further out, they turn and look ("?"). Clouds carry **stink** (beans 0.5 for 4 s, fizzy 0.15 for 1.5 s, cabbage 1.0 for 12 s, squeeze 0.7 for 10 s), drift with the wind and grow. Anyone standing in enough stink sniffs, then says "Pee-yew!", waves a hand and walks out of it.

**Blame:** when someone notices a toot, they look for the culprit: the nearest visible person to where the toot came from (or to the cloud, for smells). If that's you, you get a glare and "Excuse you!". If it's Biscuit the pug or the Mayor, they get blamed instead ("Biscuit!"), with a dramatic sting. Framing someone is a skill: toot out of sight, or squeeze a cloud next to them and walk away.

### Controls for every input path

| Verb | Keyboard and mouse | Touch | Controller | TV remote |
| --- | --- | --- | --- | --- |
| Move | WASD or arrows | Floating stick | Left stick or d-pad | Arrows |
| Look | Drag, or J L I K | Drag on the right side | Right stick | None needed: the camera eases behind you; trials with a fixed camera (library) frame themselves |
| **Toot** | F always; E or Enter when nothing to use is nearby | **Toot** button (the Kick button, relabelled through `kickAction`); Action button when nothing to use is nearby | X always; A when nothing to use is nearby | **OK** |
| Big one | Hold F or E, standing still | Hold Toot | Hold X or A | Hold OK (or double-tap OK in tap mode) |
| Air boost | Space, F or E in the air | Jump or Toot in the air | Y, X or A in the air | OK in the air |
| Hover | Hold Space, F or E in the air | Hold Jump or Toot | Hold Y, X or A | Hold OK (tap mode: tap to start, tap to stop) |
| Jump | Space | Jump button | Y | Not needed: a toot hop does the job |
| Use (eat, start a trial, read the board, shelve a book) | E or Enter | Action button (labelled "Eat", "Start", "Read", "Shelve") | A | OK |
| Squeeze (library) | Hold F or E | Hold Toot | Hold X or A | Hold OK (tap mode toggles) |
| Change toot voice | Tab | At the Toot-o-Matic | LB or RB | At the Toot-o-Matic |
| Run | Shift | Push the stick fully | L3 | Not needed |
| Menu | Esc or P | Menu button | Start | Back |
| Dialogs and results cards | Arrows, Enter, mouse | Tap | D-pad, A, B | Arrows, OK, Back |

**The remote rule:** the whole game is playable with arrows and OK. OK is "use" when you're within range of something (ranges 1.4 to 1.8 m; every interactable sits off the main routes, at least 2 m from launch spots), otherwise it's "toot", and a toot hop replaces jump. Kick, jump, run and look are optional extras.

**Tap mode** (a setting on the programme board, default on for TV browsers until the hold behaviour is checked on the Samsung S90H): hover and squeeze toggle with a tap, and a double-tap while standing still fires a full big one.

---

## 3. Content and progression

### Modes

1. **The fete (free play):** the whole village sandbox, the mischief list, food, NPC routines, the Toot-o-Matic.
2. **Trials:** four challenges started at diegetic start pads, each with 3 golden beans and a shared board.
3. **The medal ceremony:** collect every golden bean and the Mayor (reluctantly) gives you a medal on the bandstand.

### Golden beans (the stars)

Golden beans are the stars: a jar on the HUD fills with them. The first release has **27**: 15 mischief beans and 3 for each of the four trials.

### The mischief list (15 beans)

A Goose-Game style list, written in the Mayor's fete programme. Each item is a short line and an icon.

| # | Mischief | Where and how |
| --- | --- | --- |
| 1 | Spill someone's tea | Lady Featherstone, queueing at Gran's stall, or the tea garden. Any big startle makes the cup fly. |
| 2 | Topple the tower of tins | 15 bean tins stacked by Gran's stall; one bean blast from the base brings them all down. |
| 3 | Pop the Mayor's hat off | A beans toot within 2 m of the Mayor, or a rocket next to him. The hat spins up and lands on someone else. |
| 4 | Scatter ten pigeons with one toot | The flock round the statue. |
| 5 | Make the fountain bubble | Stand in the fountain and toot. Giant bubbles, the ducks quack. |
| 6 | Do all three toots for Pip | A beans, a fizzy and a cabbage toot near Pip. He shouts "Again!". |
| 7 | Blow the washing off the line | The washing line between two east rooftops at 7 m. Rocket up, toot at it; the clothes flutter down onto people. |
| 8 | Ring the bell | Get up the bell tower (rocket to the balcony, then up to the belfry) and toot at the bell. BONG across the village. |
| 9 | Bounce on top of the balloon | Glide from the bell tower or a rooftop and land on the crown. |
| 10 | Get Biscuit the blame | Someone notices a toot and blames the pug. |
| 11 | Make someone blame the Mayor | The same, with the Mayor. |
| 12 | Clear the tea garden with a stink | A cabbage cloud drifts over the tables and everyone leaves. |
| 13 | Toot along with the band | Four toots in a row on the beat near the bandstand. The tuba player nods. |
| 14 | Knock over all eight gnomes | Hidden in gardens and on two rooftops. |
| 15 | Escape from Constable Bobbins | Cause three incidents near him, then get away (out of sight for 8 s, or onto a roof: "Come down from there!"). |

### Trials (12 beans)

Each trial: a start pad with a pictogram sign and a board billboard, a host character, a 3-2-1-TOOT countdown, a timer bar, a results card (Play again, Next trial, Back to the fete). The trial pauses with the menu (`holdsTime`).

**Rocket Rings** (host: Mr. Fizzwhistle with a chequered flag). A sky rally through 12 gold hoops around the village, in order. The next hoop glows with a beacon and an edge-of-screen arrow; the rest are dim. Puff crumbs along the route keep you topped up; a bean tin on the statue plinth and a fizzy can on the belfry roof switch your gas mid-route (bean power for the climb, fizzy for the long glide).
- Route (x, height, z): R1 (6, 2.2, -2) jump and boost; R2 (8, 3.5, -9) hop off the sentry hut; R3 (3, 4, -15) beside the statue; R4 (-6, 6, -20); R5 (-16, 8.5, -21) up to the bell tower balcony; R6 (-21, 14, -17) rocket from the balcony; R7 (-14, 10, -10) fizzy glide down; R8 (-13, 5.5, -6) bounce off the bandstand canopy up through it; R9 (-8, 7, 2); R10 (-6.5, 11, -1) beside the balloon envelope; R11 (0, 16.5, -1) super bounce on the balloon crown; R12 (4, 3, 4) dive to the finish.
- Golden beans: finish; under 70 s; under 48 s. Board: fastest time. Your best run replays as a translucent green ghost (positions at 10 Hz, kept on this device).

**Shh! The Library** (host: Ms. Hush; opens at 5 golden beans: "Closed for lunch" sign until then). A stealth trial. You have five overdue books to shelve in 150 s, and you had beans for lunch: your pressure gauge rises (1.2% per second, with telegraphed rumbles of +10%). At 100% the big one escapes on its own.
- **Release options:** a loud toot (-20% pressure) makes a noise ring (10 m, reduced 35% by each shelf in the way); a **masked** toot during a loud noise is silent and releases more (-30%); a **squeeze** (hold) is silent but leaves a cloud that drifts on the breeze from the open window and swirls under the ceiling fans.
- **Masking noises,** each telegraphed so you can time it: the grandfather clock BONG every 15 s (the pendulum winds up), the radiator clank every 9 to 12 s (it shudders first), the sneezing reader ("ah... ah... CHOO", 1.5 s build-up), Mr. Dozer's snores, Ms. Hush's date stamp THUNK at the desk, and the squeaky book cart she pushes (masking right next to the most dangerous person).
- **Detection:** readers hear noise and turn; if you're in their view cone (70 degrees, 9 m, blocked by shelves) you're caught. If they can't see you, they get up and investigate where the noise came from. Smell: a cloud reaching a reader makes them sniff and blame the nearest visible person. Framing Biscuit (asleep on a cushion) or Mr. Dozer earns a bonus.
- **Score:** 200 per book, 50 per masked toot (+25 if perfectly timed), 100 per framing, 3 per second left once all books are shelved, -150 per strike. Three strikes and you're shown the door (sad trombone). Caps for validation: 10 masked toots and 3 framings count, so the maximum is 2500.
- Golden beans: shelve all five; 1300 points; 1800 points with no strikes. Board: highest score.

**Brass Band Bash** (host: Maestro Oompah). One-button rhythm on the bandstand: your toots play the tuba part, **in tune** (each note in the chart carries a pitch, and the toot synth plays it in your voice).
- Cues are diegetic first: the Maestro points his baton at you when it's your note, and the music leaves a gap for you. A scrolling sheet-music strip in the HUD shows the same notes for readability.
- Note types: tap notes, hold notes (hold to the end of the tail), rests (the Maestro's palm is up: don't toot), and call-and-response bars (the trumpet plays a rhythm, you echo it).
- Judging: Perfect within 50 ms, Good within 110 ms (remote: 70 ms and 140 ms). Perfect 100, Good 50, held notes 10 per beat, combo x1.5 from 10 and x2 from 25.
- Songs: "Puffington March" (96 BPM, easy, about 50 s) and "Polka Dots" (120 BPM, medium, about 55 s; unlocks with your first bean in the march).
- A latency check on the bandstand ("Toot with the drum" eight times; the median sets your offset) runs automatically on the first visit and is in the board's settings tab. TVs need it.
- Golden beans: per song track, 60%, 80% and 95% accuracy. The first release counts the march's three beans toward the 27; Polka Dots has its own board and is a bonus. Board: high score per song.

**Picnic Panic** (host: Mr. Sprout: "They're sitting on my prize lawn!"; opens the first time you eat cabbage). Clear 12 picnickers off 8 blankets in the park within 90 s using cabbage clouds and the wind.
- The wind (1.2 m/s) changes direction every 20 s. A weathervane, streaming leaves, bunting and a HUD arrow show it, and it wobbles 3 s before it changes.
- Each picnicker has a whiff meter (a bubble above their head); full means they pack the basket and run off yelling "Pee-yew!".
- Twists: Grandpa with a peg on his nose needs twice the stink; a family behind a big umbrella can only be reached from the side or from above (cabbage hover crop dusting).
- Golden beans: clear them all; under 60 s; under 40 s. Board: fastest clear.

### Difficulty curve

- **Minute 1 to 10:** free play teaches every verb through the world (section 4). Mischief items 1 to 6 are reachable at ground level and with a single boost.
- **Rocket Rings** and the **Brass Band** march are open from the start and are forgiving at bronze.
- **Picnic Panic** opens when you discover cabbage; it teaches wind and clouds, which the library needs.
- **The library** opens at 5 beans, once you know toots, clouds and blame.
- Gold targets ask for real skill: double boosts at apex, a glide line through the bell tower section, perfect masking in the library, 95% in the band.
- After gold: hidden **platinum** times appear on the boards ("Gran's time": Rings 38 s, Picnic 30 s), with a sparkly ghost of Gran Butterworth on her mobility scooter to race. Platinum earns a cosmetic, not a bean.

### Unlocks (the Toot-o-Matic)

A brass phonograph kiosk on the green. Choose your toot voice and cloud style; previews play in the world in front of it.

| Beans | Unlock |
| --- | --- |
| 0 | Classic toot, classic clouds |
| 2 | Squeaky duck voice |
| 4 | Rainbow clouds |
| 7 | Kazoo voice |
| 10 | Bubble clouds |
| 13 | Trombone voice |
| 16 | Glitter clouds |
| 19 | Bike horn voice |
| 22 | Heart clouds |
| 25 | Opera voice |
| 27 | **The golden toot** (voice and cloud) and the medal ceremony: the band plays a fanfare, confetti, and the Mayor pins a medal on you while trying to keep a straight face |

### Saves and boards

- **This device:** `localStorage` key `toyboxes.fart.v1:<roomId>:<areaId>` holds which beans you have, personal bests per trial, your rings ghost, equipped voice and cloud, tap mode, rhythm offset and whether you've seen the intro. Versioned, with a migration test.
- **Shared boards** (server validated, through the kit's generic scores): "Fastest rally" (Rocket Rings, lower is better), "Quietest librarian" (library, higher), "Top tooter: Puffington March" and "Top tooter: Polka Dots" (band, higher), "Fastest picnic" (Picnic Panic, lower). Billboards at each start pad show the top 8 and your best.

### The first 5 minutes

| Time | What happens |
| --- | --- |
| 0:00 | First visit only: a 7 s flyover (skippable with any button) over the fete as the band plays. The Mayor's speech bubble: "Welcome to the Summer Fete. Strictly no funny business." The camera lands behind you; your tummy rumbles. |
| 0:10 | You're at the south gate. Straight ahead, the lane opens onto the fete and the balloon. On the right, Gran waves: "Free beans, dearie!". The prompt says "Eat beans". |
| 0:20 | Eat: the tummy gauge slides in and fills green, a rumble (vibration on phones and pads). The prompt changes to "Toot". |
| 0:25 | First toot. PARP, a green cloud, a hop. Lady Featherstone, two metres away in the queue, double-takes and her teacup flies. Gran: "That's my beans!". The mischief notebook flies in, ticks "Spill someone's tea", and a golden bean arcs into the jar. |
| 0:40 | A sparkly trail of puff crumbs leads over a 1.6 m hedge: a jump alone falls short, and the prompt in the air says "Toot boost". Over you go; crumbs pop with rising notes and refill you. |
| 1:30 | The trail leads past the pigeons (scatter!) to the maypole on the green, where a painted pad says "Big one here" with a picture. Stand, hold, shake, KA-PARP: 8 m up, the whole village spread out below. Land on the maypole top. |
| 3:00 | From up there you spot the pink pop cart. Fizzy pop: flutter and hover. Pip giggles and copies your toots with his whoopee cushion. |
| 4:00 | The Rocket Rings pad, with its board and chequered flag, catches your eye. 3-2-1-TOOT. |
| 5:00 | Finish: 1 or 2 beans. The jar passes 2: "New toot voice: squeaky duck. Try it at the Toot-o-Matic." |

### The 30th visit

No intro. The jar says 24 of 27. The notebook chip says what's left: "Make someone blame the Mayor", gold in Picnic Panic. You equip the opera voice and glitter clouds because they make you laugh. You're 3rd on "Fastest rally" with 41.2 s, so you race your own ghost for ten minutes and take 2nd. You try platinum against Gran's ghost. Then you just fly to the bell tower, ring it, glide onto the balloon and bounce, because flying around this town still feels good. The Polka Dots board is the long tail for rhythm players.

---

## 4. Onboarding

No walls of text. Everything is taught by placement, prompts, pictures and reactions.

- **One thing at a time:** at arrival the only lit, waving, labelled thing is Gran's stall, 9 m away on the path you're already facing.
- **The prompt pill is the tutorial.** It always names what the button does right now: "Eat beans", "Toot", "Toot (hold for a big one)", "Toot boost (hold to hover)", "Find food". The engine's prompt shows the right glyph per device.
- **Puff crumbs teach routes**, like coins in a platformer: a crumb trail traces the arc of a boost over the hedge, straight up the maypole, along the glide line from the bell tower to the balloon. Crumbs refill gas, so following them is rewarding as well as instructive.
- **Pictogram signs** at the maypole and each trial pad: three panels (stand still, hold, whoosh). One short subtitle at most.
- **Demonstration by characters:** Pip copies your toots and then shows off one move you haven't used yet (a fizzy hover, a boost) with his whoopee cushion. Trial hosts act out the rule once: Ms. Hush puts a finger to her lips and points at the clock as it BONGs; the Maestro points his baton at you on the first note.
- **Failure teaches:** the first time a reader hears you in the library, time freezes for 0.6 s and the noise ring is shown reaching them, with a picture of the clock: wait for the BONG. The first time you run out of gas mid-air, the empty gauge shakes and the nearest food stall gets a sparkle for 5 s.
- **The kit intro card** shows once per trial (two short lines and a picture), and never again unless you ask the programme board.
- **The programme board** by the path is the reference: Mischief (ticked items, hints), Trials (beans and bests), The jar (next unlock), Settings (tap mode, rhythm check, camera shake). Optional; nobody has to read it.

---

## 5. Juice list

| Event | VFX | SFX | Camera | HUD |
| --- | --- | --- | --- | --- |
| Eat | Head-bob chewing (squash pulses), crumbs | "Nom nom nom" blips; the stall keeper's line | 3% push-in | Gauge slides in, fills with rising bubbles, food icon pops |
| Tummy rumble (after eating, above 80%) | Belly squash pulses | Low "grrrbl" | None | Gauge shakes; pad and phone vibrate 80 ms |
| Toot tap | Squash 0.85 then stretch 1.1 over 120 ms; 6 to 10 puffs from behind at hip height; comic word pops with overshoot and floats up; dust ring if grounded | Gas-type toot, occasional afterthought | 0.05 shake | Gauge ticks down with a splash |
| Scoot | Speed puffs trail, avatar leans forward | Shorter, higher toot | Small FOV kick (+2 degrees) | |
| Air boost | A ring of puffs expanding under you (double-jump ring) | Bigger toot | +3 degree FOV kick for 200 ms | |
| Big one charging | Avatar shakes harder and harder, cheeks puff, a ring fills at your feet (turns gold when full), little leaks ("pt... pt...") | Rising slide whistle and a rattle; a ding at full charge | Eases lower and 1 m back (anticipation) | Gauge shows the cost segment flashing |
| Big one release | A tall fountain of cloud, a shockwave ring across the ground that knocks props, "KA-PARP!", stretch to 1.3 then a somersault at the top | Rocket toot, slide whistle up, whoosh | 0.25 shake, +8 degree FOV kick | Gauge drains with a big splash |
| Hover | Continuous puffs under you, legs paddle | Sustained toot with vibrato, pitch sinking as the gas runs down, ending in "pt pt pfft" | | Gauge drains smoothly; flashes under 15% |
| Out of gas | One tiny sad puff | "Eep." | | Gauge flashes, icon blinks, prompt "Find food" |
| Bounce on a canopy | Canvas squashes and wobbles, small star burst | Spring "boing", pitch by bounce height | Small dip | |
| Big landing | Pancake squash, dust ring | Boing or thud by height, "oof" | Dip | |
| Prop knocked over | Topple with spin, dust; chain reactions | Material sounds (tin ring, porcelain tink, gnome clonk, wood thock), rising pitch in a chain | Shake by size | Combo count pops for chains of 3 or more |
| Townsfolk startled | 0.3 s pause, then a double take: eyes pop, hop back, held item flies (teacup arcs and lands with a puff of steam, never liquid) | Gasp in their voice, speech bubble "Oh!" or "Excuse you!" | | |
| Townsfolk smell it | Sniff, nose twitch, "?" then the pee-yew face, hand wave, wavy stink lines above them, they walk out of the cloud | "Pee-yew!" | | |
| Blame | The blamer points; "!" over the blamed; Biscuit's ears droop | "Biscuit!" and "dun dun DUNNN" | Quick 0.4 s zoom on the blamed (off with reduce motion) | "Framed!" toast |
| Pigeons scatter | Flock bursts up, feathers, circles and lands again after 6 s | Wing flaps, coos | | "10 pigeons!" pop when it counts |
| Mischief done | A golden bean flies from the spot to the jar | Pen scribble, ding-ding, crowd "ooh" | | Notebook slides in, the item gets a big tick, then tucks into the corner chip |
| Unlock | The Toot-o-Matic lights up and toots the new voice | New voice preview | | Toast with the unlock |
| Countdown | Host gestures, bunting flutters | Beeps, then "TOOT!" on GO (in your voice) | Short cinematic onto the start pad | Kit 3-2-1 banner |
| Ring passed | Hoop flashes, spins and shrinks; next hoop's beacon pulses | Chime climbing a major scale per ring | | Split versus your best (green or red), ring count |
| Rally finish | Confetti, Mr. Fizzwhistle waves the flag | Fanfare | Podium-style cinematic | Time, "New best!" |
| Library noise | An expanding ring on the floor (the visual twin of the sound) | Your toot | | Noise meter flashes |
| Masked toot | Your comic word appears tiny, hidden behind the giant "BONG" | BONG covers it | | "Masked!" stamp (+50), "Perfect!" for tight timing |
| Caught | Time freezes 0.6 s; the reader's face fills a small zoom, "!" | "SHHH!" | Quick zoom (off with reduce motion) | A strike stamped in the corner |
| Pressure overflow | All the books blow off the shelves, everyone's hair blows back | The longest toot in the game | Big shake | Fail card |
| Band note | Your toot in tune; Perfect sparkles gold on the bandstand, the crowd bobs | The note itself | | "Perfect" or "Good" pop, combo counter |
| Band miss | The tuba player raises an eyebrow | A flat "bonk" | | Combo breaks |
| Band combo 10, 25, 50 | Spotlight, then confetti | Crowd cheer | | Milestone pop |
| Picnicker cleared | Basket snaps shut, they run off | "Pee-yew!" | | Icon crossed off |
| Wind change | Weathervane spins, gust of leaves, bunting snaps | Whoosh | | Wind arrow rotates |
| Constable chase | "!" over his helmet, dust as he runs | Whistle, a snare roll layer | | "Run!" toast |
| Results | Beans pop into the jar one by one; hosts cheer or sulk | Ascending chimes, fanfare at three | Kit podium shot | Kit results card |

Reduce motion (the engine's `reduce-motion` class on the root element) turns off shake, FOV kicks and zooms.

---

## 6. World layout

Coordinates in metres. x is east, z is south (yaw 0 faces +z, so facing north is yaw pi). The playable village is 64 x 64 m (x and z from -32 to 32), compact and dense: walking corner to corner takes about 10 s, flying is faster. Ground is y = 0 everywhere.

### Plan

```
 z=-32  .  .  .  .  .  .  .  .  hedge ring, tall trees and hills beyond  .  .  .  .  .  .  .  .
        [Cottage C  ]           [Cottage D  ]
        (-6,-27) h6            (7,-27) h5.5           LIBRARY  x13..25, z-23.5..-14.5, h7
  BELL TOWER (-21,-21)                                "SILENCE" pediment, door (19,-14.5)
  base 4x4 h9, belfry 2.2x2.2 h13,     FOUNTAIN r3.6 + STATUE (0,-15)
  spire perch h17                       plinth h2.4, top hat h4.6
                                                             SENTRY HUT (11,-8) h2.8
        BANDSTAND (-13,-6) r4.2
        canopy bouncy at 4.6                  BALLOON (0,-1)              POP CART (14,3)
                                              basket h1.2, crown 15.2     umbrella bouncy 2.6
 WINDMILL (-27,3) h6        MAYPOLE (-5,3) h7      RINGS PAD (6,5)        crates (16,1.5) h2
                                   THE GREEN r13
 SPROUT'S STALL (-17,9)                         TOOT-O-MATIC (6.5,10)     TOWNHOUSE A (25,6) h6.5
 PICNIC PARK            PROGRAMME BOARD (-4.5,11.5)                        washing line at 7 m
 x-31..-16, z-2..22     hedge z12.5 x-14..-3  | gap |  hedge x3..14        TOWNHOUSE B (25,17) h7.5
 8 blankets             TEA GARDEN (-6.5,17)     LANE    GRAN'S BEANS (4.5,18.5)
 DUCK POND (-25,15) r4  TEA ROOM (-11,22) h4.5   x-3..3   tins (4.5,21), sign pole h5
                                     EXIT GATE (-3.6,23.5)   ARRIVAL (0,26) facing north
 z=+32  .  .  .  .  .  .  .  .  .  .  .  .  .  lane runs on south to z 33 (camera room)  .  .
```

### Zones, landmarks and colliders

| Zone | Contents | Colliders (box or circle, top height) |
| --- | --- | --- |
| **South lane and gate** | Arrival (0, 26), yaw pi. Lane x -3 to 3 between 1.6 m hedges, z 22 to 33. "Welcome to Little Puffington" arch over the lane at z 24.5 (two posts, a sign high above). **Exit:** a garden arch in the west hedge at (-3.6, 23.5) facing east, sign "Back to jessica's room"; `door` spot (-2.6, 23.5), range 1.7, 3.6 m from the arrival so it never triggers on arrival. | Lane hedges: boxes h 1.6 (below the camera ray). Arch posts: circles r 0.25 h 3.2, at x plus and minus 3.2, outside the camera ray. |
| **Gran's bean stall** | Counter 3.6 x 1.4 facing the lane, front at x 2.7; Gran behind it. Eat spot (2.2, 18.5). Lady Featherstone queueing with a teacup at (2.0, 16.6). Tin pyramid on a side table at (4.5, 21). Bean-can sign on a pole at (6.6, 18.5). | Counter box h 1.1 (standable). Awning: bouncy at 2.5 m (no collider). Tin table box h 0.8. Sign pole circle r 0.35 h 4.8 (a perch). |
| **Tea garden and tea room** | Three tables at (-5, 16), (-8, 15), (-7, 19) with Mrs. Primrose and Grandpa Wimble; the Prim Teacup tea room at (-11, 22), 6 x 5, flat roof terrace with a parapet and a gnome. | Tables circles r 0.6 h 0.8. Tea room box h 4.5 (standable roof). |
| **Training hedge** | z 12.5, from x -14 to -3 and 3 to 14, 1.6 m tall, 0.8 m thick; open gap at x -3 to 3. Crumb arc over it at x 8: (8, 1.0, 14), (8, 2.2, 12.5), (8, 1.5, 11). | Boxes h 1.6 (a plain jump can't clear it; a jump and boost can). |
| **The green** | Grass circle r 13 at the origin. Programme board (-4.5, 11.5) facing south. Toot-o-Matic kiosk (6.5, 10). **Maypole** (-5, 3) with ribbons and a painted "Big one here" pad round it. **Rocket Rings pad** (6, 5) with a board billboard and chequered flag. Pigeons gather here and at the statue. | Maypole circle r 0.35 h 7 (perch). Kiosk box 1.2 x 1.2 h 2.4. Board posts circles r 0.15 h 3. |
| **Balloon** | Tethered at (0, -1): basket r 1.3 rim at 1.2 m, burner pole and rope bundle up the middle, envelope centred 11 m up, radius 4.2 (bottom 6.8, crown 15.2), red and cream stripes. | Basket circle r 1.3 h 1.2; central pole circle r 0.5 h 6.8 (inside the basket, so the column is hidden). Envelope: a sphere handled in `step()`: falling onto the top half bounces (crown super bounce), flying into the sides pushes you out with a soft boing. |
| **Fountain and statue** | Fountain at (0, -15): basin outer r 3.6, rim 0.6 m, water surface at 0.35 m (you can wade in). Statue of Sir Reginald Puffington: plinth r 1.0 h 2.4, top hat perch at 4.6 m. Ducks. | Rim: 16 boxes in a ring h 0.6. Plinth circle r 1.0 h 2.4. Statue column circle r 0.5 h 4.6. |
| **Bandstand** | Octagon at (-13, -6), r 4.2, floor at 0.6 m with low steps on the east side (6 steps of 0.1 m, under the engine's 0.12 m step), striped canopy, the band in a ring round a central lamp pillar. | Floor: circle r 4.2 h 0.6 (step boxes h 0.1 to 0.5). Centre pillar circle r 0.45 h 4.4. Eight posts circles r 0.15 h 4.4. Canopy bouncy at 4.6 m. |
| **Bell tower** | (-21, -21): base 4 x 4 to the balcony at 9 m (balustrade visual), clock face on the south side at 6 m, belfry 2.2 x 2.2 up to 13 m with open arches and the bell inside (11 to 12.5 m), onion cap and weathercock spire to 17 m. "Big one here" pad at its foot. | Base box h 9, belfry box h 13, spire circle r 0.3 h 17 (the highest perch). |
| **Library (outside)** | x 13 to 25, z -23.5 to -14.5, 7 m tall, columns as pilasters (flush, no porch overhang), "SILENCE" on the pediment, door at (19, -14.5) facing south, `Enter the library` spot (19, -13.6). Board billboard beside the door. | Box h 7 (standable roof, skylight visual). |
| **Sentry hut** | (11, -8), 1.6 x 1.6, Constable Bobbins' post. | Box h 2.8 (perch). |
| **Pop cart** | (14, 3), striped cart 2.4 x 1.2, big umbrella; bottle crates stacked at (16, 1.5). | Cart box h 1.2; umbrella bouncy at 2.6, r 1.6; crates box h 2.0. |
| **East townhouses** | A at (25, 6) 6 x 6, 6.5 m; B at (25, 17) 6 x 6, 7.5 m; tall, narrow, crooked, flat **rooftop gardens** with parapets, chimney pots, a gnome on B. Washing line from A's north edge to B's south edge at 7 m (span 5 m). | Boxes h 6.5 and 7.5 (standable); chimneys circles r 0.4 h 8 and 9. |
| **North cottages** | C (-6, -27) 7 x 5 h 6 and D (7, -27) 7 x 5 h 5.5, rooftop gardens, front gardens with gnomes. | Boxes. |
| **Picnic park** | x -31 to -16, z -2 to 22: 8 blankets, the windmill weathervane at (-27, 3) (sails turn above the top), Mr. Sprout's veg stall at (-17, 9) facing east with a cabbage pile, the duck pond at (-25, 15) r 4 (shallow, you wade, ducks paddle away). Board billboard by the stall. | Windmill circle r 1.2 h 6 (perch). Stall counter box h 1.1, awning bouncy 2.5. Blankets and pond: no colliders. |
| **Gnomes** | (21, 2), (28, 12), (22, 21), (-4, -22), (10, -23), (-26, -14), tea room roof (-11, 22, at 4.5 m), townhouse B roof (25, 17, at 7.5 m). | Knockable props (own sim), small circles while standing. |
| **Boundary** | A ring of tall hedges and trees at the edge (x or z about plus or minus 31.5), with rolling hills, far cottages and the haze beyond. | Boxes h 40 (no flying out), `blocksCamera: false` so the camera is never pushed in by the edge. |

**Camera rules for this layout:**
- The arrival has 7 m of clear space behind it (the lane runs on to z 33) and nothing taller than 1.6 m within 4 m of the camera ray, so the opening shot is the classic third-person view down the lane to the balloon. (The current build fails this.)
- Big buildings block the camera normally (the engine lifts over them). Thin things (posts, poles, the maypole, hedges, the boundary) never block it.
- High perches: the camera follows height already (`follow().height` adds the player's y); when you're above 4 m the kit camera adds 1.5 m of distance so you can see the village below.

**Sight lines from the arrival (looking north):** centre, the lane frames the gap, the green and the balloon (15 m, highest thing in view); left, the bell tower's onion cap and the bandstand canopy; right, the library pediment and the pop cart umbrella; near right, Gran's stall and the giant bean can; near left, the tea garden and the exit arch.

### The library interior (an off-map set)

Built at origin (200, 0) in the same scene and hidden unless you're in it; going through the library door fades and teleports you in. The village group is hidden while you're inside (and the other way round), which halves the draw calls.

- Room: x 187 to 213, z -9 to 9 (26 x 18 m), walls 4.5 m. Entrance and exit at the south wall (200, 8.5); spot (200, 7.8) "Back to the fete".
- Ms. Hush's returns desk (200, 5.5), 4 x 1, h 1.1. Trial start is here.
- Shelves in the west half: four rows running north to south at x 190, 193.5, 197 and 200.5 (0.8 m deep, 2.6 m tall), each split by a cross aisle at z 0, aisles labelled A to E with coloured end caps. Five glowing book slots.
- Reading area in the east half: tables at (205, -4), (209, -4), (205, 2), (209, 2) (2.4 x 1.2, h 0.8), six readers (the sneezer at (209, 2)), Mr. Dozer in an armchair at (210.5, 6.5), Biscuit asleep on a cushion at (188.5, 6.5).
- Grandfather clock on the north wall (200, -8.6); radiators on the east wall at (212.6, -3) and (212.6, 4); an open window at (213, 0) with a breeze blowing west; ceiling fans over (195, 0) and (206, 0) swirl clouds.
- Ms. Hush's patrol: a 40 s loop from the desk, past the tables, along the north wall, down an aisle and back, pushing a squeaky cart, stopping to stamp books.
- Colliders: walls boxes h 40, `blocksCamera: false`; shelves boxes h 2.6, `blocksCamera: false`; tables circles or boxes h 0.8.
- Camera: the kit camera override holds a high stealth view (pitch about 0.95 rad, distance 11, fixed from the south) so view cones and noise rings read clearly; the south wall fades through `cutaway()`.

---

## 7. Technical plan

### Engine facts verified for this design

Checked in the code and by probing the running dev build on port 5214 (scripts in `/tmp/toyboxes-worlds/fart/`):

- Colliders are columns from the floor to `h`. You can stand on any top no higher than your feet plus 0.12 m: a probe stood the player on a 9 m column. **There are no floating platforms or overhangs**, which is why canopies are bouncy and roofs are flat gardens.
- `gravity()` is read every substep. A probe returning -4 for 150 ms lifted the player 6.7 m from the ground, so vertical propulsion works today without engine changes (the fallback).
- The engine only takes a jump press while grounded; a second Space press in the air was left for the space's `step()` to take (seen by a probe).
- Holding Enter keeps `interact` held in `Input`; touch buttons hold the same way.
- `ExperienceCtx` currently has no input access, no teleport and no way to set the player's velocity; `PlayerState` has no height. The additions below fix that.
- The current build's arrival camera is pushed to top-down by a 10 m camera-blocking wall 3 m behind it.

### Engine additions (small, general, reusable by other worlds)

| # | Addition | Size | Why | Fallback if declined |
| --- | --- | --- | --- | --- |
| E1 | `ExperienceCtx.input`: `held(a)`, `take(a)` for interact, kick and jump, plus `device` | about 10 lines | Hold to charge and hover, air boosts on Jump, instant toots in rhythm | Hold logic through `actions()` presses only; no hover on hold (tap mode everywhere) |
| E2 | `ExperienceCtx.teleport(x, z, yaw)` (wraps `placePlayer` and the camera snap) | about 5 lines | The library set, trial starts, "Next trial" | Library built inside the village footprint (worse performance and camera) |
| E3 | `PlayerState` gains `y`, `vy`, `grounded` | about 3 lines | Bounces, perches, hover, ring crossings, stealth | Track an estimate inside the space |
| E4 | `SpaceView.motion?(h, player)` returning `{ vy?, push?: {x, z}, speed? }`, applied in the walking substep before gravity | about 20 lines | Rockets, boosts, scoots, hover, canopy bounces, balloon push-out | Vertical only, through `gravity()` (verified); no scoot or glide speed |
| E5 | `SpaceView.avatarFx?()` returning `{ squash, shake, spin }`, applied by `Avatar` to its rig | about 25 lines | Squash and stretch, the charging shake, the somersault: most of the game feel | Clouds and words only |
| E6 | Export the audio context and master bus from `sfx.ts` (or the kit music module) | about 5 lines | The toot synth shares volume, unlock and suspend | Its own context (double volume handling, iOS unlock issues) |
| E7 (nice) | `SpaceView.groundAt?(x, z, y)`, a height field merged into `groundHeight` | about 15 lines | Walkable sloped roofs and hills | Flat tops only (the must-have design) |

Kit requests: an FOV kick and a distance offset in the camera module (both respecting reduce motion), a countdown with a custom GO word ("TOOT!"), a results card with a custom star icon (golden beans), the audio clock for the band, per-mode board validation with an optional server start ticket.

### Modules and files

```
src/experiences/fart/
  index.ts            FartSimulator: implements SpaceView, owns the scene, modes, hooks, debug
  fart.css            tummy gauge, notebook chip, jar, rhythm strip, library meters (imported from index.ts)
  palette.ts          colours, gradient map, toon and outline materials, cloud shader
  textures.ts         canvas textures: signs, face atlas, word atlas, bunting, bricks, tiles, book spines
  layout.ts           the village as data: boxes, circles, canopies, perches, spots (pure, testable)
  village.ts          builds layout.ts into batched meshes and colliders, landmarks, day and night
  library-set.ts      the library interior set at (200, 0)
  people.ts           instanced character rig (parts, faces, outlines) and animation
  pigeons.ts          instanced flock rendering
  clouds-fx.ts        instanced puff rendering, stink lines, comic words
  hud.ts              DOM HUD built on the kit hud pieces
  toots.ts            the toot synth, voices, NPC gibberish, environment sounds
  songs.ts            songs as data for the kit sequencer
  dialogs.ts          programme board and Toot-o-Matic panels through UI.open
  sim/                pure logic, no three.js, deterministic with a seeded RNG
    rng.ts            mulberry32
    gas.ts            foods, tank, costs, move impulses (hop, scoot, boost, rocket, hover, squeeze)
    clouds.ts         cloud volumes: drift, growth, decay, stink sampling, wind and fan fields
    props.ts          knockables: tins, cups, gnomes, laundry, hats; topple and chains
    people.ts         townsfolk brains: routines, hearing, sight, smell, reactions, blame, chase
    flock.ts          pigeon states
    mischief.ts       the 15 mischief rules over the event stream
    rings.ts          course data, swept hoop crossing, splits
    library.ts        pressure, masking schedule, detection, score
    band.ts           chart playback, judging, combo, calibration
    picnic.ts         whiff meters, wind schedule, clears
    progress.ts       local save, versions, unlocks
  modes/              trial controllers: rings.ts, library.ts, band.ts, picnic.ts (start, step, end, hud)
src/shared/fart/
  boards.ts           board modes and validation rules (imported by the server)
  charts.ts           band charts (the server needs their maximum scores)
  course.ts           ring positions (the server needs the minimum time)
```

The old `src/shared/fart.ts`, `tests/fart.test.ts` and `scripts/farttest.ts` are replaced. `game.ts` keeps constructing `new FartSimulator(ctx)` from the new folder; the kind (`fart`) and model, schema and admin entries stay as they are.

### How it uses the SpaceView hooks

| Hook | Use |
| --- | --- |
| `actions(player)` | Context uses (eat, start a trial, read the programme, Toot-o-Matic, enter or leave the library, shelve a book) with small ranges. When none is in range, one "Toot" action at the player's own spot, with a label that says what you'll get. |
| `kickAction(player)` | Always `{ label: 'Toot' }` on foot, so the touch Kick button reads "Toot" and F and pad X always toot. |
| `step(h, player)` | All sims at the engine's fixed substep: gas and moves, clouds, props, people, pigeons, trials. Reads held input (E1), takes air jump presses. |
| `motion` (E4) | Applies the move impulses, hover targets, bounces and balloon push-out. |
| `gravity()` | 1 normally; the fallback for vertical moves if E4 isn't there. |
| `extraColliders()` | Walking townsfolk (circles), the constable, the book cart, standing gnomes. |
| `holdsTime()` | True during a trial countdown or run, so the menu pauses it. Free play keeps running. |
| `setQuality(tier)` | Outlines, shadow frustum, cloud and particle budgets, picnicker count, post-processing chain. |
| `render()` | Kit post (bloom, vignette, grade) on medium and high; returns false on low (plain render). |
| `update(night, t, phase, focus)` | Animation, day and night (lanterns, glowing clouds), music gain by distance from the bandstand, HUD. |
| `cutaway(cam)` | Fades the library's south wall and any shelf end between camera and player. |
| `dispose()` | Frees everything, stops voices and music, removes the HUD. |
| `debugInfo()` and debug methods | Section below. |

### Performance budget per tier

The engine sets render scale (low 0.6, medium 0.85, high 1) and shadow maps (none, 1024, 2048). This world adds:

| | Low (TV, older phones) | Medium (phones, auto on TV) | High (desktop) |
| --- | --- | --- | --- |
| Draw calls | 90 or fewer | 160 or fewer | 260 or fewer |
| Triangles | 120k | 300k | 600k |
| Lights | 1 directional, 1 hemisphere | same | same, plus 2 point lights at night |
| Shadows | None; instanced blob shadows under people and props | 1024, frustum 40 x 40 m following the player | 2048, same frustum |
| Outlines | None | Characters | Characters and hero props (tuba, bell, balloon) |
| Post | None | Half-resolution bloom (high threshold: lanterns, brass, gold, night clouds), vignette | Bloom, vignette, warm grade |
| Cloud puffs | 160 | 400 | 800 |
| People | Band 5, village 12, picnickers 4 (12 only in the trial) | All | All, with eye blinks and secondary motion |
| Extras | No flowers or fireflies | Flowers | Flowers, fireflies at night, confetti particles |

How it stays inside the budget:
- Static architecture is built from `layout.ts` and merged per material (like `arcades.ts`'s `Batch`): about 12 materials, so all buildings cost 15 to 25 draw calls.
- Instanced meshes for trees, bunting flags, fence posts, flowers, tins, cups, gnomes, books, picnic things, hoops, pigeons, puffs, comic words and blob shadows.
- **Characters are instanced by part:** one instanced mesh per part type (heads, torsos, arms, legs, hats, moustaches) across all townsfolk, with per-instance colour, and one instanced face mesh whose atlas cell is an instance attribute. About 12 draw calls for every person in the village (24 with outlines), animated by updating a few hundred matrices per frame.
- Only one of village or library is visible at a time.
- `debugInfo()` reports `renderer.info` draw calls and triangles so the playtest can assert the budget per tier, alongside the engine's fps and p75.

### Procedural geometry and textures only

Everything is built from primitives (rounded boxes, cylinders, spheres, lathes for the balloon, tins and bell, tubes for ropes and the tuba) and canvas textures painted at load: brick, timber, roof tiles, cobbles, bunting, signs, the face and word atlases, book spines, the clock face, gradient maps. No asset files, no network assets, no fonts beyond the ones the game already loads.

### Z-fighting prevention

- Ground layers never share a plane: grass at 0, paths and the green's border at +0.02, picnic blankets and painted pads at +0.03, light pools and blob shadows at +0.04 (decals use `polygonOffset` -1/-2, `depthWrite: false` and a render order). Water sits 0.25 m inside its basin.
- Windows are recessed boxes, not planes on walls. Trims, sills and signs stand at least 0.02 m proud. Merged boxes are inset so no two faces coincide.
- Face planes on heads sit 0.012 m out with `polygonOffset`; outlines are back-face hulls, never coplanar.
- Shadow bias -0.0004 and normal bias 0.02 against acne.
- **A unit test runs over `layout.ts`** and fails on any two boxes with coplanar overlapping faces, and on any collider that blocks the arrival camera ray.
- The playtest records frames from a slow cinematic orbit (8 angles, day and night) to check for shimmer in motion.

### Server and score changes

- With the kit's generic boards: register five modes in `src/shared/fart/boards.ts`, keyed `<roomId>:<areaId>:<mode>`:

| Mode | Better | Valid range |
| --- | --- | --- |
| `rings` | lower | integer ms from the course minimum (computed in `course.ts` from hoop spacing at the fastest possible speed, about 24 s) to 600000 |
| `library` | higher | integer 0 to 2500 (the capped maximum) |
| `band-march`, `band-polka` | higher | integer 0 to the chart maximum from `charts.ts` |
| `picnic` | lower | integer ms 15000 to 90000 |

- If the kit supports start tickets: the server issues a ticket when a trial starts and rejects a submission when less wall time has passed than the claimed time (or the song length) minus 1.5 s.
- Rate limits like the galaxy's (10 submissions per minute per browser). Names follow `scorename:<bk>`, as today.
- If the kit's generic boards are late: add a `fart` action to `api/scores.ts` and `recordFart()` in `server/scores.ts` modelled on `recordFrenzy`, with the same rules imported from `src/shared/fart/boards.ts`, and extend `board()` and `clearScores()`.
- No model, content or schema changes: the experience kind stays `{ kind: 'fart' }`.

### Headless testability

**Deterministic sims.** Everything under `sim/` is pure TypeScript with a seeded RNG, stepped at the engine's fixed substep. The experience can fast-forward the same step function, so a test can run 90 s of Picnic Panic in milliseconds and get the same result every time.

**`debugInfo()`** returns: mode and phase; player (x, y, z, vy, grounded, max height this jump, boosts used, charge); gas (type, amount, hovering, last toot with kind, noise and position); cloud count; townsfolk (id, state, position, held item); props (tins, gnomes and laundry down); mischief done; beans; unlocks and equipped items; the trial (time, score, golden beans so far, next hoop, pressure, strikes, books, masked count, next masking event with its time, band song time and next note time, picnickers left, wind); draw calls, triangles and tier.

**Debug methods** (through `experienceCall`): `debugSkipIntro`, `debugGive(food)`, `debugSeed(n)`, `debugFastForward(seconds)`, `debugShortTrial(id, options)` (3 hoops, 2 books, an 8-note chart, 2 blankets), `debugSetWind(x, z)`, `debugUnlockAll`, `debugResetSave`.

**Playtest** (`scripts/farttest.ts`, rewritten; lines for desktop, `PHONE=1`, `PAD=1` and `REMOTE=1` in `scripts/autobuild/playtests.txt`). It uses teleport for positioning and real input for every action:
1. Enter the area through the room's door; the intro card appears; dismiss it with the device's confirm.
2. Eat at Gran's stall: gas is beans, 100.
3. Toot next to Lady Featherstone: her state is startled, the teacup is in the air, mischief 1 is done, the jar shows 1.
4. Jump (or a toot hop on the remote), then toot in the air: max height above 2.5 m. Clear the training hedge.
5. Stand on the maypole pad and hold for 0.9 s: max height above 6.5 m; land on the maypole top (grounded at 7 m).
6. Rocket Rings, short course: start with real input, pass 3 hoops, finish, the results card takes focus, "Play again" works with the device's confirm, and the board shows the time (memory store).
7. Library, short: wait for the next BONG and toot inside the window (masked 1); toot outside the window in a reader's view (strikes 1); hold to squeeze for 1 s (a cloud exists, noise 0); shelve a book.
8. Band, 8-note chart: presses scheduled from the next note time; at least 6 Perfect or Good; results.
9. Picnic, short: eat cabbage, toot upwind, fast-forward: cleared.
10. Toot-o-Matic: open the panel, move focus with the device (arrows, d-pad or tap), equip an unlocked voice, close with Back.
11. Leave through the exit arch with real input: back in the room.
12. Screenshots by day and night, and fps, p75, draw calls and triangles per tier (pinned low, medium and high, like `galaxytest.ts`), asserted against the budget.

`REMOTE=1` sends only arrows, Enter and Escape, and the test fails if any step needed another key. `PHONE=1` taps and holds the real touch buttons (pointer down, wait, pointer up on the Toot and Action buttons). `PAD=1` uses the injected standard gamepad (A, X, Y, d-pad).

**Unit tests** (vitest, `tests/fart/`):
- `gas`: food fills, costs, empty behaviour, crumbs.
- `moves`: integrate each move at 60 Hz with the engine's gravity: hop 0.75 m, boost +2.1 m, full rocket 8.3 m, hover times per gas, two bean boosts per airtime, canopy bounce heights.
- `clouds`: drift with wind and fans, growth, decay, stink sampling.
- `props`: topple thresholds; one hit at the base of the tin pyramid brings all 15 down; deterministic.
- `people`: hearing by distance, reaction levels, cooldowns, blame picks the nearest visible suspect, people leave clouds, the chase triggers and gives up.
- `library`: masking windows, shelf attenuation, view cones, pressure overflow, score and the 2500 cap.
- `band`: judging windows, holds, rests, combo, each chart's maximum (the same function the server uses).
- `rings`: swept crossing (a fast flight that jumps a hoop between steps still counts; flying round it doesn't), order, splits, course minimum.
- `picnic`: whiff accumulation, the peg-nose grandpa, umbrella blocking, wind schedule.
- `mischief`: each item fires from its event sequence, exactly once.
- `progress`: save and load, a version migration, unlock thresholds.
- `boards` (server): accepts and rejects per mode, rate limit, wrong area kind.
- `layout`: no coplanar overlaps, the arrival camera ray is clear, every interactable is reachable on foot, every perch and mischief spot is reachable with the move set.

Docs: update `docs/VERB_SHEET.md` (toot, boost, big one, hover, squeeze, eat, the four trials) and the "Built from sketchbook pages" table in `docs/ACCEPTANCE.md`.

---

## 8. Scope

### Must-have for the first release, in priority order

1. **Engine additions E1 to E6** and the toot synth with three gas types and the classic voice. Nothing else feels right without these.
2. **Core feel:** tank, hop, scoot, boost, big one, hover, bouncy canopies, landing, clouds, comic words, avatar squash and stretch, the juice for those rows.
3. **The village:** layout, landmarks, art pipeline (toon characters, batching, instanced people), day and night, boundary and camera rules.
4. **People:** the 12 village characters with routines and the startle, smell, blame and chase behaviours; pigeons; ducks.
5. **Props:** tins, teacups, hats, gnomes, laundry, the bell, the fountain bubbles.
6. **Mischief list (15), golden bean jar, programme board, local save, intro flyover, crumb trails.**
7. **Rocket Rings** with its board and ghost.
8. **Shh! The Library** with its board.
9. **Brass Band Bash** (march and polka, calibration) with boards.
10. **Picnic Panic** with its board.
11. **Toot-o-Matic** unlocks (6 voices, 5 cloud styles) and the medal ceremony.
12. **Tests and playtests** on every input path; the performance pass on low tier; the z-fighting audit.

If time runs short, ship 1 to 7 first (the village with mischief and one trial is already a complete, funny game), then add trials one release at a time.

### Nice-to-haves, in priority order

1. A third song, "The Bean Galop" (150 BPM), and platinum targets with Gran's ghost.
2. **Pigeon Scatter:** a 45 s combo trial (chain scatters within 1.5 s for a multiplier; one golden pigeon worth 10).
3. **The Grand Toot-Off:** a call-and-response memory show on the bandstand. Three judges toot a pattern of short and long toots; you toot it back; it grows each round. Scorecards held up by the judges (one is Biscuit). Endless board: longest pattern.
4. **Balloon Blow-up:** a Mario Party mash to inflate the deflated balloon in 20 s, then a balloon ride over the village as a scenic reward.
5. **Hats** through an avatar attachment hook (top hat, propeller beanie, feathered hat) as unlocks.
6. **Daily fete specials:** a seeded modifier per day (windy day, bean festival, pigeon parade, rainy day with umbrellas and thunder masking in the library), with daily boards.
7. The `groundAt` height field (E7) for sloped roofs and a hill to slide down.
8. Night fireworks finale after the medal ceremony.

---

## 9. Risks and open questions

**Risks**
- **Engine additions.** The design leans on E1 to E5. Fallbacks exist (vertical moves through `gravity()` work today), but squash and stretch and held input are most of the feel. Needs the engine lead's agreement early.
- **Holding OK on the TV remote.** Desktop holds work; the Samsung S90H browser's key repeat and key-up behaviour is unknown. Tap mode is the fallback and defaults on for TV until it's checked.
- **Rhythm latency on TVs** and Bluetooth audio. Calibration, wider remote windows and a strong visual cue (the baton) mitigate it; it still needs a real device check.
- **Tone.** The line between cartoon-funny and gross is the brief's main risk. The rules in section 1 (candy colours, no wetness, nothing brown, the town's dignity as the target) need a review pass with the owner, and every copy line should be read aloud once with that in mind.
- **Scope.** This is a large world for one engineer. The priority order is built so each step ships something playable.
- **Low tier on the TV.** 25 to 35 characters plus clouds is the heaviest part; instancing by part is the plan, and the playtest asserts draw calls per tier.
- **WebAudio node churn.** Rapid fizzy blips create many nodes; voices are pooled with a 6-voice cap and rate gates, like `sfx.ts`.
- **Camera in tight spots.** Perches next to tall walls and the library depend on the kit camera override; without it, the library needs the indoor dollhouse camera, which the engine only sets on entering an area.
- **Board cheating.** Bounds are cheap to get around; start tickets help. Boards only ever affect bragging rights.
- **Kit timing.** The doc assumes the kit's hud, music, camera, particles, post and scores; if a piece is late, the world needs a thin local version.

**Open questions**
1. Is "a fart simulator" acceptable in the title card, or should in-world copy say only "toot" (keeping "Fart simulator" just on the room's door sign)?
2. Will the engine lead accept E1 to E6, or should the world ship first on the `gravity()` fallback?
3. Does the kit's scores module support start tickets, or bounds only?
4. Should golden beans and unlocks be per area (as designed) or shared by every fart area on this device?
5. Library gating at 5 beans and Picnic Panic gating on discovering cabbage: right for young kids, or should all four trials be open from the start?
6. The avatar measures about 1.4 m to the top of its head; doors, counters and perches are sized for 1.6 m as the brief says. Confirm the target height.

## Decisions after review

Your engine asks E1 to E6 are in the kit now (check src/experiences/common.ts and src/world/space.ts):
- E1: `ctx.input` (`take`, `isHeld`, `move`, `pressedAt`, `takeDirs`).
- E2: `ctx.teleport(x, z, yaw, y?)`.
- E3: `PlayerState` has `y`, `vy` and `grounded`.
- E4: `ctx.impulse(vx, vy, vz)`. The vertical speed is set directly. Horizontal speed adds to walking but walking control takes it back quickly, so use `carry(h, player, move)` for your own flight or hover model.
- E5: `ctx.squash(amount)`, plus poses and `ctx.swing`.
- E6: `audioGraph()`, `tone()` and `noise()` exported from src/audio/sfx.ts, and `music` for songs.

Other new hooks you may want: `jumpAction` (repurpose Jump), `captureInput`, `cameraShot`, `runScale`.

Decisions on your questions:
- The title card says "Fart simulator", which is the owner's own name for the area. Use "toot" for most in-world copy and keep it kid-safe.
- Boards use bounds plus run tickets (`ScoreMode.ticket.minMs` with `api.runStart`). For timing or rhythm trials, scores can be worked out on the server from a run log (`ScoreMode.fromLog`).
- Beans and unlocks are saved per area (kit Progress).
- Gating: Rocket Rings and Brass Band Bash are open from the start, the library opens at 3 beans and Picnic Panic at 6. New players should see variety quickly.
- Size everything to the real avatar (about 1.4 m), with doors and counters at least 2.2 m clear.
- Tap mode stays on by default for TV remotes until the hold is verified on a real TV.

Scope: work through must-haves 1 to 12 in order, fully polished. If you must cut, cut whole trials from the bottom (Picnic Panic first) and say so.
