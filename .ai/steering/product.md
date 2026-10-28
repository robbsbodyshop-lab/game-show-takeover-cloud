# Product Steering

> Status: Draft for owner review · Last updated: 2026-10-28

## Product Vision

Game Show Takeover is a live, host-run team game show for parties and team
events, played entirely in the browser and hosted in the cloud. One screen (a
projector or TV) shows the stage, the host runs the show from a host panel on a
laptop or a second device, and every team plays from their phones. Nothing is
installed, no PC acts as a server, and anyone can sign up and run their own
event.

It looks and sounds like a 16-bit console game-show cartridge that shipped
alongside a first-generation PlayStation launch title: pixel type, flat
bevelled panels, chasing marquee bulbs, CRT scanlines, memory-card style menus,
dithered PS1 gradients and a console boot sequence.

## Target Users / Personas

- **Host (account holder):** sets up an event, names the teams, runs the games
  from the host panel, judges answers, fixes mistakes with Undo. Wants a show
  that never stalls, never shows the audience an answer early, and survives a
  refresh or a dropped connection.
- **Team player (phone):** scans a QR code, picks a team, taps BUZZ, and in
  Wheel of Fortune taps BUY / SPIN / SOLVE. Wants an instant, obvious response
  and clear "not your turn" states. Never installs anything, never logs in.
- **Audience (stage screen):** sees only what a TV audience would see, readable
  from the back of a room.

## Value Proposition

The host brings a laptop and a projector; the game brings everything else.
Compared with the previous version it removes the PC server, the tunnel and the
launcher scripts, saves games mid-round, and lets more than one host use it.

## Product Boundaries

### In Scope

- Family Feud full episode (face-off, play or pass, strikes, steal, Sudden
  Death, Fast Money, single-elimination bracket for 3+ teams).
- Wheel of Fortune full episode (toss-ups or Fortune Frenzy, Rounds 1-4 with
  the special wedges, Triple Toss-Up, Speed-Up, tiebreaker, Bonus Round).
- Event wrapper: team setup, play-order door game, hub, Speed Round, Plinko
  finale, live scoreboard, winner announcement.
- Phones as buzzers and Wheel podiums; QR join with a 4-letter room code.
- Host panel in the stage window and a separate host-only view on any device
  signed in as the host.
- Answer entry by typing or by voice (Web Speech API), switchable in Settings.
- An original falling-block puzzle game (capsules and germs, 1P and 2P versus)
  playable from the hub as a filler; original name, art and audio.
- Accounts: email sign-up and sign-in; each host's events and settings are
  private to that host. Phones join anonymously.
- Save and resume of the whole event, including a game in progress.
- Reuse of the existing original survey/puzzle content and synthesized audio.

### Out of Scope

- Hardware inputs: BUZZ! controllers (WebHID), gamepads, dedicated keypads.
- AI content generation.
- Native apps, offline play, self-hosting from a PC, Cloudflare tunnels.
- Copying any real show's theme music, logos, survey data or puzzles.
- Nintendo names, characters or sprites in the puzzle game.

## Success Metrics

- A host can go from sign-up to a running Family Feud round with phones
  connected in under 5 minutes, with no instructions beyond the screen.
- A phone press reaches the stage in under 300 ms on venue Wi-Fi or mobile data.
- Refreshing the stage, the host view or a phone mid-game loses nothing.
- `npm run validate` (typecheck, lint, format, unit and component tests,
  build) passes on every commit; Playwright end-to-end flows pass on main.
- The audience never sees a hidden answer, a puzzle solution or the sealed
  envelope.

## Domain Glossary

- **Event:** one evening's session: teams, scores, chips, which games are done.
- **Game:** one Family Feud or Wheel of Fortune episode (or Speed Round, Plinko,
  puzzle game) inside an event.
- **Stage:** the audience screen (projector).
- **Host panel:** the host controls shown in the stage window (drawer) and in
  the separate host view.
- **Room:** the realtime group a stage, its host views and its phones share,
  identified by a 4-letter code.
- **Chip:** a Plinko chip earned by winning a game; spent in the finale.
- **Bank:** points at stake in the current round before they are awarded.
