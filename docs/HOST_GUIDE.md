# Host guide

This guide explains how to run an event in the rebuilt app. It follows the code in `src/`, not the
old feature inventory. Where the code does not do something yet, it says **check in the app**.
Sign-in and the pause risk (Supabase Free projects pause after 7 days) are in `docs/DEPLOYMENT.md`,
sections 3 and 9.1.

## 1. Before the event

**Sign in.** Open the stage at `/`. The boot screen plays once per browser tab. Sign in with your
email and password, choose "Email me a sign-in link", or "New here? Sign up". Phones do not sign in.
Before a live event, sign in once so the database is awake (`docs/DEPLOYMENT.md`, section 9.1).

**Create the event.** On "Your events", type a name and press Create. The event opens with two teams,
"Team 1" and "Team 2". The list is newest first. Deleting takes two taps. Opening an event that has
progress offers **Resume**, **Start a new event** (two taps, zeroes the scores) or **Back to my
events**.

**Set the teams (Setup screen).**

- Use + and - for 2 to 8 teams. Two teams go straight to the hub; three or more pick doors first.
- Names are required, unique (case ignored), and at most 40 characters.
- Colour: one of eight presets. Players: optional, comma separated ("Ann, Bob"), shown on the Family
  Feud and Fast Money screens.
- A valid edit saves at once, so phones see the names while they join. An invalid draft blocks Start.
- **Start Game!** goes to the door game (three or more teams, no play order yet) or to the hub.

**Phones join.** Setup shows a QR code, the address `<host>/play` and a four-letter room code made of
consonants. On a phone: open the address, type the code, pick a team, optionally enter a nickname.
Until teams are saved, a phone sees "Host is still setting up".

**Second device (host view).** On a laptop or tablet, sign in at `/host` with the same account. Enter
the room code, or use "Open host view link" in Settings, which copies `<host>/host?room=CODE`.

**Two-minute check** (a procedure you run by hand; the app has no test mode).

1. Join two phones, one per team. Both appear on the Setup roster.
2. Press Start Game!, open **Family Feud**, press Enter (Start round 1) and Enter again (Start the
   face-off). Both phones show BUZZ.
3. Press 1. Team 1's phone shows BUZZED!. Press X to rule a miss.
4. Press F8 (Stand by), then Escape to resume.
5. Press F2 and F2 again (Host tools). Press F9 and F9 again (show mode).

## 2. Screens and keys

**The stage (`/`)** is a 1920 x 1080 screen for the projector. Game and finale screens add a sidebar:
the scoreboard (score -10 / +10, chips -1 / +1, a LEAD marker), the room code and join address,
**Pause** (F8), **Music**, **Show mode** (F9), **Settings**, and **Abandon game, back to hub** (Feud
and Wheel; two taps) or **Back to hub** (Speed Round, Plinko, Puzzle, Winner). The sidebar is hidden in
show mode and on Setup, which has its own Settings and Back buttons.

**Host tools drawer (F2)** has a Console tab (the current screen's console) and a Settings tab (the
stage settings). Escape closes it. F2 does nothing while paused or while a dialog is open.

**Pause, Stand by (F8)** freezes the game clocks, the Speed Round clock, the Fast Money clock, the Wheel
bonus clock and the music. Phone presses are refused. Escape or the Resume button (hidden in show mode)
resumes. While paused, Enter and Space do nothing, so a clicker cannot advance the show.

**Show mode (F9)** hides the sidebar and host buttons. Host controls reappear while the pointer is over
them or one has focus. Keys keep working, and the "another stage" banner stays. The setting is kept in
this browser.

**Buzz keys 1 to 8** buzz for teams 1 to 8, in list order, on the stage and in the host view. They are
ignored in text boxes and on held keys, and the stage refuses them while paused or a dialog is open.

**Global keys (stage):**

| Key    | Action                                 |
| ------ | -------------------------------------- |
| F2     | Host tools drawer, open or close       |
| F8     | Pause (Stand by) or resume             |
| Escape | Resume while paused; closes the drawer |
| F9     | Show mode on or off                    |
| 1 to 8 | Buzz for that team                     |

**Family Feud keys:** Enter is the next step on the screen (section 3.3). Space opens the buzzers. X is
strike or miss (or Steal fails). P is pass. Y is play. R reveals the next answer. U is undo.

**Wheel of Fortune keys:** Space spins. A to Z call a consonant (a vowel key buys when a vowel is the
legal move). Shift+B opens the vowel picker. Shift+T rings the time bell. Shift+U undoes. Enter opens the
envelope, continues, or starts a solve, in that order. 1 to 3 pick a Bonus category. K keeps and F flips
the Mystery wedge. R plays and P passes the Express.

**Puzzle Game keys:** Player 1 uses A/D (move), S (soft drop), W or E (rotate), Q (rotate back) and Space
(hard drop). Player 2 uses the arrows, / or . (rotate back) and Enter (hard drop). P or Escape pauses; while
paused, Q quits to the title. Menus use W/S or arrows, Space or Enter, and Escape.

**Focus caution.** After you click a button on the stage, it keeps keyboard focus, and Enter or Space
can press it again. Click a blank part of the stage before using those keys.

## 3. Run of show

The order is: doors, hub, any games in any order, then Announce the Winner.

### 3.1 Door game (three or more teams)

Opened by the hub tile **Determine Play Order**, or right after Start Game!. Each team picks a door; the
team to pick is the next one without a door, and you can click a team to pick for it. A pick can change
until everyone has picked, and no two teams share a door. **Open the doors!** reveals the order, and
**Continue to the hub** keeps it. The order seeds the bracket and the Wheel turn order. The tile locks
once a bracket starts. Changing the team count clears the order and reopens the doors. No screen sets the
order by hand (check in the app).

### 3.2 Hub

| Tile                 | Opens                | Notes                                                                 |
| -------------------- | -------------------- | --------------------------------------------------------------------- |
| Determine Play Order | Door game            | Needs three teams. Locked while the bracket runs.                     |
| Family Feud          | Bracket or one match | Two teams: one match. Three or more: a bracket. "(played)" when done. |
| Wheel of Fortune     | Wheel game           | Same "(played)" rule. Status in 3.4.                                  |
| Speed Round          | 60-second round      | Always available.                                                     |
| Puzzle Game          | Capsule Clinic       | One or two players.                                                   |
| Run Final Plinko     | Plinko finale        | Subtitle shows chips left to drop.                                    |
| Announce the Winner  | Final standings      | Ends the show.                                                        |
| Edit Teams           | Team dialog          | Names, colours, players. Save teams applies at once.                  |

The hub console (F2 drawer or host view) has **Stand by** / **Resume game**, **Show mode**, buzz buttons
1 to 8, and **Quit game, back to the hub** (two taps, only inside a game).

### 3.3 Family Feud

**Structure.** Two teams play one match. Three or more play a single-elimination bracket. Seeds follow
the play order (team order if there is none), and the top seeds get byes when the count is not a power
of two. Each match winner earns a Plinko chip, and the losing family keeps its game score. Between
matches, the bracket screen offers **Start [A] vs [B]** and **Back to hub**.

**Match card.** Shows the families, the target (300) and the Fast Money note. Enter: **Start round 1**.

**Face-off.** Each round the next player on each family faces off ("Give me [player] and [player]").

1. Enter or Space: **Start the face-off**. Phones show BUZZ for the two families only.
2. A buzz comes from a phone or keys 1 to 8. If you must decide who buzzed first, use **[Family]
   buzzed first**.
3. Type the answer in the box under the stage panel or the console's box. A clear match is ruled after
   a short "Survey says" beat. A near miss goes to host review. You can also click an answer on the
   console's answer sheet.
4. **Miss (X)** rules a miss, and the other family answers.

**Play or pass.** The face-off winner gets **[Family] play** (Y) or **[Family] pass** (P).

**Control.** The controlling family answers one player at a time. **Strike (X)** and **Passed (P)** each
add a strike, and so does **Out of time** (the answer timer does this itself). **Already up, ask again**
is a repeat and is not a strike. Three strikes hand the board to the other family.

**Steal.** The other family huddles. The huddle is untimed by default. Enter: **Take the captain's
answer**, then judge the one answer. An answer still hidden on the board wins the bank for that family.
**Steal fails (X)** keeps the bank with the controlling family.

**Round decided.** Enter or R: **Reveal next answer**, or **Reveal all**. Then the round summary:
**Next round**, or **Continue** once a family has won.

**Multipliers.** Rounds 1 and 2 are x1, round 3 is x2, round 4 is x3. The console's x1, x2 and x3 buttons
override the round's multiplier. Sudden Death is always x3.

**Sudden Death.** If no family reaches the target after round 4, Enter **Start Sudden Death**. Only the
number-one answer counts. For a double miss, the rules doc asks for a new question (check in the app).

**Game won.** Enter **Play Fast Money**, or **Finish the game** if Fast Money is off. **Skip Fast Money**
(two taps) works until Player 1's clock starts.

**Fast Money.**

1. Players default to positions 1 and 2 of the winning family. Change them in the Fast Money panel and
   press **These two play**. Keep Player 2 out of sight of the board.
2. **Deal new questions** is available before the clock starts.
3. Enter: **Start the clock**. Player 1 has 20 seconds and Player 2 has 25. Pass (P) skips a question,
   and passed questions return while time remains. **Stop the clock** and **Resume the clock** pause it.
4. Enter: **Reveal next** ("You said... Survey said..."). **Reveal all** runs the steps. The last step is
   **Clear the board**. **Play the duplicate buzzer** plays the cue.
5. **End Fast Money now (keep N points)** ends it early (two taps).
6. The ruling table rules each answer. A total of 200 or more earns the family a bonus chip.

**Game over.** Enter **Continue**. The result goes to the event (section 7).

**Host review.** A near miss or unclear answer waits for you: **Accept as #n**, **Not on the board (X)**
(or **Steal fails**), **Not an answer, ask again**, **Already up, ask again** (control only), or **Accept
that one** from a list.

**Other controls.** **Replace question** restarts the round at the face-off with the same players, and
scores stay. **Browse question bank** shows what is left ("Running low" under 10) and offers **Use for
this round**. **Undo** (U) steps back up to 30 engine steps, Fast Money included, and first cancels a
pending "Survey says" beat or review. **Abandon game, back to hub** (sidebar, two taps) ends the game with
no scores; questions already used stay used.

**Typing and voice.** This build runs the Feud controller on fixed defaults: the host types the answers,
voice is off, and phones cannot type. The host view's **Voice answers** and **Answers from** are saved
but the game does not read them (check in the app). A typed near miss goes to host review. Steal answers
and Fast Money never listen. The console's Mic button appears only when voice is on.

**Timers.** The answer timer is 5 seconds on a face-off or control turn. Only the console shows it. When
it runs out, the turn is a strike, or a face-off miss. Typing holds it for 3 seconds.

### 3.4 Wheel of Fortune

**Status.** The Wheel game and its console are in `src/games/wheel`. `src/app/stageRegistry.ts` registers
them in the working tree, but that change was not committed when this guide was written. Check in the app
that the Wheel tile opens the game. The flow below is what the module does.

**Opening.** Classic: a $1,000 toss-up, then a $2,000 toss-up; the second winner starts Round 1. Or
Fortune Frenzy: 30 seconds of $1,000 toss-ups, and the last solver starts Round 1.

**Toss-ups.** Letters appear by themselves about every 0.9 seconds. After the first letter, any team may
buzz (phone BUZZ, or keys 1 to 8) and answers. A wrong answer locks that team out of the puzzle. Rule with
**Judge: correct** or **Judge: wrong**. A close answer waits for **Accept** or **Reject**.

**Rounds.** Round 1 (top $2,500) has the Wild Card, the Million Dollar Wedge and a trip. Round 2 (Mystery)
has two Mystery wedges (K keep, F flip). Round 3 (Prize Puzzle) has the Express (R play, P pass). The
Triple Toss-Up follows Round 3, then Round 4 (top $5,000). Round 4 is a normal round unless the time bell
is rung, which makes it the Speed-Up. With the setting "Round 4 opens as the Speed-Up", it starts as the
Speed-Up.

**A turn.** Spin (Space, the phone's SPIN or the Spin button). Call a consonant (A to Z), or buy a vowel for
$250 (Shift+B). Solve with Enter, the Solve button, or the phone. A wrong consonant, a repeated letter, a
Bankrupt, Lose a Turn, a timeout or a wrong solve passes the turn.

**Bell and Speed-Up.** Shift+T or **Time bell**. Between rounds, the next round or the Triple Toss-Up becomes
the Speed-Up; mid-round, the round becomes it at the next choice point. The bell does nothing in the
Speed-Up, the tiebreaker, the Bonus Round, or after the game. In the Speed-Up the team in control spins
once; each consonant is worth that value plus $1,000, and vowels are worth nothing. A team has 3 seconds to
solve after a correct letter.

**Clocks.** The turn timer is Off, 5 or 10 seconds, and can change mid-game. If a team's answer began before
the clock ran out, press Enter or Solve within 1.5 seconds, or use the **Late answer** ruling, to give the
solve back.

**Bonus Round.** The highest total plays; a tie is broken by a $1,000 toss-up. Pick a category (1 to 3), spin
the Bonus Wheel (the envelope stays sealed, under Secrets), and Enter **Start the 10 second clock**. R, S, T,
L, N and E are revealed. The team calls three more consonants and one vowel (four consonants with a Wild Card).
It has 10 seconds to solve, and a correct answer before the clock starts also wins. Enter **Open envelope**
(three seconds of suspense), then **Final results** and **Continue to the hub**.

**Host tools.** Rulings: **Judge** correct or wrong, **Reverse**, **Accept** or **Reject**, **Late answer**,
and **Accept: the answer started before the buzzer** (Bonus). Flow: **Continue**, **Ring the time bell**,
**Turn all lit letters**, **Open envelope**, **Undo last step** (Shift+U, 30 steps). Turn and puzzle:
**Skip to next team**, **Give the turn to** (one button per team), **Throw out puzzle**, **End unsolved**.
Scores: adjust a team's bank by $100 to $1,000, up or down. Settings: the live turn timer and the next-game
form. The host bar's **Pause** opens a menu: **Resume**, **Restart** (throws out the puzzle, when legal),
**Options**, and **Quit to hub** (two taps).

### 3.5 Speed Round

Optionally type a challenge (it shows on the stage). **Start** runs the 60-second clock with its music.
**Pause** and **Resume** hold it (F8 also freezes it). **Reset** gives a full 60 seconds and awards nothing.
At time up the alarm sounds and the award sheet opens; **Awards** opens it earlier. The sheet gives each team
-10 or +10 points (never below its score) and -1 or +1 chips. **Award and return to hub** banks them. Back to
hub from the sidebar awards nothing, so award first. The challenge text is not saved across a refresh.

### 3.6 Puzzle Game (Capsule Clinic)

The title screen offers **1 Player** (clear every germ), **2 Players** (versus, first to three rounds) and
**Back**. Setup gives each player a level (1 to 20) and speed (LOW, MED or HI), plus music for Player 1.
Escape or Back on the title returns to the hub. At the end of a round or match, Enter, Space or **Press
Start** continues. The puzzle game keeps its own score and posts nothing to the event; enter any points from
the sidebar.

### 3.7 Final Plinko

Each team button shows its chips; a team with none cannot be chosen. Pick a column (1 to 9), then **Drop**.
Each drop costs one chip and plays eight rows of pegs, and the slot value is the team's points. **End Plinko**
asks for two taps if chips remain. Unused chips stay with their teams. Slot values, left to right: 100, 200,
300, 500, 1000, 500, 300, 200, 100. No screen changes them.

### 3.8 Announce the Winner

The fanfare plays once. The champion shows in their colour, with the final standings. A tie shows "IT IS A
TIE" and shares the rank. **Back to hub** returns to the hub. **Start new event** (two taps) keeps names,
colours and players, zeroes scores and chips, and returns to setup. **Back to my events** from here marks the
event finished; it opens later as a read-only record.

## 4. What players see on their phones

**Joining.** "Getting ready...", then "Join the game" (errors: room not found, too many tries, server
unreachable, lost game screen), "Pick your team", "Host is still setting up" (no teams yet), and "Joining the
game..." (connected, no stage message yet).

**Playing.**

- **BUZZ** in the team's colour: live. **BUZZED!** after the stage accepts a press. **Buzzed (waiting...)**
  until the stage answers.
- Grey reasons: **Buzzers are off** (hub, and Feud control), **Not in this match** (Feud, not one of the two
  families), **Waiting for [team]**, **Paused**, **Locked out of this puzzle**, **Not in this tiebreaker**.
- Wheel stage labels: SPINNING, WAIT FOR A LETTER, CALL A CONSONANT, SOLVING, ROUND OVER, SOLVE NOW, and so on.
- **Your turn** with Buy, Spin and Solve for the team at the wheel. Solve opens "Solve the puzzle"; the
  phone then shows Sent or Not right now.
- The Feud "TYPE YOUR ANSWER" box appears only when the stage allows phone answers, which this build does
  not (section 3.3).

**Connection.** The header says Live, Connecting, Reconnecting, Offline or No connection, with a
"Reconnecting..." banner when the link drops. A phone silent from the stage for eight seconds shows "Waiting
for the game screen...", and it rejoins by itself. After two minutes it returns to the code screen with "Lost
the game screen. Enter the room code again." Change team and Change room are in the footer.

## 5. Recovery

**Refresh the stage tab.** The boot screen does not repeat in that tab. An event with progress shows
Resume, Start a new event, or Back to my events. Feud and Wheel restore their saved state, and the Speed Round
clock runs on real time. Pause, dialogs and the drawer are not saved, so the stage returns unpaused.

**Connection loss.** Phones rejoin by themselves, and the stage shows "Phones are reconnecting..."
meanwhile. If the host view loses contact, it keeps trying; if the stage window closed, reopen it and then
the host view link.

**Signed out or saves failing.** A banner says the show keeps running. Sign in again when the game ends; the
sign-in screen returns once no game is running. "Not saving right now" means saving is retried.

**Another stage is running this event.** Only one stage window may run an event. A second window is read-only:
its buttons and saves do nothing. Close the other stage window, wait up to 30 seconds, then press **Reload this
event** (hidden in show mode).

**Undo.** Feud (U) and Wheel (Shift+U) keep 30 steps. Speed Round, Plinko, the Puzzle Game and the
Winner screen have no undo.

**Wrong ruling.** In Feud, Undo, or re-rule the Fast Money answer. In Wheel, use **Reverse** for a right
ruling; Undo would bring back a puzzle everyone has seen. Reversing throws the puzzle out and keeps the turn
and money as the reversal leaves them. A bad question or puzzle: **Replace question** (Feud) or **Throw out
puzzle** (Wheel), which keep the scores, turn and money.

**Abandon.** The sidebar's **Abandon game, back to hub** (two taps) ends the game with no scores. A Feud match
can be replayed from the bracket, and the Wheel stays available. Questions used stay used.

**Wrong score.** Use the sidebar. In Wheel, the bank buttons adjust by $100 to $1,000.

**Reset scores & chips** (Settings, two taps). Zeroes every score and chip, clears the bracket, the "(played)"
marks and the used-question list, and ends a running game with no scores. Teams and play order stay.

**Change teams mid-event.** Edit Teams on the hub. Changing the team count clears the play order and bracket
and reopens doors (three or more teams).

**A click did nothing.** The turn moved on, the stage is paused or a dialog is open, or a second click landed
within half a second.

## 6. Settings reference

Stage settings open from the hub, the sidebar, Setup and the F2 drawer, and are stored in this browser only.

| Setting         | Default | Notes                                 |
| --------------- | ------- | ------------------------------------- |
| Music           | On      | Hub and game music                    |
| Volume          | 80%     | Master volume                         |
| Show mode       | Off     | F9; remembered in this browser        |
| CRT curve       | Off     | Screen overlay                        |
| Verbose logging | Off     | Debug messages in the browser console |

Host view Settings are saved to your account. Show mode also goes to the stage.

| Setting                  | Default              | Notes                                                         |
| ------------------------ | -------------------- | ------------------------------------------------------------- |
| Music, Volume, CRT curve | On, 80%, Off         | The stage does not read these (check in the app)              |
| Voice answers            | Off                  | Not read by the Feud game (check in the app)                  |
| Answers from             | Host types or speaks | Options: Phones; Host and phones. Not read (check in the app) |

Family Feud settings. No screen changes these, so the game runs on the defaults (check in the app).

| Setting       | Default                 | Other values            |
| ------------- | ----------------------- | ----------------------- |
| Winning score | 300                     | 200, 400, 500           |
| Match format  | Full game               | One round               |
| Fast Money    | On                      |                         |
| Answer timer  | 5 seconds               | 0 turns it off          |
| Steal huddle  | Untimed (host calls it) | 15 or 30 seconds        |
| Voice         | Off                     | On                      |
| Answers from  | Host                    | Phones; Host and phones |

Wheel settings (Wheel console). The turn timer applies at once. The stage does not pass saved Wheel settings
into a new game, so each game starts from these defaults (check in the app).

| Setting     | Default                        | Other values                  |
| ----------- | ------------------------------ | ----------------------------- |
| Turn timer  | Off                            | 5 or 10 seconds (live)        |
| Opening     | $1,000 and $2,000 toss-ups     | Fortune Frenzy (30 seconds)   |
| Speed-Up    | Host rings the bell in Round 4 | Round 4 opens as the Speed-Up |
| Length      | Full show                      | Short show                    |
| Bonus Round | On                             | Off                           |

| Setting               | Default                                      | Changeable?                  |
| --------------------- | -------------------------------------------- | ---------------------------- |
| Speed Round length    | 60 seconds                                   | No screen (check in the app) |
| Plinko slot values    | 100, 200, 300, 500, 1000, 500, 300, 200, 100 | No screen                    |
| Teams for a new event | 2                                            | Yes, on Setup                |
| Team colours          | Eight presets, in order                      | Yes, per team                |

## 7. Event scoring

Points go on the event scoreboard. Chips are spent only at Final Plinko.

| Source                         | Points                                                    | Chips                                               |
| ------------------------------ | --------------------------------------------------------- | --------------------------------------------------- |
| Feud match, winning family     | Game score (banks times multiplier) plus Fast Money total | +1 for the match; +1 more if Fast Money reached 200 |
| Feud match, losing family      | Its game score                                            | None                                                |
| Wheel, every team              | Bank divided by 100, rounded                              | Winner +1; +1 more for winning the Bonus Round      |
| Wheel Bonus Round prize        | Not added to points                                       | The bonus chip above                                |
| Speed Round                    | Per team, steps of 10 as awarded                          | Per team, steps of 1 as awarded                     |
| Final Plinko                   | The slot value of each chip dropped                       | -1 per drop                                         |
| Puzzle Game                    | None automatically; enter by hand                         | None                                                |
| Door game, Announce the Winner | None                                                      | None                                                |
| Sidebar buttons                | +10 or -10                                                | +1 or -1                                            |

Scores and chips never go below zero. Reset scores & chips returns every team to zero.
