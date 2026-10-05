# Toyboxes

A playful town in the browser. Walk around, ride a scooter, drive a go-kart, kick a ball into a goal, and visit the SpaceChakra and VibeCoded Games arcades. Claim a house as your own room, fill it with toys, and write the games you want in its sketchbook. The creator reads those pages, builds the games, and puts them back in your room for everyone to play.

Play at **https://toyboxes.games**. Works with touch, keyboard and mouse, controllers, and TV remotes.

## What's in the first release

- **The town:** a round plaza with a clock tower that tells the town's time, a ring road for the vehicles, twelve claimable houses, and entrances to SpaceChakra Arcade and VibeCoded Games.
- **Day and night:** a 24-minute cycle from the wall clock, so every visitor sees the same sky. Street lamps, porch lights and lit signs keep entrances readable at night. Settings can pin it to day, sunset or night.
- **Toys:** soccer balls, positionable goals that detect goals, bowling pins that topple each other, cones, toy blocks, and targets with a bullseye. Kicks and collisions are simulated locally, so nobody's kick changes the shared layout.
- **Rooms:** claim an available house with a remembered nickname and a four-digit PIN (entered twice). Anyone can visit any room; the PIN only guards changes. Inside are a sketchbook, a toy chest for arranging toys and painting the room, and whatever the creator has published.
- **The sketchbook:** one page per idea with a typed description and an optional drawing. Every visitor can read it; writing needs the room PIN. Turn to a new page for a new request, or edit an older page to revise it. Pages keep their identity, drafts survive failed saves, and edits from two devices ask which version to keep.
- **Built experiences:** an inner area can be a kart track or a casino instead of a toy room.
  - *Kart track:* the course is drawn on a sketchbook page and smoothed into a road with curbs, a start gantry, tyre stacks and lamps. Three computer drivers lap it all the time; stop on the race pad in your kart for a 3-lap race from the grid with a countdown and live positions. Laps are timed with shortcut and wrong-way checks, personal bests are kept, and a board at the start shows everyone's best laps.
  - *Casino:* a giant three-reel slot machine with a pull lever. The server decides every spin. Players start with 1,000 play credits and get a free refill when they run out; the credits kiosk shows each player's totals and balance over time, and a wall board shows the top balances. Credits only exist inside that casino.
- **Updates and installing:** open copies notice a new deploy within a minute and offer a refresh that brings you back to the same spot (also in the pause menu for controllers and remotes). Settings has an Add to home screen option.
- **Creator tools** at `/admin`: a feed of new and changed pages, page status (requested, being built, ready to play), page history and revert, PIN reset, release, restore, move or relabel claims, and an editor that places game cabinets and up to three inner areas on a room map, linked to the pages they came from.
- **Arcades:** normal same-tab navigation with a confirmation; the town remembers where you were, so Back puts you outside the same door.

Visits are solo by design: shared rooms mean shared saved content, not live multiplayer.

## Controls

| | Touch | Keyboard and mouse | Controller | TV remote |
| --- | --- | --- | --- | --- |
| Move | Left thumb | WASD or arrows | Left stick or d-pad | Arrows |
| Look | Drag on the right | Drag | Right stick | (camera follows) |
| Use, ride, enter | Big button | E or Enter | A | OK |
| Kick, brake | Kick button | Space | X | |
| Menu | Menu button | Esc | Menu | Back or red key |

Menus and dialogs work with the d-pad and arrows. Text fields open an on-screen keyboard on controllers and TVs. Back inside the game opens the menu instead of leaving the page.

## Running locally

```bash
npm install
npm run dev     # http://localhost:5207, API served from memory, admin password "toyboxes-dev"
npm test
npm run build
```

`npm run dev` needs no accounts or environment variables. The API runs the same handlers as production against an in-memory store, which resets when the dev server restarts.

## How it is built

- **Client:** Vite, TypeScript and Three.js. Everything is built from code: rounded toy shapes, painted signs, a shader sky. A small fixed-step 2D physics layer handles walking, vehicles, balls and pins. Render resolution adapts to frame time.
- **Server:** Vercel functions in `api/` over Upstash Redis (the shared `upstash-kv-aqua-envelope` store, keys prefixed `toyboxes:v1:`; preview deployments use `toyboxes:preview:v1:`). The entrance claim commits with `SET NX`, so a race has exactly one winner. Layouts, pages and content use compare-and-set on a revision number.
- **PINs:** hashed with scrypt and a per-room salt, checked only on the server, throttled per room and per network. A correct PIN returns a 30-minute edit token bound to the room and the PIN's version, so an admin PIN reset signs out every old session. The game locks again after five quiet minutes or when you leave the room.
- **Admin:** `ADMIN_PASSWORD` sign-in, an HttpOnly SameSite=Strict session cookie signed with `TOYBOXES_SECRET`, and a required custom header on every admin call.
- **Claim limits:** one active room per browser, a ten-minute cooldown, and six claims per network per day. The admin can release claims or let a browser claim again.

### Environment

| Variable | Purpose |
| --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis, injected by the Vercel integration |
| `TOYBOXES_SECRET` | Signs edit tokens, admin sessions and browser keys |
| `ADMIN_PASSWORD` | Password for `/admin` |

Scores live under the same prefix: `lap:<room>:<area>` and `casinoboard:<room>:<area>` sorted sets, `casino:<room>:<area>:<browser>` credit records, and `scorename:<browser>` for the name boards show.

## Deployment

Pushes to `main` deploy to production on Vercel (project `toyboxes`, team `randroid88s-projects`). Pull requests get preview deployments with their own key namespace. `toyboxes.games` is the main domain; `toyboxes.app` and the `www` hosts redirect to it.

## Checks

`npm test` covers the layout rules and the API (claim races, PIN throttling, token revocation, page identity and conflicts, rename scope, admin auth, publishing). The scripts in `scripts/` drive the real app in a browser with touch, keyboard, gamepad and admin flows and save screenshots. See `docs/ACCEPTANCE.md` for each release check and its evidence, and `docs/VERB_SHEET.md` for the core interactions.
