# Worlds

Each inner area was rebuilt as its own game in October 2026, after the creator asked that "every room should feel like its own world, its own AAA game". Each world was designed first, reviewed, then built on its own branch and merged into `main`. The docs here are those designs, each with the review decisions at the end. What shipped, and how it is tested, is in `docs/ACCEPTANCE.md` and `docs/VERB_SHEET.md`.

| World | Room and area | Code | Playtest | Design |
| --- | --- | --- | --- | --- |
| Toybox Grand Prix | Room 1, `kart-track` | `src/experiences/kart/`, `src/shared/kart/`, `server/kart.ts` | `scripts/karttest.ts` | [kart.md](kart.md) |
| The Golden Paddle | Room 1, `casino` | `src/experiences/casino/`, `src/shared/casino/`, `server/casino.ts` | `scripts/casinotest.ts` | [casino.md](casino.md) |
| Little Puffington | Room 2, `puff-challenge` | `src/experiences/fart/`, `src/shared/fart/` | `scripts/farttest.ts` | [fart.md](fart.md) |
| Club Nova | Room 11, `neon-party` | `src/experiences/neon/`, `src/shared/neon/` | `scripts/neontest.ts` | [neon.md](neon.md) |
| Black hole bloom | Room 12, `black-hole-galaxy` | `src/experiences/galaxy/`, `src/shared/galaxy-rules.ts` | `scripts/galaxytest.ts` | [galaxy.md](galaxy.md) |

Every world shares the kit in `src/experiences/kit/` (see "Building a world" in `AGENTS.md`) and loads as its own chunk the first time someone enters it. Each playtest runs on desktop and with `PHONE=1`, `PAD=1` and `REMOTE=1`.

## Left out of the first release

These were planned but cut or deferred. They are the obvious next steps for each world.

- **Black hole bloom:** the keepers wall and a daily storm (both need new server logic), the star garden island and a tiny planet shader.
- **The Golden Paddle:** passes and a daily free spin were dropped in review. Dates are local to the player.
- **Club Nova:** no daily remix. Wide timing assist runs save local bests only and stay off the boards.
- **Toybox Grand Prix:** shared boards take time trial laps only. Races keep personal bests on the device.

Nobody has yet listened to the music at real volume or played the worlds on the Samsung TV, a real phone or a physical controller. `docs/ACCEPTANCE.md` lists these under "Needs a person".
