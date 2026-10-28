# Requirements: Cloud rewrite of Game Show Takeover

> Status: requirements:draft · Owner: robbsbodyshop-lab · Last updated: 2026-10-28
> Source decisions: owner answers in chat on 2026-10-28 (see Decisions). Rules references:
> the existing `docs/FAMILY_FEUD_RULES.md` and `docs/WHEEL_OF_FORTUNE_RULES.md`, which this
> rewrite adopts unchanged (copied into `docs/` of the new repo as the rules of record).

## 1. Summary

Rebuild Game Show Takeover from zero as a browser-only, cloud-hosted, multi-tenant game show
platform: hosts sign up and run events, phones join by QR code, and nothing runs on a PC. Keep
the two full episodes (Family Feud, Wheel of Fortune), the event wrapper (doors, Speed Round,
Plinko, scoreboard), add an original falling-block puzzle game, and restyle to a Super Nintendo
plus first-generation PlayStation aesthetic (2D only).

## 2. User stories

| ID     | As a  | I want                                                                               | So that                                                |
| ------ | ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| US-001 | host  | to sign up with my email and sign in on any device                                   | my events and settings follow me                       |
| US-002 | host  | to create an event, name 2-8 teams with colours, and reopen it later                 | one evening's scores live in one place                 |
| US-003 | host  | a stage screen that fills a projector and never scrolls                              | the audience sees a TV-style show                      |
| US-004 | host  | a host panel (drawer in the stage window) and a separate host view on another device | I see answers and controls the audience cannot         |
| US-005 | team  | to scan a QR code, pick my team and tap BUZZ, with no app or login                   | we can play from any phone                             |
| US-006 | team  | my phone to be the Wheel podium (BUY, SPIN, SOLVE) when it is my turn                | I act without shouting                                 |
| US-007 | host  | to run a complete Family Feud episode with Fast Money, and a bracket for 3+ teams    | the game plays like the show                           |
| US-008 | host  | to run a complete Wheel of Fortune episode through the Bonus Round                   | the game plays like the show                           |
| US-009 | host  | to choose per event whether answers are typed or spoken                              | voice when the room allows it, typing when it does not |
| US-010 | host  | the door game, Speed Round, Plinko finale, scoreboard and winner screen              | the evening has a structure and a champion             |
| US-011 | host  | an original falling-block puzzle game, 1P or 2P versus, from the hub                 | a filler between shows                                 |
| US-012 | host  | every ruling to be undoable and every clock pausable                                 | mistakes do not derail the show                        |
| US-013 | host  | a refresh, a crash or a dropped connection on any device to lose nothing             | the show goes on                                       |
| US-014 | owner | the whole thing on Vercel and Supabase free tiers with the limits written down       | it costs nothing until it needs to                     |

## 3. Functional requirements (EARS)

Priorities: M = Must, S = Should, C = Could.

### 3.1 Accounts and events

- **FR-001 (M)** WHEN a visitor opens the site THE SYSTEM SHALL offer sign up and sign in by
  email (password or magic link) SO THAT any host can use it. (US-001)
- **FR-002 (M)** WHEN a host is signed in THE SYSTEM SHALL list that host's events only and
  SHALL refuse reads or writes of other hosts' data at the database level (RLS). (US-001)
- **FR-003 (M)** WHEN a host creates an event THE SYSTEM SHALL let them add 2 to 8 teams with
  a name, a colour and optional player names, and edit them until a game starts. (US-002)
- **FR-004 (M)** WHEN any state of an event changes (scores, chips, phase, used content, a
  game's engine state) THE SYSTEM SHALL save it to the cloud within 2 seconds SO THAT any
  device signed in as the host can resume it. (US-013)
- **FR-005 (M)** WHEN the stage, the host view or a phone reloads THE SYSTEM SHALL restore
  the exact game position, including clocks with their remaining time and the room code. (US-013)
- **FR-006 (S)** WHEN a host opens an event THE SYSTEM SHALL offer "Resume" and "Start a new
  event", and SHALL keep finished events readable (scores, winner). (US-002)
- **FR-007 (M)** WHEN a host signs out or the session expires THE SYSTEM SHALL keep the stage
  running until the current game ends and prompt to sign in again. (US-013)

### 3.2 Stage, host panel and host view

- **FR-010 (M)** THE stage SHALL be laid out on a fixed 1920x1080 frame scaled to fit the
  window and letterboxed; nothing on it scrolls. (US-003)
- **FR-011 (M)** THE stage SHALL show a sidebar scoreboard (teams, scores, chips, room code
  and QR link) that hides in show mode (F9) along with every host button. (US-003)
- **FR-012 (M)** WHEN the host presses F2 THE SYSTEM SHALL open the host panel drawer with the
  current game's console (answers, puzzle, rulings, tools, settings). (US-004)
- **FR-013 (M)** WHEN a device signed in as the host opens the host view for an event THE
  SYSTEM SHALL show the same console and a live snapshot of the stage (phase, scores, clocks,
  who is answering) within 500 ms of each change, and SHALL send commands that the game
  treats exactly like host clicks on the stage. (US-004)
- **FR-014 (M)** THE stage SHALL never render hidden information: unrevealed survey answers,
  puzzle solutions, Fast Money question queue, the sealed envelope. (P-002)
- **FR-015 (M)** WHEN the host presses F8 or opens any dialog THE SYSTEM SHALL pause every
  clock, cue, phone press and host command, and resume clocks with their remaining time. (US-012)
- **FR-016 (M)** WHEN the host presses Undo THE SYSTEM SHALL step the current game back one
  ruling (bounded history of 30), never replaying a sound or overlay already shown. (US-012)
- **FR-017 (M)** THE host console SHALL stamp each command with the game revision and the
  acting team, and the game SHALL drop a command whose moment has passed or that repeats within
  500 ms. (US-004, US-012)
- **FR-018 (S)** WHEN two devices are signed in as the same host THE SYSTEM SHALL let both
  send commands; the stage is the single authority and both see its snapshot. (US-004)
- **FR-019 (M)** Leaving a running game SHALL take two taps ("Tap again: abandon, no scores").

### 3.3 Rooms and phones

- **FR-020 (M)** WHEN an event opens THE SYSTEM SHALL create a room with a 4-letter code from
  20 consonants and show the code and a QR link to `/play?room=CODE` on the setup screen and
  sidebar. (US-005)
- **FR-021 (M)** WHEN a phone opens the join link THE SYSTEM SHALL sign it in anonymously,
  validate the code, list the event's teams with colours, and let it pick a team; the choice
  survives a reload. (US-005)
- **FR-022 (M)** WHEN a phone taps BUZZ THE SYSTEM SHALL deliver the press to the stage with
  the team id and a timestamp, and the stage SHALL confirm with "BUZZED!" only if the engine
  accepted it. (US-005, P-004)
- **FR-023 (M)** THE stage SHALL publish phone controls (which teams may buzz, whose turn it
  is, BUY/SPIN/SOLVE availability, an off-label such as "Not in this match" or "Locked out of
  this puzzle") and phones SHALL grey out and label accordingly. (US-005, US-006)
- **FR-024 (M)** WHEN it is a team's Wheel turn THE phone SHALL offer BUY, SPIN and SOLVE with
  a text box; opening the box starts that team's solve (stops its clock), closing it unanswered
  cancels, submitting sends the answer. (US-006)
- **FR-025 (M)** THE SYSTEM SHALL prevent a phone from sending stage-only messages
  (controls, team list, snapshots) and from acting as another team, enforced server-side
  (private channels + RLS), not only in the UI. (P-004)
- **FR-026 (M)** WHEN the stage disconnects THE phones SHALL show "Waiting for the game
  screen…" and rejoin automatically when it returns; after 2 minutes they SHALL ask for the
  code again. (US-013)
- **FR-027 (S)** THE stage SHALL show a roster of connected phones per team (presence) on the
  setup screen and in the host panel. (US-005)
- **FR-028 (M)** Rooms SHALL expire 12 hours after their last activity; a phone with a stale
  code SHALL see "Room not found" and a Change room button. (US-005)
- **FR-029 (M)** THE SYSTEM SHALL rate limit room joins (5 wrong codes per anonymous user per
  10 minutes) and presses (one per 150 ms per phone). (P-004)

### 3.4 Family Feud (rules of record: `docs/FAMILY_FEUD_RULES.md`)

- **FR-030 (M)** THE engine SHALL implement the main game exactly as the rules document:
  rounds x1, x1, x2, x3; face-off with down-the-line pairs; play or pass; control down the
  line; strikes; the steal; the bank; leftover reveal bottom-up; Sudden Death; target score
  setting (200/300/400/500, default 300). (US-007)
- **FR-031 (M)** THE engine SHALL implement Fast Money as written: 20 s and 25 s clocks, pass
  and come back, duplicate buzz, "you said / survey said" reveals, 200 wins, host re-judging
  with the Player 1 / Player 2 correction rule, early end keeps shown points. (US-007)
- **FR-032 (M)** WHEN an event has 3 or more teams THE SYSTEM SHALL run a single-elimination
  bracket of full games (or the "one round" short format from Settings), seeded by play
  order, with a bracket screen between matches. (US-007)
- **FR-033 (M)** THE SYSTEM SHALL judge typed answers against the survey (answer, aliases,
  plurals, tenses, common synonyms) as accept, review or miss; review goes to the host. (US-007)
- **FR-034 (M)** WHEN Settings has voice = on THE SYSTEM SHALL listen (Web Speech) for the
  face-off and control players automatically, never on the steal or in Fast Money, stop once
  the host types for that turn, tag each session with its turn so late results never reach
  the next player, and send every spoken steal answer to host review. (US-009)
- **FR-035 (M)** WHEN Settings has voice = off, or the browser lacks Web Speech, THE SYSTEM
  SHALL take answers typed by the host (stage or host view) or by the answering team's phone,
  as a host setting ("Answers from: host / phones / both"). (US-009)
- **FR-036 (M)** THE host console SHALL show the full board, the stake lines, the answer and
  steal clocks (host-only, 5 s default answer timer; 15/30 s or untimed steal huddle), replace
  survey, set multiplier, skip Fast Money (two taps), play the duplicate buzzer, and a question
  browser with "fresh content left" counts. (US-004, US-007)
- **FR-037 (M)** WHEN a game ends THE SYSTEM SHALL credit the winner's game score plus Fast
  Money points and one chip, the loser its game score, and a bonus chip for 200 in Fast Money,
  exactly once per game. (US-007, US-010)

### 3.5 Wheel of Fortune (rules of record: `docs/WHEEL_OF_FORTUNE_RULES.md`)

- **FR-040 (M)** THE engine SHALL implement the episode plan as written: classic toss-ups or
  Fortune Frenzy, Rounds 1-4 with Wild Card, Million Dollar Wedge, trip wedge, Mystery wedges,
  Express, Same Letter bonus, Triple Toss-Up, Speed-Up, tiebreaker, consolation, Bonus Round
  with the Bonus Wheel and envelope; the short format; host settings for opening, Speed-Up
  start, length, Bonus Round on/off and turn timer (off/5/10 s, live). (US-008)
- **FR-041 (M)** THE SYSTEM SHALL judge solves word for word (punctuation, spacing, case and a
  lead-in ignored) as correct, close or wrong; close goes to the host; the host can rule or
  reverse any solve with the thrown-out-puzzle rule on reversal. (US-008)
- **FR-042 (M)** THE SYSTEM SHALL animate the 24-wedge wheel with per-peg ticks, deterministic
  from an injected random draw, and show the puzzle board on the 12/14/14/12 layout with
  letters lighting in sequence. (US-008)
- **FR-043 (M)** THE host console SHALL show the puzzle and category, legal actions, the next
  puzzle, Skip turn, Set turn, Throw out puzzle, End round unsolved, Adjust bank, Ring the
  bell, Late solve, Undo, and the live turn-timer buttons. (US-004)
- **FR-044 (M)** THE SYSTEM SHALL handle the double-click and late-answer windows: same
  ruling within 500 ms counts once; a letter call within 500 ms of play passing is dropped;
  SOLVE within 1.5 s of a decision-clock time-out dispatches a late solve. (US-012)
- **FR-045 (M)** WHEN a game ends THE SYSTEM SHALL credit every team its main-game total at
  $100 = 1 point (Bonus prize excluded), one chip to the winner, and a bonus chip for a Bonus
  Round win. (US-008, US-010)

### 3.6 Event wrapper

- **FR-050 (M)** WHEN an event starts THE SYSTEM SHALL offer the door game: each team picks a
  closed door to draw its play order, revealed with a flourish. (US-010)
- **FR-051 (M)** THE hub SHALL show the available main games (each playable once per event),
  the Speed Round, the puzzle game, Plinko and Announce the Winner, with the sidebar
  scoreboard and looping hub music (Settings: music on/off, volume). (US-010)
- **FR-052 (M)** THE Speed Round SHALL run a 60 s clock with music that pauses with it, and
  let the host award points per team at the end. (US-010)
- **FR-053 (M)** THE Plinko finale SHALL let each team drop its chips one at a time down a
  pegboard into point slots, deterministic from injected draws, adding to its score. (US-010)
- **FR-054 (M)** THE winner screen SHALL announce the champion with a fanfare and marquee. (US-010)
- **FR-055 (M)** Content used in an event SHALL never repeat within it while unused content
  remains; pickers follow the round-size preferences in the content README. (US-007, US-008)

### 3.7 Puzzle game (mechanics reference: `docs/PUZZLE_GAME_MECHANICS.md`)

- **FR-060 (M)** THE game SHALL use an original name, theme, art and audio with no Nintendo
  names, characters or sprites. (P-005)
- **FR-061 (M)** THE engine SHALL be a pure, deterministic reducer with a seeded RNG: 8x16
  board, two-colour capsules spawning at the top centre, 3 germ colours, moves, rotation with
  a free-space check, gravity per speed (LOW 1000 ms, MED 500 ms, HI 250 ms per row), matches
  of 4+ in a row or column (full-board scan, no edge misses), split halves fall, cascades;
  level = germ count (1-20) placed in rows 5-15; top-out at the spawn cells. (US-011)
- **FR-062 (S)** THE game SHALL add what the source lacked: a next-capsule preview, scoring
  (per germ, cascade multiplier, speed bonus), level progression after a clear, a pause, and
  a 2P versus garbage rule (clearing 2+ germ runs in one move drops half-capsules of those
  colours on the opponent), documented in the mechanics doc as this project's design. (US-011)
- **FR-063 (M)** THE game SHALL play on the stage with keyboard (WASD / arrows) and SHALL be
  reachable from the hub; 1P and 2P versus (first to 3 rounds). (US-011)

### 3.8 Audio and visuals

- **FR-070 (M)** THE SYSTEM SHALL reuse the existing synthesized cues and the cue map as the
  audio of record (shared, Feud, Wheel), with overlap, loop, timed-bed, pause/resume and
  "stop all on phase change" behaviours, and SHALL add original cues for the puzzle game and
  the PS1-style boot and menus. (D-004)
- **FR-071 (M)** THE visual design SHALL follow `docs/DESIGN.md` of this repo: SNES flat
  panels, ink outlines, bevels, pixel type, marquee bulbs, scanlines, stepped motion, plus the
  PS1 layer (memory-card menus, dithered gradients, boot sequence, CRT curvature option), all
  2D, all off under reduced motion. (D-003)

## 4. Non-functional requirements

- **NFR-001 (M)** Phone press to stage reaction under 300 ms at p95 on venue Wi-Fi or LTE.
- **NFR-002 (M)** Stage snapshot to host view under 500 ms at p95.
- **NFR-003 (M)** Works in current Chrome, Edge, Firefox and Safari for the stage and host
  view; iOS Safari and Android Chrome (last 2 years) for phones. Voice: Chrome/Edge only.
- **NFR-004 (M)** Phone page under 150 KB gzipped JavaScript; stage under 600 KB gzipped
  excluding audio; audio lazy-loaded per game.
- **NFR-005 (M)** Free-tier fit: one event uses at most 1 stage + 3 host views + 8 phones
  (12 connections), under 10 messages/s sustained, under 1 MB of saved state.
- **NFR-006 (M)** RLS on every table and on `realtime.messages`; no cross-tenant read is
  possible with the anon key; policies covered by tests.
- **NFR-007 (M)** Accessibility: audience text 18 px+, phone targets 44 px+, visible focus,
  keyboard path for every host action, reduced-motion respected, colour never the only signal.
- **NFR-008 (M)** Quality gate: typecheck, lint, format, unit/component tests, build and
  Playwright flows pass in CI on every PR.
- **NFR-009 (S)** Observability: client errors logged to the console with a debug toggle;
  Supabase Realtime and Auth reports used for quotas; no third-party analytics.
- **NFR-010 (M)** Operations documented: deploy, environment variables, migrations, the
  free-project pause risk and the daily keep-alive, the Pro upgrade path.

## 5. Scope boundaries

Won't have in this version: hardware buzzers (WebHID, gamepads), AI content generation,
offline play, self-hosting, paid plans, spectator phones, more than 8 teams, localisation.

## 6. Questions

| ID    | Question                                                                           | Status   | Answer / impact                                             |
| ----- | ---------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| Q-001 | Puzzle game name and theme?                                                        | open     | Design proposes a name for owner approval; FR-060           |
| Q-002 | Should the host view require a password for a second device beyond the host login? | answered | No: signing in as the host is the credential (D-002)        |
| Q-003 | Keep the 1920x1080 fixed stage or go responsive?                                   | answered | Fixed frame, scaled (FR-010); matches the console aesthetic |
| Q-004 | Should phones be able to type Feud answers?                                        | answered | Yes, as a host setting (FR-035)                             |
| Q-005 | Add scoring/versus rules the pygame source never had?                              | open     | Proposed as Should Have (FR-062); owner to confirm          |

## 7. Decisions

| ID    | Decision                                                                         | Reason                                                                       | Source          |
| ----- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------- |
| D-001 | Greenfield rewrite; no code copied from the old repo                             | Owner's choice                                                               | chat 2026-10-28 |
| D-002 | Vercel + Supabase; anyone can sign up and host                                   | Owner's choice; free tiers; connectors available                             | chat 2026-10-28 |
| D-003 | 2D only; PS1 as UI motifs over the SNES base                                     | Owner's choice                                                               | chat 2026-10-28 |
| D-004 | Reuse the original content JSON and audio cues                                   | Owner's choice; they are assets, not code                                    | chat 2026-10-28 |
| D-005 | No hardware inputs; host view and panel kept                                     | Owner's choice                                                               | chat 2026-10-28 |
| D-006 | Voice vs typing is a setting; no AI generator                                    | Owner's choice                                                               | chat 2026-10-28 |
| D-007 | Puzzle game from the pygame mechanics with original name/art/audio               | Owner's choice; IP risk                                                      | chat 2026-10-28 |
| D-008 | React + TypeScript + Vite; new repo `robbsbodyshop-lab/game-show-takeover-cloud` | Owner's choice                                                               | chat 2026-10-28 |
| D-009 | Rules documents of the old repo are adopted verbatim as rules of record          | They were researched and tested; the owner asked for a recode, not new rules | this spec       |
| D-010 | Save engine state mid-game (old version resumed only at the hub)                 | FR-005 / US-013; engine state is serializable                                | this spec       |
