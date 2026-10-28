# Family Feud: the rules this game follows

This is the reference the Family Feud game is built and tested against. It
follows the current syndicated show (2010-present) as closely as a party game
played by teams can, and was researched from episode transcripts, the show's
fan wikis and Wikipedia (there is no published official rulebook). Where the
show is ambiguous, the choice made here is marked **(app choice)**.

Families are the two teams in the match. Each family has five podium
positions; a team with a different player count wraps around its own size.
Position 1 is the captain.

## The main game

1. **Rounds.** Round 1 single points, round 2 single, round 3 double, round 4
   triple. The game is decided only when a round is decided: after each round,
   a family with 300 or more wins. If nobody has 300 after round 4, the game
   goes to **Sudden Death**. The target is a host setting (300 by default).
2. **Face-off.** Each round, the next podium position of each family faces off
   (round 1 the captains, round 2 the #2s, ... Sudden Death the #5s). The host
   announces "top N answers on the board" and reads the question.
   - The first player to buzz answers. The #1 answer wins the face-off at once.
   - Any other answer on the board is revealed and the opponent answers: a
     higher-scoring answer wins for the opponent; a lower one, a miss or no
     answer gives the face-off to the first family. Equal points: the first
     answer wins.
   - A miss shows one X and the opponent answers; any answer on the board wins
     for the opponent.
   - If both miss, the question goes **down the line in pairs**: the next
     member of the family that buzzed first answers, then the next member of
     the other family, each pair judged like a face-off, until someone hits.
   - Face-off X's never count as strikes.
3. **Play or pass.** The face-off winner decides once. Passing hands control to
   the other family at zero strikes; the answers already revealed stay in the
   bank.
4. **Control.** The controlling family answers one member at a time down the
   line, starting after the player who won the face-off (a family that was
   passed the board starts after its own face-off player). No conferring and
   no passing mid-round. A miss, a pass or no answer in time is a strike (the
   answer timer is a host setting, 5 seconds by default, shown to the host
   only).
   Repeating an answer already on the board is not a strike; the player is
   asked for another **(app choice, matching the show's usual leniency)**.
5. **Strikes and the steal.** Three strikes and the other family, which has
   been free to confer all along, huddles (for as long as the host allows, or
   15 or 30 seconds by host setting) and its captain gives **one** answer.
   If it is still hidden on the board they win the bank; if not, the
   controlling family does. Clearing the board before the third strike wins
   the bank outright with no steal.
6. **The bank.** Every answer revealed during the round, face-off answers from
   either family included, times the round multiplier. The bank shown above
   the board is the multiplied total; the tiles show raw survey numbers. A
   successful steal answer is revealed but its points are **not** added.
7. **After the round.** The host reveals the answers nobody got, from the
   bottom of the board up. They score nothing.
8. **Sudden Death.** Triple points, the board shows only the #1 answer, and it
   is a face-off only: whoever gives the #1 answer wins the round and the game,
   whatever the scores. A non-#1 answer is a miss. If both players miss, a new
   Sudden Death question is asked **(app choice; the show's fan wikis report
   the same)**.

## Fast Money

The family that wins the game plays Fast Money with two members it chooses.

1. Player 2 waits where they cannot see or hear the board.
2. Player 1 gets **20 seconds** for five questions; the clock starts after the
   host finishes reading the first question. "Pass" skips a question; passed
   questions come back if time remains. The screen shows a question only
   while a player is answering **(app choice)**.
3. Player 1's answers are revealed one by one ("You said... Survey said..."),
   then the board is cleared except the total.
4. Player 2 gets **25 seconds** for the same five questions. Repeating Player
   1's answer (or one in the same survey group) gets a double buzz and "Try
   again"; the clock keeps running.
5. A combined **200 points** wins the jackpot. If Player 1 alone reaches 200,
   Player 2 does not need to play. Otherwise the family earns the per-point
   consolation.
6. Answers not on the survey, and passes, score 0. A player's first distinct
   answer is the one that counts; the host can correct a ruling. A
   correction can never let Player 2 score Player 1's answer to the same
   question: to give Player 1 an answer Player 2 holds, Player 2's answer is
   ruled off the survey first **(app choice)**.
7. If the host ends Fast Money early, the points already shown in the total
   count, and it is a win only if they reached 200 **(app choice)**.

## How it maps to the event

- Each round's bank goes on the family's game score on the board (it starts at
  0 for every game, whatever the event scoreboard says).
- When the game ends, the winner's game score and Fast Money points go on the
  event scoreboard with a Plinko chip, and the losing family keeps its game
  score as event points **(app choice; the show pays the loser nothing)**.
  Reaching 200 in Fast Money earns a bonus Plinko chip.
- With three or more teams the event runs a bracket; each match is a full game
  unless the host picks the short "one round" format in Host Tools.
