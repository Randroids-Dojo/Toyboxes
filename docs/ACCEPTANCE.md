# First release acceptance

The GDD's fifteen release checks, what passed, and what still needs a person with the device in hand. "Automated" means a script drove the running app with real input events and asserted the result; screenshots land in `/tmp/toyboxes-*`. Unless noted, every automated check passed both locally and against production at https://toyboxes.games (production runs clean up their data with `scripts/kvsnapshot.ts`).

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Name asked once, remembered on return; same name elsewhere gets no rights | Automated | `playtest.ts` steps 1 and 8 (reload asks nothing); `server.test.ts` "a token for one room cannot edit another", rename with two rooms both named Alex |
| 2 | Explore, enter indoor spaces, ride both vehicles, readable day and night | Automated, plus judgment | `playtest.ts` steps 2, 3, 3b, 4; screenshots at night and day (the cycle is shared from the clock). Night readability judged from screenshots; confirm on the TV |
| 3 | Claim only after entering and confirming a four-digit PIN; a race has one owner | Automated | `server.test.ts` claim race (also passes against live Upstash with `KV_CHECK=1`), PIN mismatch and leading zeroes; `playtest.ts` step 4, `padtest.ts` step 4 |
| 4 | Anyone can enter every published room and inner area; entry never asks for a PIN | Automated | `admintest.ts` second browser enters the room and its inner area; asserts no PIN pad appeared |
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

## Needs a person

- Load https://toyboxes.games on the Samsung S90H browser: check that focus is visible, the remote's arrows, OK and Back work, the on-screen keyboard and PIN pad work from the couch, and whether the TV browser exposes a paired controller.
- Play on a real phone: stick feel, drag-to-look, the system keyboard over the sketchbook, and frame rate.
- Judge vehicle handling, camera comfort and night readability; the numbers are in `src/world/vehicles.ts`, `src/game/camera.ts` and `src/world/sky.ts`.

## Choices made where the GDD left them open

- **Engine and data:** Three.js with a custom flat-ground physics layer; Upstash Redis behind Vercel functions.
- **Admin auth:** a password from `ADMIN_PASSWORD` with a signed HttpOnly session cookie. Swapping in an identity provider later only touches `server/admin.ts`.
- **Town:** 12 claimable houses around a ring road; vehicles are parked objects you can ride away and leave anywhere (the menu parks them again).
- **Day and night:** a 24-minute cycle shared through the wall clock; settings can pin day, sunset or night.
- **Sketchbook:** pages are private to PIN holders and the creator. Owners see a status stamp (Requested, Being built, Ready to play) that the creator sets. Drawing is a simple pen with six colours, three sizes, undo and clear.
- **Unlock lifetime:** 30-minute edit tokens; the game relocks after 5 quiet minutes or on leaving the room.
- **Claim limits:** one active room per browser, a 10-minute cooldown, 6 claims per network per day, 5 wrong PINs per room per 15 minutes, 25 per network per hour.
- **Domains:** toyboxes.games is canonical; toyboxes.app and both www hosts 308-redirect to it.
