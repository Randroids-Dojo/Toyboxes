# The Golden Paddle: design document

> The design written before the build. The review decisions at the end override it where they differ. What shipped is recorded in `docs/ACCEPTANCE.md`. Paths under `/tmp/toyboxes-worlds/` were scratch files and no longer exist.

World kind: `casino`. Room 1 ("Casino" area), owner Randroid.
Visitor pages (a game idea only): "A casino with a giant slot machine I can walk up to and spin. My total credits earned / spent is tracked over time." Edit: "Add other casino games as well."
Drawing (room1-page2.png): a tall box with three reels, the middle row framed by two lines and filled with big red symbols, small coloured marks above and below, and a yellow lever on the right.

Evidence for this doc: the current casino was run on a local dev server (port 5212, memory store) and screenshotted (`/tmp/toyboxes-worlds/casino/shots/`, script `look.mts`). All payout maths below was computed with `/tmp/toyboxes-worlds/casino/math.mjs`, `tune.mjs` and `tune2.mjs`.

---

## 0. What exists today, and what we keep

The current Casino is an 18 x 15 m red-carpet room: a 4.7 m slot machine with a lever, a roulette table, a half-moon blackjack table with a robot dealer, a credits kiosk with a balance chart, and two wall boards. It works, but it reads as a showroom, not a place: flat lighting, one colour of everything, no reason to come back once you have tried the three games.

**Kept as is (the foundations are good):**
- The server decides every outcome; the browser only animates. Every new game follows the same pattern (section 7.6).
- `CasinoStats` with `rev` and compare-and-swap writes, per-browser keys, rate limits, `START_CREDITS = 1000`, the free refill when you are out (under 10 credits), the balance history and its thinning (`pushHistory`).
- The top balances board, `scorename:` names, rename support, `clearScores` for the creator.
- European roulette rules (`rouletteReturn`, `WHEEL_ORDER`), blackjack rules (six decks, dealer stands on 17, blackjack pays 3 to 2, double, the hand survives leaving the room).
- The slot's reel technique (canvas strip on a cylinder, reels land left to right with an eased stop), the lever pull and spring back, chasing bulbs, Kick to change the bet at the machine.
- The robot dealer (he becomes Rivet, one of a family of brass automatons), light panels that dock at the bottom with full focus navigation, `debugInfo`, and every check in `scripts/experiencetest.ts`.
- `tests/scores.test.ts` keeps its slot return test (bounds updated for the new strip, same intent: a little under what it takes, pays often).

**Changed:** the room becomes a riverboat; the slot becomes Old Lucky (giant, per the drawing, with a bonus and jackpots); roulette takes several bets per spin; blackjack gains split and a strategy coach; three new games; progression; the credits kiosk grows into the Captain's Logbook stats lounge.

**Fixed on the way:** the jackpot bulbs currently alternate at 6 flashes a second (`Math.floor(clock * 12 + i) % 2`). That breaks the three-flashes-a-second photosensitivity guideline. Every flash in the new world is capped at 3 Hz.

---

## 1. Vision

### Pitch
**The Golden Paddle** is a clockwork paddle steamer casino drifting down a lantern-lit river. Brass automatons deal the cards and play ragtime, the giant slot machine Old Lucky puffs steam from its twin smokestacks, and a towering money wheel spins in front of the churning stern paddle wheel. Every credit you win and spend is drawn as a river on the captain's chart, and the stamps in your logbook raise you from Deckhand to Captain and open the upper rooms of the boat.

### The fantasy
"I'm a guest of honour on the grandest boat on the river." Not a gambler: a traveller with a logbook. The fun is the spectacle (steam, bulbs, wheels, pearls dropping through pegs), the small decisions (which bet, hold or draw, calm or wild), and the journey (stamps, ranks, rooms opening, your river chart growing over many visits).

### Title and names
- World: **The Golden Paddle** (marquee over the gangway and on the paddle box).
- The giant slot: **Old Lucky**, "the biggest slot machine on the river".
- The money wheel: **The River Wheel**.
- The pegboard drop (plinko-style; the word "plinko" is never used in game copy): **Lucky Falls**.
- Video poker: **Five Card Cabin**.
- Blackjack: **Rivet's Twenty-One**. Roulette: **The Spinning Lily**.
- Stats lounge: **The Captain's Logbook**.
- Rooms: **the Grand Saloon** (open), **the Stern Deck** (open, outdoors), **the Moonlight Lounge** (rank 2), **the Wheelhouse** (rank 3).
- Automatons: **Penny** the purser (cashier), **Rivet** the dealer, **Spinner** the croupier, **Monty** the doorman, **Captain Cog**, and the band **The Paddle Wheel Three** (Ivory on piano, Strum on banjo, Oompa on tuba).

### Art direction
A gilded steamboat built from Toyboxes' toy materials: chunky rounded shapes, matte plastic, exaggerated proportions, but with real brass and warm light. Victorian gingerbread fretwork, cast-iron columns with brass capitals, arched windows, a raised clerestory with chandeliers. Every room has its own light so moving between them feels like a level change.

**Palette**

| Role | Hex | Notes |
| --- | --- | --- |
| Saloon wall, upper | `#1d4f55` | river teal |
| Saloon wall, shadow and clerestory | `#0f2e33` | |
| Wainscot and tables (mahogany) | `#6a2c1d`, highlight `#8e4a2e` | |
| Carpet base | `#1b2147` | midnight navy |
| Carpet motif | `#c9973a` brass paddle-wheel medallions, `#d8574a` coral pinstripe | canvas pattern, 2 m repeat |
| Brass, lit and shade | `#e0ac45`, `#a8782c` | low tier uses the existing matte gold `#d9a838` |
| Ivory trim, fretwork, column fluting | `#f4e7cc` | |
| Card felt | `#1e7a4f` | the classic green reads instantly as "card table" |
| Old Lucky lacquer | `#c8303f` | the current machine red, kept: it ties to the drawing's red |
| Old Lucky glass and reel faces | `#1d1830`, `#fffaf0` | |
| River Wheel paddles and rim | `#b8342c`, ivory segments, brass hub | |
| Moonlight Lounge walls | `#262a5c`, accents `#9fb7e8`, moon glass `#cfe3ff` | the cool counterpoint |
| Bulbs and chandelier light | `#ffcf7a`, `#ffd9a0` | warm, about 2700 K |
| Window moonlight / day sun | `#9fc3ff` / `#fff1d6` | from the shared town clock |
| Jackpot accents | `#ffd24a`, `#ff5a3c` | |
| UI surface, text, muted | `#13212b`, `#f4e7cc`, `#a9b8bd` | casino panels and the logbook |
| Chart: earned / spent / zero line | `#c27c1a` / `#2b9cb0` / `#6b7680` | validated (section 7.10) |

**Lighting.** Low key and warm inside. Three chandeliers down the clerestory are the main pools; each table has a green-shaded pendant lamp throwing a soft light-pool decal onto its felt; Old Lucky sits in a lit proscenium bay so it is the brightest, warmest thing in the room. Windows let in the time of day: sun shafts through the starboard windows by day, cool moonlight and lantern reflections by night. The Stern Deck is lit by strings of festoon bulbs and the River Wheel's own ring of lights. The Moonlight Lounge is cool blue with pools of silver. Bloom on medium and high tiers makes the bulbs and brass sing; a gentle vignette and warm grade tie it together.

**Materials.** Matte plastic for most things (Toyboxes' signature). Brass gets real metalness (0.85, roughness 0.32) with a small generated environment map on medium and high; on low it falls back to the matte gold plastic. Lacquer (Old Lucky, River Wheel) gets clearcoat on high only. Felt is fully rough with a printed layout. Glass is a thin transparent standard material with environment reflections, never real transmission.

**Silhouettes.** Old Lucky: a steamboat face (an arched marquee between two smokestacks, reel window as the "eyes", the lever as an arm). The River Wheel: a big lit disc against the dark churning sternwheel. Lucky Falls: a tall waterfall-shaped pegboard. The band's straw boaters. Columns and arches frame each game like a stage.

**Mood.** Cosy grandeur. Friendly, never seedy: no smoke, no drinks beyond a decorative soda fountain, staff who cheer for you.

**References.** Cuphead's casino level (rubber-hose charm, brass band energy), Animal Crossing (cosy toy materials), BioShock Infinite's gilded Americana (architecture only), Peggle (musical pegs and the fever ceremony), Balatro (honest numbers that feel great to watch go up).

### Audio direction
Music runs on the kit's procedural sequencer; songs are data.
- **Grand Saloon: "Paddle Rag"**, 104 BPM, swing about 58 percent, F major. Stride piano (bass on 1 and 3, chords on 2 and 4), banjo strums on the off-beats, tuba bass, a reedy square-wave clarinet lead with vibrato, brushed snare. 32-bar loop with three variations. The band automatons move on the kit's beat clock, so what you hear is what they play.
- **Moonlight Lounge: "Moon on the Water"**, 72 BPM, D dorian. Vibraphone (sine with tremolo), upright bass (plucked triangle), brushes, soft pad.
- **Stern Deck:** the saloon music low-passed at 900 Hz and at 40 percent level, over a river bed: water churn (low-passed noise), paddle splashes timed to each bucket entering the water, crickets and frogs at night, birds by day, a distant steam whistle every few minutes.
- **Wheelhouse:** music muffled, wood creaks, the ship's bell.
- Zones crossfade over 1.2 s by player position. Music ducks 6 dB under big win stings.

**Signature sounds** (synthesised in `sfx` style, short, each with a visual twin): the lever's heavy clunk and ratchet; reel ticks and a rising "thunk" per reel stop; coin cascades whose length follows the win; Old Lucky's steam whistle (two detuned stacked tones with breath noise); the ship's bell (rank up); the engine-order telegraph's "ding ding" (bet change); the roulette ball's rattle slowing into pocket clicks; card snaps; the River Wheel's leather flapper ticking slower and slower; Lucky Falls' pegs tuned to a pentatonic scale so every drop plays a little melody; chip clacks; the logbook stamp's "ka-chunk"; the split-flap board's clatter.

---

## 2. Core loop and feel

### Moment to moment
Walk up to something that glows. Press Interact. The camera eases into a framed "seat" view of the game (the kit camera override) and a panel docks at the bottom with big buttons. Choose a bet, play, watch a short, honest, juicy reveal, see credits change. Back stands you up. Between games you stroll: the boat is the menu.

Old Lucky is the exception, exactly as the page asked: walk up and pull. No panel.

### The session loop
Play a game, earn credits and stamps, watch the rank badge fill, open a new room, try its game, check your river in the logbook, leave when you like. Each visit is a "voyage" in the logbook.

### The long loop
Stamps (achievements) raise your rank: Deckhand, Bosun, First Mate, Captain. Ranks open rooms and tables. Or you can buy a boarding pass with play credits at Penny's cage. Jackpots put your name on the Hall of Fame plaque. Your river chart grows across weeks.

### Controls for every input path

The core game needs only move and Interact. Kick and Jump are shortcuts and extras.

| Action | Keyboard and mouse | Touch | Controller | TV remote |
| --- | --- | --- | --- | --- |
| Walk | WASD or arrows | floating stick | left stick or d-pad | arrows |
| Look | mouse drag, J/L/I/K | drag right half | right stick | (auto camera) |
| Play here: pull Old Lucky's lever, open a table, ring the telegraph, talk to Penny, open the logbook, ask Monty at a gate | E or Enter | Action button (labelled "Spin", "Roulette", "Ring"...) | A | OK |
| Change bet at Old Lucky (shortcut) | F | Kick button relabelled "Bet 25" | X | (use the telegraph: walk to it, OK) |
| Stand up from a table, close a panel | Esc | Done button | B | Back |
| In a panel: move focus | arrows, Tab | tap | d-pad or stick | arrows |
| In a panel: choose | Enter or click | tap | A | OK |
| In a panel: change the bet | click a chip in the panel header | tap a chip | LB / RB (or focus a chip, A) | focus a chip, OK |
| In a panel: alt (Rebet and play, or Hint in blackjack and poker) | a visible button | a visible button | X or Y | a visible button |
| Skip a ceremony (a "Skip" action is offered wherever you stand) | E or Enter | Action button ("Skip") | A | OK |
| Menu | Esc (outside panels) | menu button | Start | Back (outside panels) |
| Jump (optional: hop on the band stage) | Space | Jump button | Y | not needed |
| Kick (optional: kick jackpot coins around) | F | Kick button | X | not needed |

Notes:
- Panels use `UI.open` with `light: true` (dock at the bottom, world visible), `onBack` to stand up, `onPrev`/`onNext` to step the bet (the existing `Panel` hooks), and `onAlt` for Rebet or Hint. Every button is reachable by spatial focus navigation, so arrows plus OK cover everything.
- The engine-order telegraph next to Old Lucky is the diegetic bet control: a brass dial with Slow 10, Half 25, Full 50 and Flank 100 (plus 250 and 500 once high limits open). Interact rings it ("ding ding") and moves the handle to the next bet. That keeps Old Lucky fully playable with arrows and OK.
- The default bet for a new player is 10 (lowest), not 25.

---

## 3. Content and progression

### 3.1 The games

All outcomes come from the server. "Return" means the long-run share of credits that comes back, computed exactly in tests.

**1. Old Lucky (giant slot). Open from the start. Bets 10 to 100 (250, 500 with high limits).**
- Three reels, a 3 x 3 window as drawn: the middle row is the payline, framed by brass bars with a red payline lamp; the rows above and below show the real neighbouring stops on the strip (no extra teaser symbols).
- New 20-stop strip, same on all reels: seven 1, bar 2, star 3, bell 3, cherry 2, lemon 6, paddle 3.
- Paytable (x your bet): three sevens 200, three bars 40, three cherries 25, three bells 12, three stars 12, two sevens 12, two cherries 4, three lemons 3, mixed fruit (any three of cherry, lemon, bell) 2, one cherry 1 (your bet back).
- Three Golden Paddles: the **Paddle Wheel Bonus**. The camera flies to the Stern Deck, the River Wheel's inner bonus ring lights up and spins. The ring has 48 segments: 5x (8), 8x (7), 10x (6), 12x (5), 15x (4), 20x (3), 25x (2), 30x (1), 40x (1), MINI (8), MAJOR (2), GRAND (1).
- Jackpots, all "x your bet" like every other prize, so the rule stays one rule: MINI 20x, MAJOR 100x, GRAND starts at 250x and grows by 0.01x with every Old Lucky spin anyone makes in this casino, capped at 600x, back to 250x when someone wins it. The marquee shows "GRAND 312x" and, underneath, what that is at your bet ("7,800 at bet 25").
- Numbers (exact): base return 87.0 percent; a hit on 37.3 percent of spins; a net win (more than your bet) on 19.2 percent; the bonus about 1 in 296 spins; MINI about 1 in 1,778, MAJOR 1 in 7,111, GRAND 1 in 14,222 spins. Total return 94.5 percent with GRAND at 250x, 96.3 percent at 500x; the expected GRAND when it lands is about 390x, so the long-run return is about 95.5 percent.

**2. The Spinning Lily (roulette). Open.** European wheel (kept). The panel is a real betting board: a classic layout on wide screens, a 6-column number grid plus outside bets on narrow screens and TVs, both fully focusable. Pick a chip, then OK on cells to place chips: numbers (35 to 1), dozens and columns (2 to 1), red, black, odd, even, 1 to 18, 19 to 36 (1 to 1). Up to 8 bets per spin, table maximum 500 (2,500 high limit). Chips appear on the 3D felt as you place them. Undo, Clear, Rebet. Return 97.3 percent on every bet (kept). Spinner the croupier waves "no more bets", the ball rattles and settles, the winning number lights on the felt and in the recent-numbers rail. Splits and corners are a nice-to-have.

**3. Rivet's Twenty-One (blackjack). Open.** Kept rules plus **split** (once; split aces get one card each; a 21 after a split pays 1 to 1; double after split allowed). Cards are dealt from the shoe across the 3D table, then mirrored in the panel. **Hint** (Alt) lights the move the strategy card recommends and Rivet says why in six words ("The book says stand on 16 against 6"). The strategy table lives in shared code (`bjAdvice`), so the server can count how often you follow it (a stamp, see 3.3). Return about 99.5 percent with perfect play: the skill game.

**4. The River Wheel (big money wheel). Open, on the Stern Deck.** A 6.2 m lit disc with 51 outer segments: Anchor 24 (pays 1 to 1), Rope 12 (3 to 1), Lantern 8 (5 to 1), Compass 4 (11 to 1), Helm 2 (23 to 1), Star 1 (47 to 1). Every bet returns exactly 48/51 = 94.1 percent. Chips on up to six symbols per spin. The wheel spins hard, the flapper ticks slower and slower, the wheel settles with a small bounce-back against the flapper, the sternwheel behind it churns faster while it spins. The inner ring is only used for Old Lucky's bonus.

**5. Lucky Falls (pegboard drop). Moonlight Lounge, rank 2.** A 5.2 m board of 12 rows of brass pegs and 13 bins. The server picks the 12 left or right bounces; the pearl follows them. Choose a risk:
- Calm: 6, 2, 1.5, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.5, 2, 6 (return 95.7 percent; 39 percent of drops win, 39 percent give your bet back).
- Lively: 22, 7, 3, 1.6, 1.1, 0.7, 0.4, mirrored (return about 94.7 percent).
- Wild: 110, 25, 7, 2, 0.6, 0.3, 0.2, mirrored (return 94.7 percent; an edge bin about 1 in 2,048).
Up to five pearls in the air at once. Payouts round down to whole credits. The pegs ring a pentatonic melody.

**6. Five Card Cabin (video poker). Moonlight Lounge, rank 2.** Jacks or Better with the 6/5 paytable (x your bet): royal flush 800, straight flush 50, four of a kind 25, full house 6, flush 5, straight 4, three of a kind 3, two pair 2, jacks or better 1. The 800 royal pays at every bet size (no "bet max" bonus). Return 95.0 percent with perfect play. Deal five, OK on cards to hold, Draw. **Hint** (Alt) shows the recommended holds from a shared rule list (see 7.9). The server keeps the deck; the hand survives leaving the room. Three cabinets, all the same game; Bonus Poker and Deuces Wild variants are a nice-to-have.

**7. The Captain's Table (high-limit blackjack). Wheelhouse, rank 3.** Same engine as Rivet's table with Captain Cog dealing, bets 100 to 500, a six-card Charlie (six cards without busting wins at once) and a dealer who hits soft 17. The two rules roughly cancel, so the return stays about 99.5 percent with perfect play: the reward is the room, the stakes and the Captain, never a game that pays more than it takes (which would let anyone with the Hint button farm the balance board).

**Nice-to-have games:** Crown and Anchor (a brass birdcage of three giant dice, thematic to river boats; three of a kind pays 10 to 1 for a 95.4 percent return), a Hi-Lo ladder (push-your-luck card game with cash out at any rung), and a coin pusher (the Paddle Pusher; the server decides the payout, the shelf choreography matches it).

### 3.2 Ranks and rooms

| Rank | Stamps | Opens | Or buy a boarding pass at Penny's cage |
| --- | --- | --- | --- |
| Deckhand | 0 | Grand Saloon, Stern Deck: Old Lucky, roulette, blackjack, River Wheel, the Logbook | |
| Bosun | 5 | Moonlight Lounge: Lucky Falls, Five Card Cabin | Lounge pass, 2,000 play credits |
| First Mate | 14 | Wheelhouse: the Captain's Table, the ship's wheel (window scenery: town time, golden sunset, moonlight), high-limit chips 250 and 500 on every game | Wheelhouse pass, 6,000 play credits (needs the Lounge) |
| Captain | 26 | Your name in brass on the Captains' board, gold names on every board, the band plays your fanfare when you board | |

Both paths are honest and permanent: earn it by playing a variety of games, or spend winnings on it. Passes never expire, never discount, never count down. Credits spent on passes are tracked separately from game spending in the logbook. The server enforces every gate (a Lucky Falls drop without lounge access is refused with 403).

### 3.3 Logbook stamps (achievements)

Every stamp is derived on the server from play it decided, so the stamps board can be trusted. No stamp rewards volume of spending. 35 stamps:

- **Boarding (5, the path to Bosun):** All aboard (first play), Lever puller (spin Old Lucky), Red or black (spin roulette), Twenty-one club (play a blackjack hand), River wheel (spin the River Wheel).
- **Old Lucky (4):** Fruit salad (mixed fruit), Full steam (trigger the bonus), Seven seas (three sevens), Lucky paddle (win 30x or more in a bonus).
- **Cards and wheels (8):** Blackjack, Double down (win a doubled hand), Split decision (win both halves of a split), By the book (20 blackjack moves that match the strategy card), Straight up (win a single-number roulette bet), Spread the chips (win a roulette spin with 4 or more bets placed), Star of the river (win a Star bet on the River Wheel), Even keel (win Anchor three spins in a row).
- **Lounge (8):** Pearl drop, Calm waters (10 calm drops), Over the falls (an edge bin), Wild ride (25x or more on wild), Dealt in (a video poker hand), Full house, Four of a kind, Royal flush.
- **Jackpots and big moments (5):** Mini jackpot, Major jackpot, Grand jackpot, High roller (win 1,000 or more in one play), Lucky streak (three wins in a row on one game).
- **Healthy voyages (5):** Shore leave (a voyage that ends with more than it started), Comeback (from under 100 back to 1,000 without a refill), Explorer (play every game open to you), Regular (play on 5 different days, any days, no streak), Old salt (play on 20 different days).

Rank thresholds 5, 14 and 26 leave room: nobody needs the legend stamps (Royal flush, Grand jackpot, Seven seas) to become Captain.

### 3.4 Personal bests and shared boards
- **Personal bests (per browser, kept by the server, shown in the logbook):** biggest win per game, best Lucky Falls multiplier, best poker hand, longest win streak, best voyage (biggest gain), highest balance ever.
- **Shared boards (server validated):** Top balances (kept), Biggest single win, Most stamps, and the **Hall of Fame** (every MAJOR and GRAND: name, jackpot, multiplier, credits, date; last 20). Captains get a separate brass board of names.
- Boards show on a split-flap display in the Logbook nook and in the logbook panel; the Hall of Fame plaque hangs next to Old Lucky so every visitor sees it. Until someone wins a GRAND the plaque honestly says "GRAND: not won yet. Could be you."

### 3.5 Healthy play rules (design constraints, not features to cut)
1. Play credits only. Never bought, never prizes, no ads, no links.
2. No near-miss engineering: the reel window shows the true strip; the third reel never slows down when two sevens or two paddles are showing.
3. No losses dressed as wins: a result worth your bet or less never plays win effects (a bet back gets a soft ding and "Your bet comes back").
4. No autoplay, no turbo, no highlighted "bet max". Default bet is the smallest.
5. No streaks, timers, countdown offers or escalating daily rewards.
6. Session awareness: after 30 minutes of continuous play Penny says once per voyage "You've played for 30 minutes. The river's lovely from the stern deck." (a toast, never a blocking dialog). The HUD always shows this voyage's net.
7. The refill is free and instant when you are out, with no wait and nothing to watch.
8. Odds are always one button away ("Odds" on every panel, a paytable plaque at Old Lucky).
9. Celebrations scale with the win and never flash faster than 3 times a second; Reduce motion removes shake, orbits and strobes.

### 3.6 The first 5 minutes
- 0:00 Fade in on the gangway. The band plays an entrance flourish. Penny waves from her cage: "Welcome aboard! 1,000 play credits." The credits odometer rolls up from 0 with coin ticks. First visit only: the kit intro card (three lines, device glyphs): "Walk up to anything that glows and press E." "Play credits only. Run out and Penny tops you up." "Collect stamps to open the upper rooms."
- 0:10 Brass inlays in the carpet light in sequence towards Old Lucky; its lever glows and bobs. Prompt: "Pull the lever (bet 10)".
- 0:20 Lever, steam puffs, reels. Stamps "All aboard" and "Lever puller" thump into the rank badge (2 of 5). A one-time bubble over the telegraph: "Ring me to change your bet."
- 1:30 A few spins; mixed fruit lands about one spin in eight, so a small win usually arrives.
- 2:00 The badge suggests the next stamp ("Next: spin the roulette wheel") and the carpet inlays light the way there.
- 2:30 Roulette: a chip on red. Stamp 3 of 5.
- 3:30 Blackjack with Rivet; the Hint button glows on the first hand. Stamp 4 of 5.
- 4:30 The stern doors slide open onto the night river. The River Wheel: chips on Anchor and Star, spin. Stamp 5 of 5: **Bosun**. The ship's bell rings three times, the band plays a fanfare, a banner reads "Bosun! The Moonlight Lounge is open", the lounge arch floods with blue light and Monty unhooks the velvet rope.
- 5:00 The player heads to the lounge for their first pearl drop.

### 3.7 The 30th visit
The player is First Mate or Captain. Boarding, the band plays their fanfare and Penny greets them by name. They check the GRAND ticker (it grew since last time) and the Hall of Fame. They drift between favourite games: a calm run on Lucky Falls, a few hands at the Captain's Table, Five Card Cabin with Hint off to test themselves. They are chasing the legend stamps (Royal flush, Seven seas, Old salt). In the Wheelhouse they steer into a golden sunset. In the Logbook their river chart spans weeks, the "by day" bars show which days were lucky, the "by game" view shows Five Card Cabin returning 97 percent for them because they learned the holds, and voyage 30 is added to the list when they leave.

---

## 4. Onboarding (no walls of text)
- **One intro card, once** (kit hud): three short lines with the device's own glyphs (section 3.6).
- **Penny's greeting** and the rolling odometer explain "credits" without a word of rules.
- **Carpet inlays** light a path to Old Lucky on the first visit, then to whichever station the next-stamp hint suggests (only while that hint is showing).
- **Everything playable glows**: a soft brass rim light pulses on stations you have not tried yet and stops once you have.
- **Prompts name the action** ("Pull the lever (bet 10)", "Play roulette", "Ring the telegraph (bet 25)").
- **Each panel has one coach line** the first time it opens ("Pick a chip, then choose where to place it."), plus a "?" button with three short illustrated rules.
- **Staff speak in bubbles of six words or fewer** at the right moment: Rivet "Dealer stands on 17.", Spinner "No more bets!", Monty "Five stamps, and you're in."
- **Gates explain themselves**: Monty's panel shows what is inside (a picture), your stamps ("3 of 5"), the next stamps to try, and the pass price, with "Not now" focused by default.
- **Paytables are physical**: printed on Old Lucky's belly glass, on the River Wheel's rail, above the Lucky Falls bins, on each poker cabinet.

---

## 5. Juice list

"Win" below means a result worth more than the bet. Tiers by net multiple of the bet: small (over 1x), nice (5x or more), big (15x or more), mega (50x or more), then jackpots.

| Event | VFX | SFX | Camera | HUD |
| --- | --- | --- | --- | --- |
| Arrive | band spotlight sweep, Penny waves | entrance flourish, door creak | 1.5 s glide from the gangway to behind the player (kit cinematic; cut on low) | odometer rolls up |
| Walk near a station | brass rim glow pulses, staff head turns to you | soft chime the first time | none | prompt with glyph |
| Ring the telegraph | handle swings to the next notch, bell clapper | "ding ding", lower pitch for smaller bets | none | bet chip flips to the new value |
| Pull the lever | lever arc with overshoot, both smokestacks puff a steam ring, marquee bulbs chase faster | clunk and ratchet | 0.1 s nudge (off with reduce motion) | credits drop by the bet at once (honest), voyage net updates on landing |
| Reels spin and stop | motion-blurred strip (low tier: plain), each reel stops with a tiny bounce, payline lamp brightens | ticks, a rising thunk per reel at fixed tempo | none | |
| Bet back (one cherry) | cherry outline glows once | soft ding | none | "Your bet comes back" toast |
| Small win | winning symbols pulse, coin burst of 12 into the tray | coin trickle | none | score pop "+30" rising from the machine |
| Nice win | 40 coins, bulbs chase twice | longer cascade | small nudge | score pop and toast |
| Big win | coin fountain 3 s, steam whistle chirp, bulbs gold | cascade plus band sting | push-in 5 percent | kit banner "BIG WIN", counter rolls up |
| Mega win | coins arc onto the floor and stay (kickable), chandeliers glow brighter | full fanfare | slow push-in and settle | banner "MEGA WIN", counter roll with ratchet |
| Paddle Wheel Bonus | three paddles spin in place, steam blasts, "FULL STEAM" on the marquee | whistle, train-like chuffing build | kit cinematic flight to the Stern Deck (1.2 s; a cut on low), wheel framing, flight back | banner "PADDLE WHEEL BONUS", skip hint |
| MINI jackpot | 3 s: gold bulbs, 300 coins from the tray | band sting, coins | small orbit | banner "MINI JACKPOT 20x", counter roll |
| MAJOR jackpot | 6 s: lights dim to 30 percent, spotlight on Old Lucky, steam rings, coin pile on the floor, plaque engraves your name with sparks | steam whistle, fanfare | orbit around Old Lucky | banner, counter roll, results card |
| GRAND jackpot | 12 s, skippable after 3 s: all of MAJOR, chandeliers swing, confetti cannons from the clerestory rail, the River Wheel spins by itself, fireworks over the river seen through the stern doors and windows | whistle chord, the Golden Paddle anthem by the band | orbit, then a cut to the stern for fireworks, then back | "GRAND JACKPOT" banner, results card "Your name is on the Hall of Fame", buttons Keep playing / Open the logbook |
| Roulette chip placed | 3D chip drops onto the felt with a tiny bounce | chip clack | none | bet total updates |
| Roulette spin | ball orbits, drops, rattles over the frets, settles; winning number lights on the felt; losing chips slide to the croupier, winning stacks grow | rattle, slowing clicks | seat framing tilts to the wheel during the spin, back to the felt for the payout | status line, recent-numbers rail |
| Card dealt | card slides from the shoe and flips (0.25 s) | snap | none | panel card flips in sync |
| Blackjack | cards glow gold, Rivet applauds | fanfare | small nudge | banner "BLACKJACK" |
| Bust | cards tilt and dim, Rivet gives a kind shrug | low two-note | none | "Bust! Over 21." |
| Hint | recommended button gets a pulsing brass outline, Rivet points | soft chime | none | Rivet's bubble |
| River Wheel spin | wheel blurs, flapper bends, sternwheel speeds up with spray and mist, segment lights chase under the pointer | ticks slowing, a thunk on the settle | seat framing; slight dolly-in as it slows | result chip under the pointer, history rail |
| Pearl drop | pearl wobbles in the chute (covers network time), hops peg to peg with squash and stretch, each peg flashes; the bin bursts with light and its multiplier floats up | pentatonic peg notes, a bin chime by value | none | score pop over the bin, last-8 rail |
| Edge bin on Wild | waterfall of light down the whole board | rising arpeggio | small nudge | banner "OVER THE FALLS" |
| Poker hold | card lifts 1 cm with a HOLD tag | click | none | |
| Poker made hand | paytable row lights, winning cards glow | ding scaled by rank | royal: full ceremony like MAJOR | banner for four of a kind and up |
| Stamp earned | a brass stamp slams onto a paper card that flies into the rank badge | ka-chunk | none | toast "Stamp: Lucky streak" and the ring fills |
| Rank up | bell rings three times, band fanfare, the newly opened arch floods with light, Monty unhooks the rope | bell, fanfare | short cinematic pan to the opened gate (cut on low) | banner "Bosun!" |
| Refill | Penny slides a coin tray across the counter | coins | none | odometer rolls up, toast "Topped up: 1,000 play credits" |
| Logbook opened | chart table's river redraws itself with ink | page turn | seat framing over the chart table | panel opens |
| Boards update | split-flap cells flip only where text changed | flap clatter | none | |
| Network failure | animation resolves to a calm stop, no fake result | error tone | none | "Couldn't reach the boat. Your credits weren't touched." |

---

## 6. World layout

Units are metres. x runs along the boat (bow at negative x, stern at positive x), z across (starboard negative z, port positive z), y up. Yaw 0 faces +z. The avatar is about 1.6 m tall; the indoor follow camera sits about 7.4 m back at a pitch of 0.3 to 1.25 rad, so a typical eye is 4 to 6 m up.

### 6.1 Plan

To scale, generated from the coordinates below by `/tmp/toyboxes-worlds/casino/plan.py`. One column is 0.75 m along x (bow on the left, stern on the right), one row is 1 m along z (starboard at the top, port at the bottom).

```
                                ##############                               
                                #   LLLLLL   #                               
                                #   LLLLLL   #                               
                       ###FFFF###            #PPP######                      
                  #####BBB######..t...........####SSSS#::::::::::::          
             #####....#BBB.............................:::::::::::::         
          ###..UUUU...#B...............................,,,,,,,,,,,::~~~~~~~~ 
       ####...........#................................,,,,,,,,,,,::~~~~~~~~ 
     ##...#...........#..o........o........o........o..,,,,,,,,,,,::~~~~~~~~ 
  ###..Q..#...........#.....RRRRR......................,,,,,,,,,,,::~~~~~~~~ 
 #...QQQQQ#...........#.....RRRRR......................d,,,,,,,,,,::~~~~~~~~ 
 #...QQQQQ#...........g................................d,,,,,,,,,W::~~~~~~~~ 
 #H...QQQ.h...........g................................d,,,,,r,,,W::~~~~~~~~ 
 #H.......h...........g................................d,,,,,r,,,W::~~~~~~~~ 
 #........#...........g....JJJJ........................d,,,,,,,,,W::~~~~~~~~ 
 #........#...........#....JJJJ........................d,,,,,,,,,,::~~~~~~~~ 
  ###.....#...........#....JJJJ........................,,,,,,,,,,,::~~~~~~~~ 
     ##...#...........#..o........o........o........o..,,,,,,,,,,,::~~~~~~~~ 
       ####...........#......................aa....aa..,,,,,,,,,,,::~~~~~~~~ 
          ###.V.VV.V..#...............@@.......TTTT....,,,,,,,,,,,::~~~~~~~~ 
             #####....#.......CCCCC....................:::::::::::::         
                  ############CCCCC###EE#####kkkkkkkk##::::::::::::          
 -28       -21         -12             0               12          21       2
```

Legend: `#` walls and partitions, `.` indoor floor, `,` Stern Deck planks, `:` deck rails, `~` the sternwheel (outside, unreachable), `E` gangway (exit), `@` arrival, `L` Old Lucky in its bay, `t` telegraph, `F` Hall of Fame plaque, `P` paytable plaque, `S` soda fountain bar, `B` band stage, `o` columns, `R` roulette, `J` blackjack, `C` Penny's cage, `T` chart table, `a` armchairs, `k` bookshelves (split-flap board above), `d` stern doors, `r` River Wheel betting rail, `W` River Wheel, `g` Moonlight Lounge gate, `U` Lucky Falls, `V` Five Card Cabin cabinets, `h` Wheelhouse gate, `Q` Captain's Table, `H` ship's wheel.

### 6.2 Zones and dimensions

**Grand Saloon** (open): x -12 to 12, z -9 to 9 (24 x 18 m). Side walls 6.0 m; a clerestory over x -10 to 10, z -4 to 4 rises to 8.0 m with three chandeliers at x -7, 0 and 7 hanging to 5.2 m. Hull walls 0.3 m thick, arched windows 2.0 x 3.5 m every 4 m on both sides.
- **Gangway and exit:** opening in the port wall at x -1.1 to 1.1. Exit interaction spot (0, 8.4), range 1.7, "Back to Randroid's room". **Arrival (0, 6.4), yaw pi**: 2.0 m from the exit spot, so no exit prompt shows on arrival. The sign "Back to Randroid's room" hangs inside over the opening.
- **Old Lucky's bay:** the starboard wall opens at x -5 to 5 into a proscenium bay to z -12.5 with a 9.5 m roof. The machine is 5.0 wide, 2.2 deep, 7.2 tall (smokestacks to 9.0) at (0, -11.0); front face at z -9.9; reel window centre at y 3.6, 3.3 m wide, 2.3 m tall; lever pivot at (2.9, 3.2), arm 2.2 m, knob 0.45 m, on the right as drawn. A carpet medallion decal (r 3.2) at (0, -8.3). Collider box centre (0, -11.0), half sizes 2.6 x 1.2, height 8. **Lever spot (0, -8.6), range 2.4, yaw pi.**
- **Telegraph:** brass pedestal at (-3.6, -8.4), collider circle r 0.3, h 1.3. Spot (-3.6, -7.7), range 1.1 (3.7 m from the lever spot, so the two never compete).
- **Paytable plaque** on the starboard wall just right of the bay, centre (6.2, -8.85), 2.0 x 1.4 m, facing +z; spot (6.2, -7.6), range 1.2, opens the paytable and return in a panel. **Hall of Fame plaque** on the starboard wall at (-8, -8.85), 3.0 x 2.0 m, spot (-8, -7.6), range 1.4.
- **Spinning Lily (roulette):** table 3.8 x 2.0 centred (-6.5, -2.6), long axis along x, wheel bowl at the -x end. Collider box half 1.9 x 1.0, h 1.0. Spot (-6.0, -0.9), range 1.9, yaw pi. Spinner stands at (-6.5, -4.0). Pendant lamp at y 3.4.
- **Rivet's Twenty-One:** half-moon table, top centre (-7.5, 2.6), r 1.8, curve facing +z; Rivet at (-7.5, 1.95). Colliders as today (circle r 1.8 h 1.0, circle r 0.5 h 2.2). Spot (-7.5, 5.0), range 1.9, yaw pi: 2.4 m from the table centre as in the current build, and 2.8 m from Penny's spot.
- **Penny's cage (purser):** x -7 to -3, z 7.2 to 9 against the port wall; brass bars, counter at z 7.2, Penny at (-5, 8.2). Spot (-5, 6.3), range 1.6, yaw 0. Refills, boarding passes, a quick credits summary.
- **Captain's Logbook nook:** x 4 to 11, z 4 to 9. Chart table 2.4 x 1.4 at (7.5, 6.3), top 0.95 m. Armchairs at (5.2, 5.4) and (9.8, 5.4). Bookshelves along the port wall (x 4.5 to 10.5, z 8.7, 2.4 m tall); the split-flap board above them (4.0 x 2.0 m, centre y 4.0) facing -z. Spot (7.5, 5.2), range 1.6, yaw 0.
- **Band stage:** quarter disc r 2.6 centred on the bow-starboard corner (-12, -9), 0.25 m high (you can hop onto it; optional).
- **Columns:** 8 cast-iron columns, r 0.3, at x -10, -3.5, 3.5, 10 and z -4.2, 4.2 (they carry the clerestory edge). Central aisle x -2 to 2 is always clear from the gangway to Old Lucky.
- **Soda fountain bar** (decor): x 8 to 11.5 along the starboard wall, counter depth 0.8.
- **Lounge gate:** bow partition at x -12.15 with an arched opening z -2 to 2, glazed above 3 m; velvet rope between brass stanchions at x -11.6 (dynamic collider half 0.15 x 2.0, h 1.0) while locked. Monty at (-11.2, 2.6). Spot (-10.6, 0), range 1.6, yaw -pi/2.
- **Stern doors:** stern wall at x 12.15 with glass sliding doors z -2.5 to 2.5. They open when you come within 3 m and never block a player (dynamic collider only while closed and nobody near).

**Stern Deck** (open air): x 12.3 to 21, z -8 to 8, plank floor, rails 1.1 m tall along z ±8 and x 21 (colliders h 1.2). Festoon bulb strings from the deckhouse edge (x 12.3, y 6.0) to two masts at (21, ±7.5).
- **River Wheel:** disc centre (19.6, 3.9, 0), radius 3.1, facing -x, on an A-frame; collider box (19.8, 0) half 0.6 x 1.8, h 8. **Betting rail** collider (16.6, 0) half 0.15 x 1.4, h 1.0. **Spot (15.9, 0), range 1.8, yaw pi/2.**
- **Sternwheel:** axle at (24.5, 0.9), radius 3.4, 14 m wide, 12 buckets, beyond the rail and unreachable. Water level y -1.6.
- Benches along the rails; a telescope at (20.2, -6.5) (nice-to-have).

**Moonlight Lounge** (rank 2): x -21 to -12.3; the hull tapers from z ±9 at x -12.3 to ±6.5 at x -21.
- **Lucky Falls:** a freestanding tower (the hull wall slants here), board 3.6 wide and 5.2 tall on a 0.8 m deep base, centre (-16.5, -6.6) facing +z; bins at y 0.5 to 1.0. Collider box half 1.9 x 0.45, h 6. Spot (-16.5, -4.9), range 1.8, yaw pi.
- **Five Card Cabin:** three cabinets at x -14.5, -16.5, -18.5 on z 6.3, backs to the port hull, facing -z (colliders half 0.45 x 0.4, h 1.9). Spots (x, 5.3), range 1.1, yaw 0. All open the same game, so overlapping ranges are harmless.
- Lounge seating: four small round tables with lamps, colliders r 0.45.
- **Wheelhouse gate:** partition at x -21.15, opening z -1.2 to 1.2, a velvet rope and a brass bell-pull sign ("First Mates and pass holders"). Spot (-20.0, 0), range 1.6, yaw -pi/2; it opens the same gate panel as Monty's.

**Wheelhouse** (rank 3): x -28.5 to -21.3, the bow tapering from z ±6.5 to ±2.5. Wraparound forward windows.
- **Captain's Table:** half-moon, top centre (-23.6, -1.8), r 1.8, Captain Cog at (-23.6, -2.45). Spot (-23.6, 0.6), range 1.8, yaw pi.
- **Ship's wheel (helm):** at the bow tip (-27.6, 0) facing +x. Spot (-26.6, 0), range 1.4, yaw -pi/2 (3.1 m from the table spot). Changes the window scenery for you (town time, golden sunset, moonlight; saved on this device).
- The Captains' brass board on the port partition.

### 6.3 Collisions and camera
- All furniture uses `box` and `circle` colliders as listed; walls are thin boxes with height 10. Gates and the stern doors are returned from `extraColliders()` so they can open.
- Interior partitions are opaque only below 3 m where they need to be; above 3 m the arches are glazed, so aspiration is always visible.
- **Cutaway:** walls are segments with an inward normal. A wall drops to its skirting stub when the camera is outside it, or when the camera and the player (or the cinematic target during a cinematic) are on opposite sides of it and the line between them crosses the wall's span. `cutaway(cam)` runs before `update(..., focus)` each frame, so it uses last frame's focus (one frame late is invisible).
- **Ceilings and the clerestory are single-sided and face inward**, so a high camera sees through them from above without any cutaway logic, and they never hide the player.
- Layout clearances are tested (section 7.9): aisles at least 1.2 m, every spot reachable from the arrival on a grid path, no spot inside a collider.

### 6.4 Landmarks and sight lines
- From the arrival, straight ahead 15 m: Old Lucky in its lit bay under the central chandelier, the brightest thing in view.
- Left (bow): the tables under their green pendants, the band on its stage, and beyond them the blue glow of the Moonlight Lounge through its glazed arch.
- Right (stern): the glass doors, and through them the River Wheel's ring of bulbs with the river and lanterns behind.
- From the Stern Deck looking forward: the whole saloon through the doors, Old Lucky's smokestacks above the crowd of brass.
- From the Wheelhouse: the river ahead, the best view on the boat.

### 6.5 Outside the hull
A real outside world, because the dollhouse cutaway shows it: a river plane all around (y -1.6), two bank strips with low hills, instanced trees, a few cottages with lit windows at night, leapfrogging past the boat so it always feels under way (the boat moves bow first, so scenery slides towards +x). A sky dome follows the town's day and night (`night` and `phase` from `update`), with stars, a moon, and fireflies on the banks at night.

---

## 7. Technical plan

### 7.1 Modules and files

```
src/experiences/casino/
  casino.ts        Casino implements SpaceView: builds zones, wires games, actions, kick, step,
                   extraColliders, cutaway, setQuality, render, resize, debugInfo, dispose
  casino.css       every casino style (HUD, panels, logbook, charts); imported from casino.ts
  layout.ts        the deck plan as plain data: zones, walls, colliders, spots, gates
                   (no THREE, no DOM; used by the build and by tests)
  boat.ts          hull, floors, walls with cutaway groups, ceilings, columns, windows, trim,
                   merged per material per zone (the arcades.ts Batch pattern)
  river.ts         sky, water, banks, scrolling scenery, time of day, window scenery choice
  lighting.ts      tiered light rig, light-pool decals, instanced bulbs and chase patterns
  staff.ts         one automaton rig (body, head, arms, emissive eyes, hat) for Penny, Rivet,
                   Spinner, Monty, Captain Cog and the band; idle, look-at, gestures, bubbles
  hud.ts           credits odometer, bet chip, voyage net, rank badge with ring, next-stamp hint,
                   jackpot strip near Old Lucky
  panel.ts         the docked table panel shell: header (credits, chips), coach line, status,
                   Odds sheet, Rebet/Hint, onPrev/onNext bet, onBack stand up
  seat.ts          seat framings per station and the panel-aware framing (kit camera override)
  economy.ts       client state: stats, jackpots, rank, passes, voyage id, day; API wrappers;
                   refresh policy; optimistic bet display that the server result replaces
  celebrate.ts     win tiers, ceremony director (MINI, MAJOR, GRAND), coins, confetti,
                   fireworks, a seeded 2D coin-pile sim on the floor
  audio.ts         songs as data for the kit sequencer, zone ambience beds, new sfx cues
  logbook.ts       the Captain's Logbook panel (tabs, tiles, charts, table view, stamps, boards)
  charts.ts        SVG chart builders and the hover and focus tooltip layer
  boards.ts        split-flap board canvas texture with per-cell flips, board rotation
  gates.ts         ropes, Monty's panel, unlock flow, pass purchase
  games/oldlucky.ts    giant slot: reels (3 x 3 window), lever, telegraph, smokestacks,
                       jackpot marquee, bonus hand-off to the River Wheel
  games/roulette.ts    table, wheel, ball, 3D chips, betting-board panel
  games/blackjack.ts   table, shoe, 3D cards, split, coach; also the Captain's Table variant
  games/riverwheel.ts  money wheel, flapper, sternwheel, bonus ring mode
  games/falls.ts       Lucky Falls board, pegs, pearls (deterministic path animation)
  games/poker.ts       cabinets, Five Card Cabin panel, hint
src/shared/
  slots.ts             kept; new strip, paytable, bonus ring, jackpot rules, expectedReturn()
  casino-games.ts      kept; roulette multi-bet, blackjack split, bjAdvice (S17 and H17), six-card Charlie
  casino/wheel.ts      River Wheel segments, returns
  casino/plinko.ts     rows, bits to bin, returns (named plinko only in code)
  casino/poker.ts      evaluator, 6/5 paytable, holdAdvice rule list
  casino/progress.ts   stamp definitions and checks, ranks, passes, gates, bet limits
  casino/stats.ts      CasinoStats v2, defaults for old records, day and voyage bucketing
server/casino/
  account.ts      load and CAS-update stats, refill, passes, boards, GET summary
  slots.ts  tables.ts  wheel.ts  plinko.ts  poker.ts  jackpot.ts  stamps.ts
server/scores.ts  keeps kart and galaxy; re-exports the casino functions for old callers
api/casino.ts     all casino actions (zod union); api/scores.ts keeps spin, refill, roulette and
                  blackjack as aliases for one release, so open tabs keep working
scripts/casinotest.ts      the full playtest (desktop, PHONE=1, PAD=1, REMOTE=1)
tests/casino-*.test.ts     rules, server, progress, layout, geometry
```

`src/experiences/casino.ts` and `casino-tables.ts` move into the folder and are deleted; `game.ts` imports `../experiences/casino/casino` (the class stays `Casino`, the kind stays `casino`, so published content needs no change).

### 7.2 SpaceView hooks
- `actions(player)`: one action per station in range (lever, telegraph, tables, wheel rail, Penny, logbook, plaques, gates, helm, exit). Locked stations stay as actions that open Monty's explanation, never silent.
- `kickAction`: within 2.6 m of the lever spot it cycles the bet (as today). Jackpot coins scatter to the sides of the bay; walking through them pushes them, and Kick away from the lever sends nearby coins flying (local fun only).
- `step(h, player)`: auto doors, gate colliders, the coin-pile 2D sim (discs on the floor pushed by the player and kicks, seeded RNG), staff look-at targets.
- `extraColliders()`: closed ropes and closed stern doors.
- `holdsTime()`: false (nothing is timed). `gravity()`: default.
- `setQuality(tier)`: switches materials, particle budgets, scenery density, light count, shadow map, post chain (section 7.3).
- `render(renderer, camera)`: medium and high run the kit post chain (bloom, vignette, grade); low returns false and the engine renders directly.
- `resize()`: rebuilds the post chain key.
- `cutaway(cam)`: the segment rule in 6.3.
- `update(night, t, phase, focus)`: animations, river and sky, ceremonies, HUD, board polling (every 20 s, 30 s on TV).
- `debugInfo()` and debug calls (7.8).
- Kit use: particles (coins, steam, spray, confetti, sparks, fireworks), post, hud (banners, countdown not needed, toasts, score pops, results card, intro card), music (songs and beat clock), camera (seat framings, bonus flight, jackpot orbits, shake), scores (board storage helpers). If a kit piece is late, the fallbacks are the existing `ui.banner`/`ui.toast`, the existing `sfx`, no post, and cuts instead of camera flights.
- Engine requests (small, optional): an avatar accessory hook for a Captain's cap (nice-to-have), and `ExperienceCtx.teleport(x, z, yaw)` for a future Sky Deck reached by lift (nice-to-have). The must-have list needs neither.

### 7.3 Performance budget per tier

| | Low (TV, older phones) | Medium (phones default) | High (desktop) |
| --- | --- | --- | --- |
| Draw calls in a typical view | 110 or fewer | 200 or fewer | 320 or fewer |
| Triangles in view | 150k | 400k | 900k |
| Lights | hemisphere plus one directional, no point lights; light pools are decals and emissive | plus 3 point lights (chandeliers) | plus 6 point lights (chandeliers, Old Lucky, River Wheel, lounge) |
| Shadows | blob shadows only | one 1024 directional map with a tight frustum around the player | 2048 map, wider frustum |
| Post | none | half-resolution bloom (strength 0.45, threshold 0.82), vignette and grade in one pass | full-resolution bloom 0.6, vignette, grade, faint grain |
| Environment map | none, matte brass | one small PMREM made once from a procedural room | same; brass metalness 0.85 |
| Particles alive | 300 | 1,500 | 5,000 |
| Scenery | 60 instanced trees, 400 stars, plain scrolling water texture | 200 trees, 1,500 stars, 60 fireflies | 400 trees, 4,000 stars, 200 fireflies, water shader with moon and lantern glints |
| Canvas texture scale | 0.5x | 1x | 1x, anisotropy 8 |
| Texture memory | 24 MB | 48 MB | 96 MB |
| Frame target | 30 fps on the Samsung TV | 60 fps on a mid phone | 60 fps |

How it stays inside the budget:
- **Merged statics:** architecture and furniture are merged per material per zone (the `Batch` from `arcades.ts`), about 25 static draw calls for the whole boat. Zones are separate groups, so frustum culling drops whole rooms.
- **Instancing:** bulbs (about 600 across Old Lucky, the wheel, marquees and festoons) in three `InstancedMesh`es with per-instance colour for chases; chips in one instanced mesh per denomination; pegs, trees, coins and stars instanced; cards from one 53-card atlas with per-instance UV offsets.
- **Dynamic canvas textures** (reel strip, boards, chart table, jackpot marquee) only redraw when their content changes, at most a few times per second.
- Glass and transparent parts are few, sorted by `renderOrder`, with `depthWrite` off.
- The playtest records frame times per tier (as `galaxytest.ts` does) and reads `renderer.info` for draw calls and triangles.

### 7.4 Procedural geometry and textures only
Everything is built from rounded boxes, lathes (columns, chandeliers, smokestacks, pearls), tubes (lever, rails), extrusions (fretwork, wheel segments, gingerbread arches) and canvas textures (carpet pattern, felt layouts, reel strip, wheel faces, card atlas, plaques, boards, river chart, water ripple). No asset files, no network fetches, no paid services. Fonts are the two already bundled.

### 7.5 Z-fighting prevention
- No coplanar faces in the static batch: decals (carpet medallion, light pools, felt chips shadows) sit 4 to 6 mm above their surface with `polygonOffset` (factor -1, units -4) and `depthWrite` off.
- Felt layouts are textures on the felt mesh itself, never a second plane on top.
- Signs and plaques stand 1 to 2 cm proud of walls; the existing `sign()` helper does this when used as documented.
- Reels sit 2 cm behind the window frame; roulette wheel face and bowl use different radii and heights; cards stack 2 mm apart; chips in a stack have 1 mm gaps; the chart parchment is 3 mm above the table top.
- Walls start at the floor and meet it at right angles; the cutaway stubs are separate meshes, never overlapping the full wall when both are visible (only one is visible at a time).
- **A geometry test** (`tests/casino-geometry.test.ts`) builds the static batches in Node (geometry only, no renderer) and fails if any two triangles from different meshes are coplanar (normals within 0.1 degrees, planes within 1 mm) and overlap. Motion screenshots in the playtest catch the rest.

### 7.6 Server and scores
**Stats v2.** `CasinoStats` gains optional fields, filled with defaults when an old record loads, so existing balances survive:
- `games`: per game `{ plays, spent, earned, best }`.
- `days`: the last 90 play days `{ d, spent, earned, plays, open, close, high, low }`. The client sends its local date; the server accepts it if it is within 14 hours of server time, else uses UTC.
- `voyages`: the last 20 visits `{ id, at, until, open, close, high, low, plays, spent, earned, best }`. The client makes a voyage id when it enters the area and sends it with every play; a new id closes the previous voyage (and may award Shore leave).
- `stamps`, `passes`, `passSpent`, `refillCredits`, `streak`, `lowSinceRefill`, `bookMoves`, `playDays`.
- Invariant (tested): `balance = START_CREDITS + refillCredits + earned - spent - passSpent`.

**Endpoint** `api/casino.ts` (POST unless noted; every play body carries `roomId, areaId, browserId, name, voyage, day`):
- `GET ?roomId&areaId` (x-browser-id): stats, rank, boards (balance, wins, stamps), fame, jackpots, open blackjack and poker hands.
- `slot {bet}` returns `{ stops, rule, win, bonus?: { segment, award, jackpot? }, stats, jackpots, newStamps }`.
- `refill`, `pass {pass}`.
- `roulette {bets: [{type, number?, amount}]}` (up to 8) returns `{ pocket, win, perBet, stats, newStamps }`.
- `blackjack {move: deal|hit|stand|double|split, bet?, table: saloon|captain}` returns `{ hand (with hands[] after a split), stats, newStamps }`.
- `wheel {bets: {symbol: amount}}` returns `{ segment, win, stats, newStamps }`.
- `plinko {bet, risk}` returns `{ bits, bin, mult, win, stats, newStamps }`.
- `poker {move: deal|draw, bet?, holds?}` returns `{ hand, result, win, stats, newStamps }`.

**Rules on the server:** outcomes from `node:crypto` `randomInt` inside the stats CAS (as today); bets validated against the game's limits and your rank or passes; gates enforced; stamps checked in the same update that records the play (shared `progress.ts`); rate limit 120 plays a minute per browser across all games (raised from 90 because pearls can be dropped quickly), 400 a minute per network (kept).

**Jackpots:** `casinospins:<room>:<area>` is a plain `incr` per Old Lucky spin (atomic, cheap). `casinojp:<room>:<area>` holds `{ rev, grandAt }`; GRAND = min(600, 250 + 0.01 x (spins - grandAt)) x bet. A GRAND win CAS-updates `grandAt`. MAJOR and GRAND wins `lpush` to `casinofame:<room>:<area>` (max 20).

**Boards:** `casinoboard:` balance (kept), `casinowin:` biggest single win (only written when improved), `casinostamps:` stamp count (only when it changes), `casinocapt:` captains. `clearScores` clears them all plus the jackpot keys.

**Cost per play:** about six Redis commands (stats get and CAS, one or two zadds, the spins incr for slots, a rate-limit incr). The GET is about 15 commands every 20 seconds while in the casino.

### 7.7 Client timing with the server
The animation starts at once and the result lands inside it: reels spin until the response; the roulette ball orbits; the River Wheel spins up; the pearl wobbles in the chute for 0.35 s before its first peg. Credits show the bet leaving at once and the server's numbers when the reveal ends. On failure the animation resolves to a calm stop with "Couldn't reach the boat. Your credits weren't touched." (the server never charged).

### 7.8 Headless testability
- **`debugInfo()`**: zone, tier, draw calls and triangles, every spot with yaw, gates (open or closed), rank, stamps, next stamp, stats summary, jackpots, voyage id, per game state (`slot.shownStops` and `lastServerStops`, `roulette.shownPocket` and `lastPocket`, blackjack hand, `wheel.shownSegment` and `lastSegment`, Lucky Falls pearls in flight and shown bins, poker hand and holds), ceremony `{ kind, t }`, open panel name, intro shown.
- **Debug calls** (`experienceCall`): `debugTimeScale(k)` speeds animations only; `debugSkipCeremony()`; `debugSeat(name)` frames a station for screenshots; `debugFrameStats()`. None of them touch the server or credits.
- **Deterministic animation:** the reveal is a pure function of the server result (reel stops, pocket, segment, the 12 bits, the cards), so the test asserts the shown result equals the server's. The coin pile uses a seeded RNG.
- **`scripts/casinotest.ts`** claims a local room, publishes the Casino through the dev admin, and drives real input:
  1. Arrival, intro card dismissed, walk to Old Lucky with real movement keys or the touch stick (no teleport for this leg), three spins, the telegraph with Interact only, Kick changes the bet (desktop, phone, pad).
  2. Roulette: three chips placed by focus navigation, spin, shown pocket equals server pocket.
  3. Blackjack: deal, Hint, play to the end. The playtest cannot choose cards, so split is covered by unit tests; the playtest presses Split only when the dealt pair allows it.
  4. Through the stern doors on foot, River Wheel with two bets, shown segment equals server segment.
  5. Five stamps reached by those first plays, rank Bosun, the lounge rope opens, walk in.
  6. Lucky Falls on each risk; poker deal, hold two, draw.
  7. The Wheelhouse gate shows the pass offer and refuses.
  8. The Logbook: every tab, the table view, a focused bar shows its tooltip.
  9. Exit by the gangway.
  10. Asserts: the balance invariant after each game, no console errors, frame times per tier, day and night screenshots, motion screenshots for shimmer.
  - `PHONE=1` taps the touch buttons and panel buttons at 390 x 844; `PAD=1` uses the injected standard gamepad (d-pad focus, A, B, LB/RB, X); `REMOTE=1` uses a Tizen user agent (so `IS_TV` is true) and presses only arrows, Enter and Back (key code 10009 through CDP), never E, F, Space, Tab or the mouse.
  - Lines added to `scripts/autobuild/playtests.txt`: `casinotest.ts`, `PHONE=1 casinotest.ts`, `PAD=1 casinotest.ts`, `REMOTE=1 casinotest.ts`. `experiencetest.ts` keeps its casino section, updated for the new spots.

### 7.9 Unit tests for rules
- `casino-slots.test.ts`: exact return with GRAND at 250x between 0.93 and 0.955, at 600x at most 0.98; hit rate at least 0.33; net-win rate at least 0.18; bonus between 1 in 250 and 1 in 350; MINI, MAJOR and GRAND frequencies; the strip has 20 stops with the stated counts.
- `casino-games.test.ts` (extended): roulette multi-bet returns per bet and totals; blackjack split, split aces, double after split, six-card Charlie, dealer hits soft 17 at the Captain's Table; `bjAdvice` spot checks against the published 6-deck S17 and H17 charts; a simulation of a million basic-strategy hands keeps both tables between 99 and 100 percent.
- `casino-wheel.test.ts`: 51 segments, every symbol returns 48/51.
- `casino-plinko.test.ts`: rows symmetric, each risk between 0.94 and 0.96, bits map to bins.
- `casino-poker.test.ts`: the evaluator on every hand class, the 6/5 paytable, the hold rule list's expected value within 1 percent of exhaustive search on 2,000 random hands (exhaustive runs in the test only), holds respected by the server, no peeking at the deck through the view.
- `casino-progress.test.ts`: every stamp awarded by its event and only once; rank thresholds; passes; gates enforced on the server (403); bet limits by rank.
- `casino-server.test.ts`: v1 records load with defaults; the balance invariant; voyages and days bucketing; jackpot counter, GRAND reset and fame; boards; concurrent plays with CAS; refill only when out.
- `casino-layout.test.ts`: spots outside colliders, aisles at least 1.2 m, every spot reachable from the arrival on a 0.25 m grid, the arrival outside the exit range.
- `casino-geometry.test.ts`: no coplanar overlapping triangles in the static batches.
- Docs: `docs/VERB_SHEET.md` rows for every game, the telegraph, gates, the logbook; `docs/ACCEPTANCE.md` "Built from sketchbook pages" row for this rebuild; `AGENTS.md` "Where things are" paths.

### 7.10 The Captain's Logbook (stats lounge in detail)
The original request is "credits earned and spent tracked over time", so the logbook is a first-class feature, not a kiosk.

**In the world:** the chart table's parchment shows "your river": the balance over your plays drawn as a winding river on a nautical chart, with a lighthouse at each refill, a star at each big win and a golden paddle at each jackpot, redrawn in ink when it changes. The split-flap board above the shelves rotates through the four boards every 10 seconds, flipping only the cells that change.

**The panel** (tabs; LB/RB or the tab buttons switch, all focusable):
1. **Overview:** a hero balance (48 px), then stat tiles: Earned, Spent, Net (with an up or down arrow and a sign, never colour alone), Plays, Biggest win, Refills, Passes. A "This voyage" row: opened at, now, high, low, plays.
2. **Over time:**
   - "Your river": a single ivory 2 px line of balance over plays, a dashed "Start" baseline at 1,000, refill and jackpot markers along it. Range: last 50 plays, last 7 days, all. Crosshair and tooltip on hover; on a controller or remote, focus the chart and Left/Right step point to point.
   - "Earned and spent by day": diverging bars per play day: earned up in amber `#c27c1a`, spent down in teal `#2b9cb0`, zero line `#6b7680`, 2 px gaps, rounded far ends; a legend (Earned, Spent); tooltip "Tue 6 Oct: earned 1,240, spent 1,300, net -60, 52 plays". Last 14 play days.
3. **By game:** paired horizontal bars per game (spent teal, earned amber) on one credits axis, a legend, and text on each row: "Your return 91%. The boat keeps about 5 in 100 over time."
4. **Voyages:** cards for the last 10 visits: date, start and end balance, high, plays, best moment.
5. **Stamps:** the 35 stamps in a grid, earned ones inked, the rest embossed with a one-line hint; progress to the next rank.
6. **Boards:** Top balances, Biggest wins, Most stamps, Hall of Fame, Captains.
- **Show numbers:** every chart has a table view toggle.
- Chart text uses the text inks (ivory and muted), never the series colours. The amber and teal pair passed the palette validator on the dark surface `#13212b` (lightness band, chroma floor, colour-blind separation 18.1, normal separation 22.3, contrast). A light theme would need its own validated steps.

---

## 8. Scope

### Must-have for the first release (priority order)
1. The boat: Grand Saloon, Stern Deck, outside river and sky with day and night, tiered lighting and post, cutaway, layout tests, z-fighting test.
2. Old Lucky: giant 3 x 3 machine as drawn, new strip and paytable, telegraph, steam, win tiers, honest celebrations.
3. Server v2: stats v2 with migration, `api/casino.ts`, invariant, voyages and days, rate limits, aliases for old calls.
4. The Captain's Logbook: in-world chart table and split-flap boards, the panel with all six tabs and table views.
5. The River Wheel, with the Paddle Wheel Bonus and MINI, MAJOR and GRAND jackpots, the ceremony director and the Hall of Fame.
6. Roulette betting board with multi-bets; blackjack split and Hint (Rivet), Spinner the croupier.
7. Stamps, ranks, gates, passes, Penny's cage, Monty, the next-stamp hint and carpet path.
8. Moonlight Lounge with Lucky Falls and Five Card Cabin.
9. Wheelhouse with the Captain's Table and the window scenery helm.
10. Music (three songs), ambience beds, the band automatons on the beat clock, all new SFX.
11. Onboarding: intro card, Penny's greeting, coach lines, staff bubbles, healthy-play toasts.
12. `casinotest.ts` on desktop, phone, pad and remote, with tier frame times; docs updated.

### Nice-to-haves (priority order)
1. Roulette splits, streets and corners.
2. Bonus Poker and Deuces Wild cabinets.
3. Crown and Anchor birdcage.
4. Captain's welcome: one free River Wheel spin at bet 10 per day, never stacking, no streak (needs the creator's approval, section 9).
5. Hi-Lo ladder in the Wheelhouse.
6. The Paddle Pusher coin pusher.
7. More window routes (bayou, canyon, city lights).
8. Captain's cap on the avatar (engine accessory hook).
9. A Sky Deck by brass lift (engine teleport hook): open-air top deck with the smokestacks and a fireworks view.
10. Telescope on the Stern Deck (look at the moon and the town).
11. The Purser's safe: put credits away so you don't bet them by accident (refill would then count the safe too).

---

## 9. Risks and open questions

**Risks**
- **Scope.** This is about eight to nine weeks for one strong engineer. The priority list is ordered so every cut still ships a complete world; items 1 to 7 alone are a big upgrade.
- **TV performance.** A 50 m boat with an outside world on a weak GPU. Mitigation: merged statics, instancing, zone groups, no point lights and no post on low, measured frame times in the playtest.
- **The kit is still being built.** Every kit dependency has a fallback (7.2); the camera flight for the bonus falls back to a cut.
- **Economy drift.** Jackpots and the higher return of blackjack can inflate the balance board over months. The stamps and biggest-win boards balance recognition; the creator can clear boards with the existing tool. Returns are pinned by tests.
- **Store load.** About six commands per play and polling every 20 s. Writes to boards only happen when values change.
- **Photosensitivity and motion.** Flashes capped at 3 Hz, large red flashes avoided, Reduce motion respected; verify on a real TV.
- **Transparency sorting** of glass arches and doors against bulbs and particles; keep glass few and ordered.
- **Data migration.** Old `CasinoStats` and blackjack hands must load; tested with stored v1 fixtures.
- **Rank reachability in the playtest.** Bosun is reachable with five deterministic first-play stamps; First Mate is not, so the Wheelhouse is covered by server unit tests plus a refusal check in the playtest. No test backdoors.

**Open questions for the creator**
1. Is a riverboat the identity you want, and is "The Golden Paddle" the name? (Alternatives: a toy-scale Monte Carlo of wind-up tin toys, or a space-age lounge. Space was avoided because the galaxy and neon worlds already live there.)
2. Is a gambling-themed world right for a kid-friendly town at this depth? The healthy-play rules (3.5) are designed in; do you also want a one-time "play credits only" note before the intro card?
3. Are boarding passes bought with play credits welcome, or should ranks be earned only?
4. Is a once-a-day free River Wheel spin acceptable (no streaks, no stacking), or is it too close to a login reward?
5. Should the balance board stay the headline board, or should Most stamps lead?
6. Day boundaries: the player's local day (as planned) or UTC?
7. Do you want the engine hooks for a Captain's cap and a lift to a Sky Deck, or keep the world entirely within the current hooks?
8. Keep the existing balances and history when stats v2 ships (planned), or start everyone fresh on the new boat?

## Decisions after review

Decisions on your questions:
1. The riverboat "The Golden Paddle" is the identity: yes.
2. The depth is fine, with your healthy-play rules. Add one plain line to the intro card: play credits only, never real money.
3. Ranks are earned only. No boarding passes bought with credits.
4. No daily free spin. It is too close to a login reward.
5. The balance board stays the headline. A stamps board next to it is fine.
6. Days follow the player's local date.
7. No cap or lift hooks for now.
8. Keep existing balances and history. Stats v2 must migrate the stored v1 stats and blackjack hands, with tests.

Server: the server still decides every outcome. Put the casino's server logic in a new server/casino.ts. You may add api/casino.ts; Vercel will then run 6 functions, which is fine. The old api/scores.ts casino actions (spin, refill, roulette, blackjack) must keep working as aliases, so old open tabs do not break. Keep your edits to server/scores.ts and api/scores.ts to the minimum needed for those aliases.

Scope: your estimate of eight to nine weeks was for a human engineer. Work through must-haves 1 to 12 in order, fully polished. Music (10) and onboarding (11) are cheap with the kit, so build them alongside items 1 to 3 rather than at the end. If you must cut, cut whole items from the bottom (9, then 8) and say so.
