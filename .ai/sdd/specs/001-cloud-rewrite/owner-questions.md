# Open product questions for the owner

Collected during implementation. Each has the interim choice the code uses now; say if you want a different one.

## Event wrapper (from the event engine)
- Q-010 Door game: teams now pick a distinct door directly; the old "guess 1-100, closest picks" step is gone. Keep direct picks?
- Q-011 Main games are playable once per event (as FR-051). The old app allowed replays. Allow replay?
- Q-012 Scores and chips clamp at 0 on manual changes. Allow negative scores?
- Q-013 "Start a new event" keeps team names and colours, zeroes scores/chips, returns to setup. OK, or reset to default teams?
- Q-014 Plinko: any team with chips may drop at any time (host-driven); no enforced order. OK?
- Q-015 Speed Round host extras from the old app (+/-5 s, reset, participant picker, challenge text, +1 chip) are not modelled yet. Add them?
- Q-016 Puzzle game: no event scoring; the host awards points/chips manually. OK, or should winning award a chip automatically?

## Design system
- Q-020 CRT "curve" is a stepped vignette, not true barrel distortion (which costs performance on the stage). OK?
- Q-021 Buttons use ink text on every bright fill for contrast; teal and plum buttons must stay 18 px or larger. OK?

## Puzzle game
- Q-001 Working title "Capsule Clinic". Approve or rename?
- Q-005 Added scoring/level progression/versus garbage the pygame source never had (proposed rules in design.md §8.4). Approve?
- Q-030 2P versus: both players draw capsules from one shared random stream, so sequences differ. Give each player the identical sequence (fairer, like the classic games)?
- Q-031 Garbage is sent per cascade step (each chained clear can send more). Alternative: count one lock's clears together. Which?

## Family Feud (from the engine)
- Q-040 Sudden Death: the winner currently also banks the #1 answer x3 on their game score (so it counts toward event points). Or should Sudden Death decide the game without adding points?
- Q-041 Fast Money survey groups ("same survey group" duplicates) are not in the content file; duplicates are detected by matching the same answer only. Add groups to the content later?

## Wheel of Fortune (from the engine; interim readings of the rules doc)
- Q-050 Trip wedge value is not in the rules doc; code uses $5,000. OK?
- Q-051 Same Letter $1,000 bonus goes into round cash (Bankrupt can take it) rather than being banked at once. OK?
- Q-052 Mystery flip: a flip gives up the money from that spin; flipped wedge becomes $500, the other $1,000; "keep" leaves both Mystery. OK?
- Q-053 Express run time-out passes the turn without a Bankrupt (doc lists only miss, repeat, wrong solve as Bankrupt). OK?
- Q-054 Ringing the bell mid-round takes effect at the next choice point and also skips the Triple Toss-Up when rung before it. OK?
- Q-055 Buying an already-called vowel still costs $250 and passes the turn. OK?
- Q-056 Bonus Wheel cash envelope mix and wheel layouts are reconstructions (documented in bonus.ts / wheels.ts). Any values you want changed?
