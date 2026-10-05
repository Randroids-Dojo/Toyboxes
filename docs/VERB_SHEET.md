# Core interaction

Genre and intended pace: relaxed 3D exploration and toy play, with short bursts of driving and kicking. Deliberate, low-pressure editing in rooms.
Intended input and accessible alternatives: touch (floating stick, drag to look, context buttons), keyboard and mouse, standard controllers, TV remotes (arrows, OK, Back). Every dialog has full focus navigation and an on-screen keyboard.
Viewing mode: third-person follow camera outdoors; dollhouse cutaway indoors (the wall between camera and player drops to its skirting board); overhead view while arranging.
Representative starting state: fresh browser at the plaza, name entered, day or night depending on the shared clock.

| Player action | Input | Consequence | Constraint, uncertainty, or tradeoff | Acknowledgment and result feedback | Verification |
| --- | --- | --- | --- | --- | --- |
| Walk | Stick, WASD/arrows, d-pad | Camera-relative movement with quick acceleration | Buildings, fountain, hedge ring; camera eases behind you after 1.6 s without look input | Walk cycle, footsteps, blob shadow | `scripts/playtest.ts` step 2 (desktop and phone), `scripts/padtest.ts` |
| Look | Drag (mouse or right half of the screen), right stick, J/L | Orbit the camera | Pitch limits; outdoors the camera lifts over walls before pulling in | Camera motion | Manual; camera lift checked in the back-in-town screenshots |
| Ride or drive | Interact near the scooter or a kart; stick or W/S to go, A/D to steer, RT/LT, Space/X or the Brake button | Arcade vehicle physics; glancing hits keep speed | Kart is fast and wide, scooter is nimble; no race rules | Seated pose, engine pitch with speed, bump sound and small camera nudge (off with reduce motion), one-time control tip | `playtest.ts` step 3 |
| Kick | Space, X, Kick button | Ball near and in front of you flies where you face | Range 1.7 m; vehicles also push the ball | Kick swing, thump; a miss whiffs | `playtest.ts` step 7 (scores a goal) |
| Score | Ball crosses the goal line inside the mouth | GOAL banner, net ripple, ball resets to its saved spot | Crossbar and posts bounce the ball back | Banner, chime, vibration on phones | `playtest.ts` step 7 |
| Bowl, knock cones, hit targets | Kick or drive into them | Pins topple and take neighbours with them; rack resets; targets light up | Rack resets after it settles | STRIKE banner, pin count toast, ding, bullseye banner | Manual in the plaza |
| Claim a room | Interact at an Available door, choose a PIN, confirm it | Server claims the entrance atomically; you enter unlocked | One active room per browser, cooldown, per-network limit; a race has one winner | Confirmation dialog, PIN pad, banner, sign updates to your name | `tests/server.test.ts`, `playtest.ts` step 4, `padtest.ts` step 4 |
| Read a sketchbook | Interact with the sketchbook; Back and Next turn pages | Anyone sees every page's drawing, text and status | Read only; pages the creator removed stay hidden | Page-turn sound, status stamp, "Written" date | `admintest.ts` visitor reads both pages, `tests/server.test.ts` |
| Write an idea | "Write or edit" in the book, then the PIN if locked | New page or revision saved with stable identity | Text required; drafts kept locally; conflicts ask which version to keep | Save state line, page-turn sound, status stamp | `playtest.ts` steps 5 and 10, `tests/server.test.ts` |
| Arrange toys | Interact with the toy chest, PIN if locked | Add, drag, turn, remove toys and paint the room; saved for every visitor | Doorway, back doors, sketchbook, chest and games stay clear; per-toy limits | Green or red ring, reason text, snap back on invalid drops | `playtest.ts` step 6, `tests/model.test.ts` |
| Drive a timed lap | Ride your kart across the start line | Lap timer runs; a lap counts at the next crossing | Grass halves your top speed; a jump along the lap (cutting across) voids the lap; wrong-way warning | HUD timer, lap flash with gap to your best, "New best lap!" banner, board update | `scripts/experiencetest.ts` |
| Race the computer drivers | Stop on the race pad in your kart, Interact, confirm | Grid start at the back, 3-2-1-GO, live position, finish place | Computer drivers brake for corners and stay close; leaving the kart abandons the race; the menu pauses it | Countdown banners and beeps, "Lap 2/3 · 2nd of 4", finish banner and summary | `scripts/experiencetest.ts` |
| Spin the slot machine | Interact at the machine; Kick changes the bet | Server picks the reels; credits change by the paytable | Bets 10 to 100; free refill below 10 credits | Lever pull, reels land left to right, chasing bulbs, win toast or JACKPOT banner, HUD credits | `scripts/experiencetest.ts`, `tests/scores.test.ts` |
| Feed the black hole | Walk into orbs to nudge them; Kick sends one flying; Interact at the shrine starts a frenzy | Orbs leave the platform and spiral into the black hole; a frenzy counts how many in 60 seconds | Orbs that land back on the platform need another kick; the energy fence keeps you on, not the orbs; the menu pauses a frenzy | Kick sound, the orb stretches as it falls, the disk flares, swallow boom, countdown and result banners, best-score board | `scripts/galaxytest.ts` (desktop and `PHONE=1`), `tests/scores.test.ts` |
| Visit an arcade or play a game | Interact at the arcade door or cabinet, confirm | Same-tab navigation; return spot saved | External sites keep their own controls | Confirmation names the site; Back returns you to the door | `scripts/arcadetest.ts` |
| Rename | Menu, Change my name | Browser only, or the room too after a PIN check | Wrong PIN changes nothing | Choice dialog, PIN pad, toast listing what changed | `playtest.ts` step 9, `tests/server.test.ts` |

## Smallest useful test

The largest risk is the device spread: touch, controller and TV focus on top of a 3D scene. The scripted playtests drive real touch, keyboard, mouse and gamepad input through the full claim, sketch and arrange loop.

## First action and recovery

On arrival the controls hint shows the device's own glyphs (none on touch, where the buttons are labelled) and fades once you have moved. Context prompts always name the action ("Claim room 4", "Read the sketchbook"). Failed saves keep drafts and say so; a wrong PIN shakes the pad and says how many tries are left; a lost controller opens the menu with a note.

## Supporting interfaces

Name entry, the PIN pad, sketchbook, arrange panel, settings (sound, camera, time of day, graphics, motion, text size, touch controls) and the pause menu. All work with focus navigation and Back.

## Done when

Observed state transition and feedback: each row above passes its listed check.
Required checks and evidence location: `npm test`, the four playtest scripts (screenshots in `/tmp/toyboxes-*`).
Remaining human judgment: vehicle handling feel, camera comfort, and play on the Samsung S90H TV browser and a real phone.
