# Host feature inventory (for from-scratch rewrite)

Sources: `docs/HOST_GUIDE.md`, `docs/RELEASE_CHECKLIST.md`, `CHANGELOG.md` (1.0.0-rc.1 to rc.4). Not checked against code. Rules docs were out of scope.

Excluded per brief: hardware buzzers (BUZZ! controllers, gamepads, WebHID, BUZZ! connect and pairing), Cloudflare tunnels, `.bat`/`.ps1` launchers, PC self-hosting. Keyboard keys 1-8 and team phones are kept. "Not stated" marks a value or behaviour the docs do not give.

---

## 1. Event flow

Setup -> door game (3+ teams) -> hub -> games (Feud, Wheel, Speed Round, Plinko) -> finale (Run Final Plinko) -> Announce The Winner -> Start New Event.

### 1.1 Setup screen (first screen on load)

- Teams: 2 to 8. Each has a name, colour and player count (count sets Feud podium order and the Speed Round participant picker).
- Phone panel: QR code (carries the room code), join address (page address + `/buzz`), 4-letter room code, connected-phone count.
- "Last press" line: the team a key or phone press rang in for, and its input.
- **Start Game!** goes to the hub (door game first if 3+ teams).
- Saved event after a refresh: "Resume previous event?" with **Resume** or **Start fresh**.
- Connection text: "Looking for the buzzer relay..." (reconnecting); "Not available on this build" (page not served by the game server, so phones cannot join).

### 1.2 Door game (play order)

- Opens after Start Game! with 3+ teams, and after any change to the team count.
- Each team guesses 1-100. The closest picks a door; the door reveals who plays first.
- Shown under the hub's **Determine Play Order** button. It is the Wheel's turn order until the team count changes.
- Phases exist (checklist) but are not listed. A door-selection tiebreaker is mentioned in rc.3; its rules are not given.

### 1.3 Hub

- **Determine Play Order**.
- **Family Feud**: with 3+ teams, a single-elimination bracket. Each match is a full game, or one round in "One round" format. Loser is out; each match winner earns a Plinko chip. "(played)" marks; games are replayable.
- **Wheel of Fortune**.
- **Speed Round**, **Run Final Plinko**, **Announce The Winner**: always available.
- **Edit Teams**, **Settings**, **Credits** (contents not stated).
- **Gemini hub** button, only when `VITE_GEMINI_API_KEY` is configured. Behaviour not described.
- Game start buttons are greyed out while a game is on screen.

### 1.4 Family Feud (one match or game)

1. **Match card**: families, "First family to <score> points wins", Fast Money note. **Start round 1** (Enter).
2. **Round intro**: "Give me <family> player 1..." and "Top N answers on the board". Host reads the question (host window _Say this_ box has the lines). **Start the face-off** (Enter) opens buzzers.
3. **Face-off**: first buzz answers, typed or spoken.
   - #1 answer wins the face-off.
   - Other board answer: revealed; opponent answers. Higher wins for them; lower or miss keeps it; equal stays with the first answer.
   - Miss: one X (not a strike); opponent answers; any board answer wins.
   - Both miss: next pair down the line faces off.
   - Simultaneous buzzes: **Who buzzed first?**.
4. **Play or Pass** by the face-off winner.
5. **Control**: players answer in turn down the line. Miss, pass or time-out is a strike. Repeating a revealed answer is not a strike: "ALREADY ON THE BOARD - ANOTHER ANSWER, PLEASE" and the same player goes again. Clearing the board wins the round.
6. **Steal**: after three strikes the other family huddles. A steal huddle timer calls the captain when it ends, or the host presses **Take the captain's answer** (Enter). One captain answer: if still hidden, the steal team wins the bank (its points not added); if revealed, the controlling family wins. **Steal fails** rules it out.
7. **Round decided**: bank (revealed points x multiplier) goes to the winner's game score. Enter reveals unrevealed answers bottom-up for no points; **Reveal all** shows the rest. **Round summary**, then Enter for the next round.
8. **Multipliers** (automatic): rounds 1-2 x1, round 3 x2, round 4 x3, Sudden Death x3. Host can override for the current round.
9. **Winning**: after each round a family at the winning score wins. Nobody there after round 4: **Sudden Death** (only the #1 answer counts; face-off only). Both miss ("NOBODY GAVE THE TOP ANSWER"): Enter brings a new Sudden Death question. One-round format: the round winner wins.
10. **Game won card**: **Play Fast Money** (Enter) or **Skip Fast Money**.
11. **Game over card**: game score, Fast Money points, total to scoreboard, "JACKPOT: BONUS PLINKO CHIP" if earned, points the losing family keeps. **Continue to the hub** (or **Continue the bracket**). Next match starts with a fresh board.

### 1.5 Wheel of Fortune (one game)

1. **Opening**:
   - Classic: $1,000 toss-up, then $2,000 toss-up; its winner starts Round 1.
   - Fortune Frenzy: 30 s clock from the first letter; back-to-back $1,000 puzzles in one category. A wrong answer throws that puzzle out. The last solver starts Round 1.
   - Unsolved deciding toss-up: first team in play order starts.
2. **Rounds 1-4**: turns (section 2.9). Round 1 has the Wild Card, Million Dollar Wedge and a trip.
3. **Solved**: solver banks round money and prizes (at least $1,000); others lose round money. Award card; Enter or its button ("On to Round 2") continues.
4. **Triple Toss-Up** (after Round 3, Full show only): three puzzles in one category and theme at $2,000 each, plus $4,000 for a sweep. Third solver starts Round 4.
5. **Speed-Up** (section 2.9). The main game ends with the solve.
6. **Tiebreaker**: $1,000 toss-up between tied teams for first. A team with nothing gets $1,000.
7. **Bonus Round** (section 2.10). **Game winner card**: total, Bonus prize if won, "+N points and a Plinko chip", "+ a bonus chip" for a Bonus win. **Continue to hub** (Enter).

### 1.6 Speed Round, Plinko finale, winner

- Speed Round: type the challenge; run the 60 s timer (music plays); pick a random participant; award +10 points or +1 chip.
- Plinko: each team drops chips on the physical board; the host logs each slot value (points to the team, one chip spent).
- **Announce the Winner**: final standings with a fanfare. **Start New Event** (two taps) ends the event.

---

## 2. Host controls and hotkeys

### 2.1 Global keys

- **F2**: open or close Host Tools (console drawer) in the current game.
- **F4**: show or hide the host sidebar.
- **F8**: Pause (Stand By) or resume. **Escape** also resumes.
- **F9**: show mode on or off. **F11**: browser fullscreen.
- **1-8**: buzz for Teams 1-8 from the game window or host window. A team's numeric keypad works the same way.
- **Enter**: next step on the current screen. **Space**: Wheel spin. **A-Z**: Wheel letter call.
- Rules:
  - Keys do nothing in text boxes; digits typed there stay text.
  - A held key does not repeat. Ctrl/Alt/Cmd + letter is ignored (Wheel).
  - Pause and any open dialog freeze all keys, buzzers, phones, clocks and host-window commands. Clocks resume from where they stopped.
  - Under Stand By, Enter and Space do nothing (a presenter clicker cannot resume play). F8, Escape or **Resume** resumes.
  - The winner card ignores a held Enter or Space.

### 2.2 Pause (Stand By)

- Via F8, sidebar **Pause / Resume**, or host window **Stand by (pause)**. The projector shows a Stand By card with **Resume**.
- Freezes all clocks (Feud answer and steal timers, Wheel turn, Bonus and Frenzy clocks, Speed Round clock and music) and all input.
- Wheel's own pause menu (**Pause**, top left): **RESUME** (or Escape/click); **RESTART ROUND** (only when a puzzle can be thrown out; turn and money stay); **OPTIONS** (app Settings); **QUIT TO HUB** (two taps within 4 s; first reads "Tap again: abandon (no scores)"). Pause freezes a spin in flight. Enter and Space do nothing here.

### 2.3 Show mode

- Via F9, Settings (Display) or sidebar. Remembered across launches.
- Hides the sidebar and host buttons on game screens. Pointer hides after 3 s idle.
- Hovering the top corners of a game (or its button rows) reveals the buttons. Keys still work.
- Stage is 1920x1080, scaled and letterboxed to fit. Nothing scrolls; long host-only panels scroll in their own drawer.

### 2.4 Sidebar (host only)

- Per team: score +/-10 and chip +/-1, any time.
- Games-completed count, leader, phone room code, join address, stopwatch (behaviour not stated).
- **Pause / Resume**, **Music on/off**, **Show mode**, **Open host window**.
- **Abandon Game -> Hub** (in a game): two taps; first reads "Tap again: abandon (no scores)". Outside a game: one-click **Back to Hub**.
- **Edit Teams**: greyed out in a game ("Finish or abandon the game first").
- **Emergency Reset**: two taps. Ends any game (no scores) and returns to hub. Zeroes scores and chips; clears bracket, games-completed count, "(played)" marks and used-question list. Keeps teams and play order. With a game on screen: "Tap again: end the game and zero all scores".
- Start Family Feud / Wheel (greyed out in a game). Gemini hub when configured.

#### Edit Teams (hub or sidebar)

- Rename, recolour and player-count changes keep scores, chips, bracket and play order.
- Changing the Number of Teams: lowering removes the last teams with their scores and chips. Any change clears play order and bracket; with 3+ teams the door game reopens.
- Scores and chips stay with a list place, not a name.
- An open Edit Teams screen across a refresh returns to the hub; unsaved edits are lost.

### 2.5 Settings dialog

- Music on/off and volume; show mode; fullscreen; hotkey list.
- **Open host window** (closes Settings). **Reset scores & chips**: two taps; same as Emergency Reset.
- **Start a new event**: two taps. What it clears beyond that is not stated.
- Game options are not here: they are in Host Tools (F2) -> Settings, or host window -> Settings (section 5).
- An open dialog freezes all keys, buzzers and phones.

### 2.6 Host window (`/?view=host`)

- Opened from Settings or sidebar, same browser and address. Own popup (about 1280x800) on the game's screen; drag it to the laptop screen.
- Status: "Connected", "Looking for the game window", "Lost contact", "Game window closed". **Open game window** reopens the game. Red warning when the game page is hidden (background tab or minimised).
- Shows the projector screen, event scores and chips, play order, phone room and connected-phone count.
- **Stand by (pause)** / **Resume game** for the whole event.
- Console for the game on screen: the Host Tools controls, plus the Wheel's play buttons.
- Keys 1-8 buzz. Commands are ignored while the game is paused or a dialog is open ("The game is paused or showing a dialog").
- Warns if another game window is open. When the Wheel is paused on the game screen it shows "Wheel of Fortune is paused on the game screen" with **Resume game**.

### 2.7 Family Feud controls

Game-screen buttons (hidden in show mode): Start the face-off, Play, Pass, Take the captain's answer, reveals, Fast Money steps.

Console (Host Tools and host window):

- **Header**: round, stage, "Match N of M", next-step button (Enter), **Undo** (up to 30 steps, Fast Money included), scores, multiplier, answer timer ("held" while waiting), steal huddle, **restart timer**.
- **Say this**: host lines generated from the scores.
- **Flow**: Start round 1, Start the face-off, Play / Pass, Take the captain's answer, Reveal next / Reveal all / Round summary, next round, Play Fast Money / Deal new questions / Skip Fast Money, Send scores and continue.
- **Answer sheet**: question, who was surveyed, "Top N on the board", who is answering, **Who buzzed first?**, mic state and transcript, stage answer box and its match, **Type the player's answer** + **Judge**. Each answer: **Accept**, and **Strike / Miss (X) / Steal fails / Passed / Out of time**. After a round, each answer has **Reveal**.
- **Host review** (near misses, unclear voice answers, every spoken steal answer):
  - **Accept as #N ANSWER**.
  - **#N ANSWER is already on the board - ask again**: no strike; same player again (on a steal: "(the steal fails)").
  - **Another answer...**: pick any board answer ("(already up)" marks revealed ones).
  - **Not on the board**: strike, or face-off miss.
  - **Not an answer (ignore)**: noise; same player goes again.
- **Round tools**: **Replace question** (round restarts; scores stay); x1/x2/x3 override for this round.
- **Question bank**: counts left this event ("Running low" under 10). **Browse question bank** (USED, ON THE BOARD; host-only preview): **Use for this round**, or **Swap into Fast Money** while the game-won card shows.
- **Drawer only**: **Abandon game, back to the hub** (two taps, no scores).
- Console clicks apply only to what was on screen when clicked. The same button twice within 0.5 s counts once.

Feud keys: 1-8 buzz for the two match teams during a face-off. Enter: next step (not while Host Tools is open); in the answer box, Enter submits. F2: Host Tools.

Judging and voice:

- Typed answers never submit on their own; Enter or **Judge** judges them. Typing "pass" is a pass.
- Clear matches go straight to the board. Near misses, unclear voice answers and every spoken steal answer go to host review ("checking the board..." / "Host review needed: open Host Tools").
- Voice needs Chrome or Edge and internet; a spoken answer submits shortly after the player stops (delay not stated).
- **Mic** button beside the answer box (hidden in show mode until hover): **Mic on** switches off and discards what it heard; **Mic** with text in the box clears it and listens. Typing in any answer box takes over from the mic for that player or question, and drops a spoken answer still waiting to submit.

Answer timer (host-only; face-off and control players, not the steal):

- Runs only while a player answers. Holds while the big X is up, ~1.2 s after each ruling, 4 s after the first face-off miss, while anyone types or speaks, and while Host Tools is open.
- Buzz and Play start it at once. Tick at 1 s left. At 0: "TIME'S UP!" = strike (or face-off miss). **restart timer** gives a fresh clock.

### 2.8 Fast Money controls

- **Players**: **Players 1 and 2 play**, or other podium numbers and names in Host Tools, then **These two play**. Keep player 2 out of sight of the board.
- **Start the clock** (Enter): player 1 gets 20 s, player 2 gets 25 s. Player 1 sees no question until the clock runs; questions show on the stage only while a player answers. **Mic** (after the clock runs) takes answers by voice for that turn.
- **Pass** button, or type "pass". Passed questions return while time remains. **Stop the clock** ends the turn early.
- **Reveal**: Enter shows "YOU SAID..." then "SURVEY SAID..."; **Reveal all**. **Clear the board for player 2** (Enter). **Play the duplicate buzzer**. **Remind audience of player 1's answers** (toggle). **Finish Fast Money** (Enter).
- **End Fast Money now (keep N points)**: two taps within 4 s; second reads "Tap again: end and keep N points". N = TOTAL box. A win (bonus chip) only if N reached 200. Ignored if the host window was behind the game when confirmed. Ended before any points: no result recorded.
- **Duplicate**: player 2 repeating player 1 (same words, or same survey answer) gives the double buzz and "TRY AGAIN"; the clock keeps running. A near miss is not a repeat.
- Player 1 alone at 200 wins the family's game; player 2 does not play. Player 2 reaching 200 or more: jackpot and bonus Plinko chip.
- **Ruling table**: every survey answer plus "Not on the survey (0)". Close matches are **CHECK** and score 0 until ruled, with a "suggested" answer. An answer the other player holds is greyed out ("player 1's answer") and never suggested. A near miss closest to player 1's answer reads "CHECK: close to player 1's answer". A ruling repeating the other player's wording is refused. To credit player 1 with an answer player 2 holds, set player 2's to "Not on the survey" first, then re-judge player 1.

### 2.9 Wheel of Fortune controls

Game screen and podium:

- **SPIN**: button, Space, the team's buzzer or phone. Only the team in control can spin.
- **Call a consonant**: click or key. Every copy lights and pays the wedge value. A miss or a letter already called passes the turn (called letters stay clickable to record a repeat).
- **BUY** ($250 of round money; start of turn or after a correct letter): vowel picker; a vowel key buys directly.
- **SOLVE** (start of turn or after a correct letter): button, phone or Enter. Freezes the turn clock. Dialog: **Check Answer** (typed) or **Heard it? Correct / Wrong**. Typed near misses come back to **Accept / Reject**. A phone near miss is never shown on the stage.
- **Bankrupt** wipes round money, round prizes, Wild Card and Million Dollar Wedge. **Lose a Turn** passes.
- Special wedges (podium row):
  - **Wild Card**: on the wheel in Rounds 1-3; claimed with a correct consonant. **PLAY WILD CARD** gives one more consonant at the same value. Usable until the Speed-Up (Round 4 too, not while riding the Express). Unused, it is a fourth Bonus consonant.
  - **Million Dollar Wedge** (Rounds 1-3) and the trip wedge: claimed with a correct consonant; kept only by solving the round.
  - **Mystery** (Round 2): **KEEP $X** or **FLIP IT** ($10,000 or Bankrupt).
  - **Express** (Round 3): **RIDE THE EXPRESS** or **PASS**. Riding, consonants at $1,000 with no spin; any miss, repeat or wrong solve is Bankrupt.
  - **Prize Puzzle** (Round 3): solver also wins the trip.
- "NO MORE VOWELS" / "ONLY VOWELS REMAIN" on the category strip. With only vowels left, nobody spins: buy or solve. If a rotation fails and nobody can buy, the puzzle is thrown out.
- Turn timer (if set): podium bar; at 0 the turn passes.
- Enter: continue, start Bonus clock, open envelope, or open the solve dialog (within 1.5 s of a turn clock running out, for the team that timed out).

Console (Host Tools and host window):

- **Top**: what is happening, category, **the answer**, theme (Triple Toss-Up), puzzle id, clock, consonant payouts.
- **Rulings**: "<team> said: ..."; **Accept / Reject** (main rounds only once a solve has begun; before that: "Nobody is solving yet"); **Reverse: <team> was ruled right/wrong**; **Answered without ringing in: <team>** (Reverse takes it back); **Accept: the answer started before the buzzer** (Bonus); **Late answer: <team> started before the buzzer** (main rounds).
- **Flow**: Continue, **Ring the time bell**, **Turn all lit letters**, **Start bonus clock**, **Open envelope**, **Undo last step** (up to 30).
- **Play** (host window only): Spin, Solve, Keep / Flip, Ride / Pass, Play the Wild Card, Bonus categories, every callable letter.
- **Turn and puzzle**: **Skip to next team**, **Throw out puzzle** (fresh puzzle; turn and money stay), **End unsolved**, **Give the turn to** a team.
- **Scores**: round money, bank and total per team (WILD, 1M, prizes marked); **-1K / +1K** on bank; **+250 R** on round money. **Secrets** (Mystery, sealed envelope, Bonus puzzles). **Next puzzle** with **Roll another**.
- **Settings**: live **Turn timer** (Off / 5 s / 10 s) and the next-game form (section 5).

Wheel keys: letters call (a vowel buys when allowed); Space spins; Enter as above (does nothing while Bonus letters turn); 1-8 ring in on a toss-up once a letter shows, or spin for the team in control in a round; F2 Host Tools.

Wheel timing and repeat-click rules:

- A solve or vowel dialog survives Ring the time bell and bank fixes. Any other host step (skip, give turn, throw out, end unsolved, undo) closes it.
- Same ruling, letter, podium decision or tool twice within 0.5 s counts once. Deliberate repeated Undo, Throw out, Skip or Reverse need ~0.5 s between. A letter call or Skip within 0.5 s of play passing to another team is dropped.
- **Late answer**: if the timed-out team was already answering, SOLVE or Enter within 1.5 s gives the solve back to that team. A console **Late answer** ruling does the same until the team that got the turn acts. Cancelling hands the turn on.

Speed-Up:

- **Ring the time bell**. Normally Round 4; with "Round 4 opens as the Speed-Up" it starts itself. Earlier use works: between rounds it makes the next round the Speed-Up; mid-round it takes effect at the next choice point.
- The team in control spins once. Consonants pay the value plus $1,000; vowels are free. Each team calls a letter or solves in turn; after a correct letter it has a 3 s solve window.
- Miss, repeat, wrong solve or time-out passes play. The solver banks the round and the main game ends. If Round 4 was solved before the bell, one more round opens as the Speed-Up.

### 2.10 Bonus Round controls

- The team with the highest total plays.
- **Pick a category** (one of three). **SPIN** the Bonus Wheel (button, Space or phone). The envelope stays sealed (visible under Secrets).
- R, S, T, L, N, E turn. The team calls three consonants and a vowel (four with a Wild Card).
- **Start the 10-second clock** (Enter). Guesses: phone SOLVE, **Type answer**, or **Correct / Wrong**. A right answer before the clock wins.
- If a right answer was being given at the buzzer: **Accept: the answer started before the buzzer** (until the envelope opens). **Reverse** or **Undo last step** takes it back.
- **Open the envelope** (Enter), then **Final results**, the **Game winner** card and **Continue to hub**. Bonus and Frenzy clocks keep running while the host types or rules; only Pause, a dialog or the Host Tools drawer holds them.

### 2.11 Speed Round, Plinko, doors

- Speed Round: challenge text; **Start** (60 s, music); **Pause**; **Reset**; **+5 s / -5 s**; **Pick** (random participant); **+10 pts** or **Winner (+1 chip)**. F8 freezes clock and music.
- Plinko: slot buttons +100 / +250 / +500 / +1000 or a typed value; **Log** adds points and spends a chip; **Undo last**; **Announce the Winner**; **Start New Event** (two taps).
- Doors: controls not documented. Known: guesses 1-100, closest picks a door, phases must all be run.

---

## 3. Phone (team device) screens

Phones use the game address + `/buzz`. The setup QR carries the room code.

### 3.1 Join

- Scan the QR, or type the 4-letter room code (shown on setup, sidebar and host window). Error: "Room not found. Check the code on the game screen."
- Pick a team (the phone turns that team's colour; phone N is always Team N, the team id). Footer links: **Change team**, **Change room**.

### 3.2 Buzz screen (Family Feud)

- **BUZZ** rings in from **Start the face-off** until the first buzz. Only the two match teams.
- Other teams in a bracket: "Not in this match" (BUZZ does nothing). Otherwise: "Buzzers are off" (after the first buzz, between face-offs, paused, or a dialog open).
- Match phones flash **BUZZED!** on a press (rc.4 wording); non-match phones do not.
- BUY, SPIN, SOLVE grey out.

### 3.3 Podium screen (Wheel of Fortune)

- **BUZZ**: on a toss-up once the first letter shows; in a round it spins for the team at the wheel. Lit only when it would do something. Otherwise grey with a reason:
  - "Waiting for <team>": another team is at the wheel or answering.
  - "Locked out of this puzzle": this team already missed that toss-up.
  - "Buzzers are off": nothing is live.
- **BUY**, **SPIN**, **SOLVE** light only on the team's turn, with "YOUR TURN".
- **SOLVE** opens a text box and starts the solve (the clock stops while typing). **SUBMIT** sends. **CANCEL** gives the turn back.
- Phone goes dark once the puzzle is solved. The game checks every press, so a stale phone cannot act for the wrong team.
- In the Bonus Round the phone's SOLVE (or BUZZ) takes a guess.

### 3.4 Connection messages and other games

- "Reconnecting...": connection dropped; retries by itself.
- "Waiting for the game screen...": server restarted; rejoins by itself; gives up after 2 minutes and asks for the code again.
- "Game screen offline": the press reached no game screen. Check the game window is open and awake.
- "Not connected": no connection right now.
- Speed Round, Plinko, Fast Money and the door game have no phone screen in the docs.

---

## 4. Save, resume and recovery

### 4.1 Saved state

- Event autosaved in the browser, per address. The same address must be used each time.
- Saved: teams (names, colours, counts), scores, chips, games completed, play order, bracket, used-question list, room code (survives a server restart).
- Settings in the browser: Feud key `gst:feud-settings`; Wheel turn timer saved for later games; show mode remembered.
- Not saved: a game in progress (4.4); unsaved Edit Teams edits.

### 4.2 Resume after refresh or crash

- Reopen the game address. Setup offers **Resume previous event?** **Resume** restores teams, scores, chips, bracket and used questions. **Start fresh** discards them.
- Changelog rc.4: resume works on any screen, including Edit Teams.

### 4.3 Server restart

- Game screen reconnects by itself, retrying at most 5 s apart. It keeps its room code; phones follow.
- Setup shows "Looking for the buzzer relay..." meanwhile. Phones show "Waiting for the game screen..." and rejoin by themselves (2-minute limit).
- Game tab pings the relay every 20 s to keep the connection open; backs off when the relay refuses.
- If the join address changes, phones rescan the new QR. Only one game window should be open.

### 4.4 Game in progress after a refresh

- Guide: the game in progress is lost. Start it again from the hub. A Feud bracket continues with the same match. (Conflicts with rc.4; section 7.)

### 4.5 Screen crash

- "Something went wrong" card replaces the screen. Sidebar stays; scores and chips are kept.
- Buttons: **Back to Hub** (abandons a game in progress) or **Try again**. Host window: **Reload host view**.

### 4.6 Recovery procedures

- **Wrong Feud ruling**: **Undo** (up to 30 steps). Fast Money answers can be re-judged.
- **Wrong Wheel ruling**: **Reverse** or **Undo last step**. Reversing a right ruling throws the puzzle out (everyone has seen it); a replacement comes up; turn and money stay as the reversal left them. Use Reverse, not Undo, for a right ruling (Undo would restore the seen puzzle).
- **Bad question / puzzle**: Feud **Replace question** (scores stay); Wheel **Throw out puzzle** (turn and money stay).
- **Click did nothing**: turn moved on, or a double-click within 0.5 s. Check the console and click again.
- **Wrong score**: sidebar +/-10 and +/-1 any time; Wheel bank **-1K / +1K** during the game.
- **Team change mid-event**: Edit Teams from the hub. Check the sidebar; scores follow list place.
- **Host window not connecting**: reopen from the game window's Settings or sidebar, same browser and address. Allow popups if blocked. **Open game window** reopens the game.
- **Console behind the game** (red warning): drag the console to its own window, then click the game tab or restore the game window.
- **Mic not hearing**: check Chrome/Edge, mic permission, internet. The mic waits for **Mic** on the steal, in Fast Money, after three failed sessions in a row, or after typing for that player. Type answers instead.
- **No sound**: browsers block audio until the first click. Click the page, then check music in Settings.
- **Phones**: rescan if the address changed. Keys 1-8 are the fallback from either window, except in text boxes.
- **Start over**: Settings -> **Start a new event** (two taps), or **Reset scores & chips** / Emergency Reset.
- **Late Wheel answer**: section 2.9. **Feud timer out**: section 2.7.

---

## 5. Settings and defaults

### 5.1 Family Feud (Host Tools F2 or host window -> Settings; saved in browser)

- **Winning score**: 200, 300, 400, 500. Default **300**.
- **Match format**: Full game, One round. Default **Full game**.
- **Fast Money**: on / off. Default **on**.
- **Answer timer**: Off, 3 s, 5 s, 10 s. Default **5 s**. Host-only; never on the projector.
- **Microphone**: Listens by itself, Mic button only. Default **Listens by itself**. Steal and Fast Money never listen by themselves.
- **Steal huddle**: Host calls it, 15 s, 30 s. Default **Host calls it**.
- Winning score, format and Fast Money apply until round 1 starts, then from the next game. The two timers apply at once.

### 5.2 Wheel of Fortune (Host Tools F2 or host window -> Settings)

- **Turn timer**: Off (host-paced), 5 s, 10 s. Default **Off**. Live: applies at once, mid-game too; saved for later games; kept by Undo.
- **Opening**: $1,000 + $2,000 toss-ups, or Fortune Frenzy (30 s). Default **toss-ups**.
- **Speed-Up**: host rings the bell in Round 4, or Round 4 opens as the Speed-Up. Default **host rings the bell**.
- **Length**: Full show (Rounds 1-4, Triple Toss-Up) or Short (toss-up, Rounds 1-2, Speed-Up). Default **Full**.
- **Play the Bonus Round**: on / off. Default **on**.
- The four non-timer fields use a form: **Save for the next game**, or **Apply now (restart)** (only before anything has been won).
- Teams play in door-game order when drawn, otherwise team order.

### 5.3 Fixed values (not settings)

- Fast Money clocks: 20 s (player 1), 25 s (player 2). 200 points = bonus chip and jackpot.
- Feud multipliers: x1, x1, x2, x3; Sudden Death x3. Timer holds: ~1.2 s after a ruling; 4 s after the first face-off miss. Tick at 1 s left.
- Wheel: Frenzy 30 s; Bonus clock 10 s; Speed-Up solve window 3 s; late-answer window 1.5 s; buy vowel $250; Express consonant $1,000; solve award at least $1,000; Mystery $10,000 or Bankrupt; Triple Toss-Up $2,000 per puzzle and $4,000 sweep; tiebreaker $1,000. A called consonant pays its wedge value (wedge values not listed).
- Speed Round: 60 s; +/-5 s. Plinko slots: +100, +250, +500, +1000, or typed.
- Two-tap confirmations: Abandon (sidebar and Feud drawer), Emergency Reset, Reset scores & chips, Start a new event, Plinko Start New Event, QUIT TO HUB (4 s window), End Fast Money now (4 s window).
- Repeat-click window 0.5 s. Undo depth 30 steps (Feud and Wheel). Show-mode pointer hides after 3 s. Relay ping every 20 s; reconnect at most 5 s apart; phone waits 2 minutes. Question bank "Running low" under 10.

### 5.4 Global

- Music on/off and volume defaults, show mode default, team-setup defaults (count, names, colours): not stated.

### 5.5 Event scoring

| Game                            | Winner                                                                                  | Everyone else                      |
| ------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| Family Feud (per game or match) | Game score + Fast Money points + 1 chip; +1 bonus chip for 200 in Fast Money            | Losing family keeps its game score |
| Wheel of Fortune                | Main-game total / 100 as points (rounded) + 1 chip; +1 bonus chip for a Bonus Round win | Main-game total / 100 as points    |
| Speed Round                     | +10 points or +1 chip, as awarded                                                       | -                                  |
| Plinko                          | Each drop's slot value as points; one chip spent                                        | -                                  |

- Wheel total = banked money plus main-game prizes (trips, Mystery $10,000). The Bonus prize is never added to points. Example from the guide: $18,500 = 185 points.
- Chips are awarded once per game, not per round.

---

## 6. CHANGELOG items not covered above

- Feud's old round winner card and return-to-hub after each round are removed; rounds go straight on.
- Feud matching uses each answer's aliases; short words must match exactly (RAIN never matches TRAIN). A spoken real word spelt close to an answer goes to the host as another word.
- Feud: a microphone switched off does not submit what it heard; one player's words are never judged for the next. After three mic sessions in a row ending within a second, the mic stops restarting itself.
- Feud: typing in any console takes over from the microphone. The bank box holds the final bank while the award cue plays.
- Feud Fast Money: a host correction cannot give player 2 the answer player 1 already scored; End Fast Money now keeps points already on the board.
- Feud bracket: the final names the finalists already known. Byes advance.
- Wheel: Undo onto a spin puts the team back at its choice with a fresh turn clock (if the timer is on). A near-miss ruling or dialog does not come back after Undo.
- Wheel: "Accept: the answer started before the buzzer" is a real ruling; Reverse or Undo takes it back.
- Wheel: a cue still waiting to play is dropped when the host overrides a ruling. A thrown-out Bonus puzzle never comes back on offer.
- Wheel: no soft-lock when every consonant is called. With only vowels left and nobody able to buy one, the puzzle is thrown out.
- Wheel: spin and solve cannot race. Letter keys with Ctrl, Alt or Cmd are ignored. Possessives read correctly on screen ("NIGHT OWLS' TURN").
- Engines: keys, buzzers, phones and host clicks cannot act out of turn. Every host ruling can be undone.
- Clocks keep true time in a background tab. Reset button text says when it ends a game. Long podium names wrap. No emoji on audience screens.
- Audio (all synthesized in-repo): Fast Money clocks, duplicate buzzer, "survey said" reveals, crowd reactions and studio applause (round won, puzzle solved), Sudden Death, toss-up and Frenzy beds, Mystery, Express, Wild Card, Million Dollar Wedge, time bell, Bonus clock and envelope, winner fanfare with drum roll.
- Content: 115 Feud surveys, 79 Fast Money questions, 331 Wheel puzzles. Wheel toss-ups have 10 per category in 7 categories, so Fortune Frenzy can open in any of them.
- Nothing repeats within an event until a new event or a score reset (surveys, Fast Money questions and Wheel puzzles).
- Wheel has no Free Spin any more; the wheel layout follows the current show.

---

## 7. Gaps and conflicts

- **Refresh during a game**: the guide says the game in progress is lost; changelog rc.4 says resume works on any screen. Treat the in-progress game as lost unless verified.
- **Door game**: phases, controls, guess entry and the door tiebreaker rules are not documented.
- **Gemini hub**: contents and behaviour not documented.
- **Start a new event**: what it clears beyond scores and bracket is not stated.
- **Feud bracket seeding**, **Credits** contents, **stopwatch** behaviour, **music** default volume, **show mode** default, team defaults and colour palette: not stated.
- **Wheel Short length**: whether the Bonus Round and tiebreaker run is not stated. Wheel letter payouts: the mechanism is given, not the wheel values.
- **Phones on Speed Round and Plinko**: no role documented. **Determine Play Order**: whether it can be re-run at any time is not explicit.
- **Voice answer submit delay** and **connected-phone limit**: not stated.
