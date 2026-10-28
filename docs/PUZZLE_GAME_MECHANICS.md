# Falling-Capsule Puzzle Game: Mechanics Specification (derived from a pygame clone)

Source studied (read-only): `Game Hub/Dr. Mario/` {drmario.py, constants.py, views.py, scripting.py, casting/{grid,pill,block,virus}.py}.
Top-level grid.py/pill.py/block.py/virus.py are an older unused copy (views.py imports `casting.*`); where they differ the `casting/` version is authoritative.
Terminology here is generic: capsule (pill), germ (virus), half (single capsule cell), board (grid), player.
Tags: [SRC] = exactly what the source does. [BUG] = source defect, do not replicate. [FIX] = recommended behaviour for the new game. [NOT IN SOURCE] = feature absent; designer decision needed.
Rows are numbered 0 (top) to 15 (bottom); columns 0 (left) to 7 (right). All timings in milliseconds.

---

## 1. Board, cell states, spawn

---

- Board: 8 columns x 16 rows, 32 px cells (casting/grid.py L15-30; constants.CELL_SIZE=32). Board pixel size 256x512.
- Cell value (int): 0 = empty, 1 = colour A (red), 2 = colour B (yellow), 3 = colour C (blue). The int grid stores ONLY colour. Whether a cell is a germ, a capsule half, or a lone half ("block") is tracked in separate object lists:
  - germs: list of [row, col, colour]; germs never move.
  - landed capsules: objects with main=[row,col,colour], second=[row,col,colour].
  - lone halves ("blocks"): objects with row, col, colour (created when a capsule's partner is cleared).
  - The live (falling) capsule is NOT written to the int grid until it locks.
- [FIX] Use a typed cell: {kind: empty|germ|half, colour, pieceId, partnerDir}. Derive everything from that instead of parallel lists.
- Capsule = two halves, `main` and `second`, each with an independent colour.
- Spawn: main at (row 0, col 3), second at (row 0, col 4): horizontal, main = left half, second = right half. Spawn happens at the top of the next frame after the previous capsule locks (even while clears/drops from that lock are still pending; see sect. 2 ordering).
- Capsule colours: 2 independent uniform draws randint(1,3) (main first, then second) => 9 equiprobable ordered combos. No bag, no next-piece preview, no repeat suppression. [SRC]
- Screen layout [SRC] (for reference only): window 1024x960 logical, 60 fps. Single-player board top-left (385,320). 2P: P1 board (128,320), P2 board (640,320). Cell->pixel: x = col*32 + originX, y = row*32 + originY.

---

## 2. Capsule movement, rotation, gravity, lock

---

### 2.1 Input mapping [SRC]

| Action                          | 1P / P1                                                          | P2 (versus only) |
| ------------------------------- | ---------------------------------------------------------------- | ---------------- |
| move left                       | A                                                                | Left arrow       |
| move right                      | D                                                                | Right arrow      |
| soft drop (1 row)               | S                                                                | Down arrow       |
| rotate (counter-clockwise only) | W                                                                | Up arrow         |
| back / quit game screen         | Esc                                                              |                  |
| "pause"                         | Space: only prints the grid to the console, NO pause implemented |                  |

- No key auto-repeat (pygame.key.set_repeat never called): one KEYDOWN = one action. Holding does nothing.
- No hard drop, no clockwise rotation, no hold, no next preview.
- Keys are ignored while any landed piece is mid-fall (`dropping_sprites` non-empty), i.e. during cascade falls. They are NOT ignored while clears are merely pending, so the player can slide/soft-drop the new capsule during the clear-pending tick.

### 2.2 Blocked flags

For a cell (r,c) blocked[left|right|down|up] is true if on the wall/floor/ceiling edge OR the neighbouring grid cell != 0.
Flags for both halves are computed once per frame before the event loop (stale if several events arrive in one frame; minor [BUG], [FIX] recompute after each action).

- Move left/right/down: allowed iff NEITHER half is blocked in that direction. (The partner half's own cell is empty in the int grid, so no self-blocking occurs.) Plays move sfx.
- Soft drop never locks; it only moves down one row when not blocked.

### 2.3 Rotation [SRC] (precisely)

Rotation is 90 deg counter-clockwise about the `main` half; geometry:

- horizontal -> vertical: second moves to (main.row-1, main.col) (directly above main). Colours stay: main = bottom, second = top.
- vertical -> horizontal: second moves to (main.row, main.col+1). Colours of main and second are SWAPPED (so the old top colour ends on the left).
  (Net visual effect: a true CCW rotation of a 2-cell piece around its bottom/left cell.)
  Guard logic executed on the rotate key (main_blocked is the blocked-flag set of `main`):

```
if (isVertical and main.col == 7) or main.blocked.right:
    move whole capsule one column left (no free-space check!); then rotate
elif isHorizontal and main.blocked.up:
    do nothing (no rotation)
else:
    rotate
```

Consequences:

- Rotating a horizontal capsule needs the cell above `main` empty. At row 0 (e.g. right after spawn) rotation is impossible until it has fallen one row. [SRC] (a quirk; fine to keep or relax).
- Vertical -> horizontal needs the cell right of `main` empty; if it is occupied or main is on col 7, the capsule is kicked one column left first (wall kick / ledge kick), so `main` ends at col-1 and `second` at the old column.
- For a horizontal capsule `main.blocked.right` is never true (that cell is the capsule's own second half, empty in grid), so the kick branch only ever triggers from vertical.
- [BUG] The left kick does not test the left cell or col 0. With a vertical capsule at col 0 and the right cell occupied, main goes to col -1 (Python negative indices then wrap to col 7 in later reads: corrupt state). With an occupied left cell the halves overlap an existing cell.
- [FIX] If vertical->horizontal and right cell blocked: if left cell free (and col>0) shift left then rotate, otherwise do not rotate (standard behaviour). Also permit rotation at row 0 if desired.
- No 180-degree/second-direction rotation, no rotation sound if rotation is refused.

### 2.4 Gravity ("step") timer [SRC]

- A single free-running periodic timer per board posts a STEP event every `SPEED` ms. It starts when the game screen opens, is never reset by input, locking, spawning, or clears.
- Speed settings (constants.SPEEDS): LOW = 1000 ms/row, MED = 500 ms/row, HI = 250 ms/row. Defaults LOW.
- The interval is constant for the whole game: NO acceleration over time, capsules placed, or level. Level only controls germ count. (There is no per-level gravity table.)
- Each speed value is applied to the whole step cadence: capsule fall, cascade fall, and clear delay all run at one action per STEP. So HI is also faster cascades.
- [BUG] Single-player options screen: clicking the LOW button sets SPEED to MED (views.py L149). LOW is reachable only as the untouched default. Versus options set LOW correctly.
- 2P: each player has an independent SPEED (handicap), independent timer events (USEREVENT+1 for P1, +2 for P2).

### 2.5 Per-STEP priority, single-player [SRC] (views.py L365-381)

Snapshot at start of each frame: `blocks_to_clear` (sect. 4), `dropping` (sect. 5), blocked flags. On each STEP event, exactly ONE of the following happens, in priority order:

1. `blocks_to_clear` non-empty: apply all clears (sect. 4.3).
2. else `dropping` non-empty: every droppable piece falls 1 row (sect. 5); play drop sfx.
3. else if live capsule has support below either half (`main.blocked.down or second.blocked.down`): LOCK: write both halves' colours into the int grid, move the capsule to the landed list, spawn a new capsule next frame; play place sfx.
4. else live capsule moves down 1 row; play move sfx (this sfx plays on every gravity step).
   So: clear > cascade fall > lock > fall. The live capsule is frozen while clears/falls are pending (gravity only). Nothing is processed at the moment of locking itself: matches formed by a lock are detected in the next frame's snapshot and removed on the next STEP (one full gravity interval later).

### 2.6 Lock delay [SRC]

No explicit lock delay or reset. A capsule locks on the first STEP tick that finds support beneath it. Since the timer is free-running, effective lock delay after touching down is 0..SPEED ms (the remaining time to the next tick), and the player may still slide/rotate during that window (also slide off ledges). Input after lock within the same frame still manipulates the (already landed) capsule object visually but not the grid: [BUG] minor.
[FIX] Implement an explicit lock delay (e.g. fixed 500 ms or one gravity interval, reset on successful move) or keep "lock on next tick" semantics.

### 2.7 Per-STEP priority, versus [SRC]

Differs (and is broken): see sect. 7.3.

---

## 3. Germ placement (level setup)

---

- Selectable level 1..20 (menu has 20 bars). Germ count = level (1 germ per level; constants comment "number of viruses"). Level 20 = 20 germs. There is no table/formula beyond count = level. Level also is displayed in the HUD.
- Placement algorithm [SRC] (casting/grid.py add_viruses):

```
while germs.length < count:
    r = randint(5,15); c = randint(0,7); col = randint(1,3)   # three draws per attempt, in this order
    if grid[r][c] == 0: grid[r][c] = col; germs.push([r,c,col])
```

- Allowed rows 5..15 (inclusive): the top 5 rows (0-4) are always germ-free. All 8 columns. 88 candidate cells, so max feasible count 88.
- Colour uniform and independent. No colour balancing, no per-colour quota.
- NO constraint against 3-or-more in a row: random layouts can contain pre-formed runs of 4+ (they auto-clear on the first STEP before any capsule can act) or even zero germs left. [FIX] Reject colours that would create 3 same-colour in a row/column (or 4), and balance colour counts as evenly as possible; guarantee at least 1 germ.
- Rejected attempts (occupied cell) still consume 3 RNG draws.
- RNG: Python global `random` module, never seeded (non-deterministic). Capsule colours use the same global stream. For a deterministic port: use one seedable PRNG, same call order (germ placement first, then capsule colour draws as capsules spawn). In versus, each board places its own germs independently (layouts differ per board; consider using the same seed for fairness [FIX]).
- Germ sprite is static (only frame "a" is used).

---

## 4. Match detection and clearing

---

### 4.1 Rule

A match = a run of >= 4 orthogonally contiguous same-colour cells in one row or one column (any cell type: germ, capsule half, lone half; partner pairing irrelevant). Runs of 5, 6, 7, 8 clear entirely. Horizontal and vertical lists are concatenated, so L/T/+ shapes clear all participating cells; cells in two runs appear twice (harmless).

### 4.2 Scan implementation [SRC] and its defects

Horizontal pass: rows top-to-bottom, cols left-to-right. Vertical pass: cols left-to-right, rows top-to-bottom. A single `run` list is kept across the whole pass and is NOT reset between rows (horizontal) or columns (vertical). Steps per cell:

```
if cell==0: if len(run)>=4: out+=run ; run=[]
elif run empty: run=[cell]
elif cell.colour==run[0].colour: if sameLine(cell,run[0]): run.append(cell)   # else silently ignored
elif len(run)>=4: out+=run; run=[cell]
else: run=[cell]
```

[BUG] A run touching the end of a line is only flushed when the next line's first cell is 0 or a different colour:

- a horizontal run ending at col 7 of row 15 (bottom row) never clears; a vertical run ending at row 15 of col 7 never clears (nothing flushes after the final line).
- if the next line begins with the same colour as the unflushed trailing run, that line's leading cells are ignored (a legitimate 4-run at the start of row r+1 is missed this tick).
  [FIX] Per-line scan with a counter reset at each line start and a flush at line end:

```
for each line: i=0; while i<len: j=i; while j<len && cell[j]!=0 && cell[j].colour==cell[i].colour: j++; if cell[i]!=0 && j-i>=4: mark i..j-1; i=max(j,i+1)
```

### 4.3 Applying clears [SRC] (scripting.handle_clears)

For each marked cell (a cell whose state was already removed earlier in the same pass is a no-op):

- germ: remove from germ list, delete sprite, grid cell = 0. (No sound.)
- lone half: delete it, grid cell = 0. (No sound.)
- capsule half: grid cell of that half = 0; the capsule object is destroyed and the OTHER half becomes a new lone half (same position, same colour) that stays in the grid. If both halves are marked, first one converts the partner to a lone half and the partner is then removed as a lone half (net: both cleared). Play clear sfx once per capsule-half cell (the sfx call sits in the capsule branch only).
- All marked cells in the list clear simultaneously within one STEP.
- No score, no counters except germ-count HUD, no particles/animation (sprites clear_1..3 exist but are unused).

### 4.4 Chain / cascade

No special chain logic. After a clear step, the next STEPs: (a) re-scan; if matches exist they clear first; (b) else unsupported pieces fall one row per STEP; (c) else a new capsule resumes falling. Matches formed after falls are therefore cleared automatically (cascade) with one STEP of delay each. Chain length is not tracked.

---

## 5. Gravity after clears

---

[SRC] check_for_drops builds the list of pieces to move down by one row at each STEP when no clears are pending:

- lone half: falls if the cell below is empty and not the floor.
- landed capsule: falls only if BOTH halves have an empty cell below (the cell below is read from the int grid).
- Pieces are moved in list order (lone halves first, then capsules); each move copies colour down one row and zeroes the old cell. A piece resting on another piece that is itself falling does not move that STEP (support is judged on the snapshot), so a contiguous floating stack falls with 1-cell gaps opening between pieces, and re-compacts on landing. Matches can transiently form mid-fall, and clears take priority over falls at the next STEP.
- [BUG] Vertical capsules never fall: for a vertical capsule the upper half's "cell below" is its own lower half (non-empty) so the "both halves unsupported" test always fails. Vertical capsules left hanging after the germ/piece under them is cleared stay in mid-air until one half is cleared. (Because rotation always puts `second` above `main`, every vertical capsule is affected.) [FIX] Exclude the partner cell from the support test; fall if every non-partner cell below is empty.
- [FIX] Recommended: make the whole unsupported mass fall together (bottom-up pass, or iterate "any piece whose all below-cells are empty falls", repeated per STEP), one row per STEP.
- Germs do not fall and are never affected by gravity; they act as fixed supports.
- Fall sfx: block_drop plays once per STEP in which anything fell (not per piece).

---

## 6. Scoring, win/lose, progression (single-player)

---

### 6.1 Scoring [NOT IN SOURCE]

No score exists: no points per germ, no combo multiplier, no speed-dependent scoring, no high score. The only HUD stats are level, speed label, and remaining germ count.
[Suggested design for the new game, not from source] points per germ = base(100) * 2^(germs cleared in same chain step -1), multiplied by speed (LOW x1, MED x2, HI x3), chain-step multiplier on cascades.

### 6.2 Win condition [SRC]

Checked at the top of every frame: `germs list empty` => "YOU WIN": console print, 3000 ms blocking wait, then the game screen closes and control returns to the single-player options screen (level/speed/music selection again). There is NO next-level progression, no level increment, no win jingle (fanfare files are unused).
[FIX/design] On win: level+1 (cap 20), fresh board, keep speed.

### 6.3 Lose / top-out [SRC]

Checked at the top of every frame: grid cell (0,3) != 0 (a locked half at the left spawn cell) => "GAME OVER": 3000 ms blocking wait then back to options screen. Notes:

- Only (0,3) is tested in single-player; versus tests (0,3) and (0,4).
- Spawn cells are not tested for overlap at spawn time; a capsule can spawn over an occupied (0,4) and then lock, overwriting that cell's colour. [BUG minor] [FIX] test both spawn cells before spawning; if either is non-empty, top-out.
- [BUG] The game-over image is blitted then the thread sleeps 3 s, but the screen is not flipped before the sleep and the loop body then redraws the board and flips, so the player never sees the game-over image. Win has no image at all. [FIX] draw and flip before waiting.
- Win is tested after game-over in the same frame; both just set running=False.
- [BUG] If the window-close event occurs on menus the code calls pygame.quit() and keeps looping (crash). During gameplay the QUIT check is nested under KEYDOWN so window close is ignored.

### 6.4 Exit

Esc during game returns to options screen (stops all sound). Esc on options returns to title; Esc on title exits the program.

---

## 7. Two-player versus

---

### 7.1 Setup

- Two separate boards side by side, each with its own germ layout (count = that player's chosen level 1..20), its own gravity speed (LOW/MED/HI), own capsule stream (shared global RNG, sequential draws), own groups. Crowns drawn in the gap between boards.
- Same-time play, real-time, no turn order. Keys as in sect. 2.1.

### 7.2 Attack / garbage / combo rules [NOT IN SOURCE]

There are NO attacks: nothing is ever sent to the opponent, no garbage capsules, no combo detection. The two boards never interact. It is a pure race. (Combo sfx p1_combo/p2_combo exist but are unused.)
[Suggested design, not from source] On a chain/multi-colour clear send 1..4 garbage halves, dropped from the top in random columns of the opponent board.

### 7.3 Round logic [SRC] (views.py L470-531), evaluated every frame, first match wins (if/elif chain):

1. P1 board has (0,3) or (0,4) occupied => P2 scores the round.
2. else P2 board has (0,3) or (0,4) occupied => P1 scores the round.
3. else P1 germ list empty => P1 scores.
4. else P2 germ list empty => P2 scores.
   (Ties/simultaneous events resolved by this order: P1 loses ties on top-out, P1 wins ties on germ clears.)
   Scoring a round: append to that player's win list, add a crown icon, blocking 3000 ms wait, then BOTH boards are reset (cells zeroed, groups emptied, germ list cleared, same levels re-seeded with fresh random germs; capsule groups emptied so new capsules spawn). No winner banner, no sound.
   Match end: checked at the top of the frame: if either win list has 3 entries ("first to 3", i.e. best of 5) => 3000 ms wait with game-over image (never actually visible, same bug) then return to the versus options screen. No rematch prompt, no per-round score screen.

### 7.4 Crowns [SRC]

Each round win adds a crown icon (54x54). P1 crown column x=453, P2 x=520, base y=330, 62 px vertical pitch.
[BUG] add_crowns is called with the whole win list each time and appends `len(wins)` crowns each call at y = base + len*62, so crown_list accumulates duplicates (1st win: 1 crown at +62; 2nd win: 2 more at +124; 3rd: 3 more at +186). [FIX] draw one crown per win at base + i*62.

### 7.5 [BUG] Versus lock/clear timing is broken (do not replicate)

In versus the clear list is computed at frame start BEFORE the locking STEP is processed and is only consumed inside the "capsule locked" branch. Consequences: (a) matches created by a capsule are not cleared when it locks; they are cleared when the NEXT capsule locks (list recomputed on a later frame); (b) nothing is cleared while the next capsule is falling, so matched pieces just sit there, and the last germ of a round is removed only after one more lock; (c) the clear tick is merged with locking instead of being its own STEP. Single-player ordering (sect. 2.5) is the correct intent. [FIX] Use the same per-STEP priority (clear > fall > lock > move) for both modes.
Also versus has no "clear pending" priority, so a falling cascade freezes only that player's board.

---

## 8. Menu flow

---

All menus are mouse-driven (hover/click) with ENTER/ESC; screens are 1024x960 full-screen images with drawn selectors.

1. Title screen (loops menu music, `menu.wav`, looping). Two invisible clickable rectangles: "1 player" (275,660,490x60) and "2 player" (275,720,490x60). Hovering shows the 41x36 heart marker at (275,672)/(275,732) and plays hover beep once per hover-entry. Left click (any time pressed, no edge detection) stops all audio and opens the options screen. Esc exits.
2. 1P options (menu music loops again). Controls (all by left-click, hit-rects are fixed):
   - Level: 20 bars, left=320+20*i, top=320, 20x70 each; i=0..19 selects level i+1. Triangle marker (38x31) snaps to the bar; level number drawn at (775,290). Default 1.
   - Speed: LOW rect (315,530,150x75), MED (465,530,190x75), HI (660,530,150x75); marker (106x29) at x=336/506/681, y=510. Default LOW. [BUG] LOW click sets MED (see 2.4).
   - Music: FEVER (180,730,250x70), CHILL (430,730,270x70), OFF (700,730,180x70); same marker graphic at x=257/500/745, y=705. Default FEVER.
   - Any mouse-up on the screen plays the hover beep (click blip). ENTER starts the game (menu audio stopped). Esc returns to title.
3. 2P options: same but two level rows (P1 bars at y=290 h65, P2 bars at y=355 h65), two speed rows (P1 y=510 h55, P2 y=565 h55), shared music row, P1/P2 markers use two different marker graphics (p1 down-pointing, p2 up-pointing). ENTER starts, Esc back.
4. Game screen 1P: board, HUD at (790,610) level, (790,710) speed label (LOW/MED/HI), (790,810) remaining germs; text drawn 32 px pixel font, dark text on light-lavender box.
5. Pause: NOT IMPLEMENTED (Space prints board state). `pause.wav` is loaded but never played. [FIX] implement pause (freeze timers, play pause cue).
6. Game over: see 6.3 (not displayed due to bug). No high score/name entry.
7. Music modes (FEVER / CHILL / OFF): ONLY choose which looping-intended track plays during the game: `fever.wav` (141 s) or `chill.mp3` (~4.7 MB mp3), or none. They do not change gravity, scoring or rules. [BUG] track is played once with no loop (`Sound.play()` without -1) so it ends silently after its length. Music stops via `mixer.stop()` on exit. The unused `*_clear` stingers suggest a fever/chill win jingle that was never wired.
8. Launch: the hub (`game_hub.py`) runs `[sys.executable, "drmario.py"]` as a subprocess with cwd = the game's folder (assets are loaded with relative paths) and waits for exit; closing the game returns to the hub. The game opens a SCALED fullscreen 1024x960 window. The hub also loads the game's pixel font for its own UI. Nothing else is shared.

---

## 9. Asset inventory (replace all with original art/audio)

---

### 9.1 Sound cues (assets/sounds/*; all 44.1 kHz stereo)

| File                                                                                                                                                                                                                                | Length        | Trigger in source                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| menu.wav                                                                                                                                                                                                                            | 48.9 s        | Loops on title screen and both options screens (play(-1)); stopped on entering a game       |
| hover_beep.wav                                                                                                                                                                                                                      | 1.1 s         | Hover entering a title-screen button (once per entry); also any mouse-up on options screens |
| move.wav                                                                                                                                                                                                                            | 0.04 s        | Capsule shifts left/right/down by key, AND every gravity-step fall of the live capsule      |
| rotate.wav                                                                                                                                                                                                                          | 1.2 s         | Successful capsule rotation (including kicked rotations)                                    |
| block_place.wav                                                                                                                                                                                                                     | 1.1 s         | Capsule locks into the board                                                                |
| block_drop.wav                                                                                                                                                                                                                      | 1.1 s         | Each STEP in which floating pieces fall one row                                             |
| clear.wav                                                                                                                                                                                                                           | 1.5 s         | Once per cleared capsule-half cell (NOT for germs or lone halves)                           |
| fever.wav                                                                                                                                                                                                                           | 141 s         | In-game music, FEVER mode (played once, no loop)                                            |
| chill.mp3                                                                                                                                                                                                                           | ~4.7 MB       | In-game music, CHILL mode (played once, no loop)                                            |
| pause.wav                                                                                                                                                                                                                           | 1.3 s         | Loaded, never played (intended pause cue)                                                   |
| clear_virus.wav                                                                                                                                                                                                                     | 1.5 s         | Unused (intended germ-cleared cue)                                                          |
| p1_combo.wav / p2_combo.wav                                                                                                                                                                                                         | 1.7 s / 2.1 s | Unused, commented "not implemented yet" (combo cue per player)                              |
| top_out.wav                                                                                                                                                                                                                         | 2.1 s         | Unused, commented out (top-out cue)                                                         |
| game_over.wav                                                                                                                                                                                                                       | 24 s          | Unused (game-over jingle)                                                                   |
| vs_win.wav                                                                                                                                                                                                                          | 119 s         | Unused (versus-win music)                                                                   |
| fever_clear.wav / chill_clear.wav                                                                                                                                                                                                   | 23 s / 22.6 s | Unused (stage-clear stingers per music mode)                                                |
| trill.wav                                                                                                                                                                                                                           | 1.4 s         | Unused                                                                                      |
| Needed for new game: menu loop, hover/click, move tick (very short), rotate, lock, fall, clear, germ-clear, combo/garbage-send, top-out, round win, match win, game over, level clear, pause, two music loops. Fix loops for music. |

### 9.2 Sprites (assets/sprites/*.png unless noted)

| File                                     | Size    | Depicts / use                                                                                                                                                                                                                            |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pill_AB.png (11,12,13,21,22,23,31,32,33) | 64x32   | Horizontal two-colour capsule, A = left half colour, B = right half colour (1 red, 2 yellow, 3 blue); drawn for the live and landed capsule, rotated 90 deg per rotation by the engine. Pill id string = main colour then second colour. |
| block_1/2/3.png                          | 32x32   | Single capsule half (rounded blob) in colour 1/2/3; used for lone halves after a partner is cleared                                                                                                                                      |
| virus_1a/2a/3a.png                       | 28x28   | Germ creature, one per colour (red round, yellow horned, blue cat-eared); static idle frame, drawn at the cell's top-left (4 px short of cell size)                                                                                      |
| virus_1b/2b/3b.png                       | 28x28   | Second animation frame per germ; UNUSED                                                                                                                                                                                                  |
| clear_1/2/3.png                          | 32x32   | Hollow outlined "pop" burst in each colour; UNUSED (intended clear animation)                                                                                                                                                            |
| crown.png                                | 54x54   | Round-win marker (small crown)                                                                                                                                                                                                           |
| game_over.png                            | 242x209 | Framed "GAME OVER" panel; blitted at (0,0) (never visible, see 6.3)                                                                                                                                                                      |
| level_selector_p1.png / _p2.png          | 38x31   | Small triangle markers (p1 pointing down, p2 up) over the level bars                                                                                                                                                                     |
| speed_selector_p1.png / _p2.png          | 106x29  | Wide triangle markers under/over speed and music buttons (p1 down, p2 up); p1 version reused for the music selector                                                                                                                      |
| title_screen_selector.png                | 41x36   | Heart-shaped cursor next to title menu entries                                                                                                                                                                                           |
| the_doctor.png                           | 32x32   | Small character portrait, used only as the window icon                                                                                                                                                                                   |

### 9.3 Screens (assets/screens/*.png, each 1024x960 full-bleed backgrounds)

title_screen (logo + 1P/2P entries), p1_menu (level bar, speed row, music row), p2_menu (two level bars, two speed rows, music row), p1_game_board (bottle frame with HUD labels; board at 385,320), p2_game_board (two bottles at 128,320 and 640,320, crown area between). Original UI art must be redrawn.

### 9.4 Font

One 8-bit pixel TTF (assets/fonts/), 32 px, white-on-black in menus and dark-on-lavender in HUD. Use an openly licensed pixel font instead.

---

## 10. Timing constants

---

| Item                                                                                                                                         | Value                                | Notes                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Frame rate                                                                                                                                   | 60 fps (`clock.tick(60)`)            | Logic is partly frame-driven (input, snapshots) and partly timer-driven (STEP)   |
| Gravity/step interval                                                                                                                        | LOW 1000, MED 500, HI 250 ms         | One action per STEP: fall, clear, cascade row, lock                              |
| Clear delay                                                                                                                                  | up to 1 STEP after the matching lock | Not animated                                                                     |
| Cascade fall                                                                                                                                 | 1 row per STEP                       |                                                                                  |
| Lock delay                                                                                                                                   | 0..1 STEP (free-running timer)       | See 2.6                                                                          |
| Win / game-over / round-end pause                                                                                                            | 3000 ms blocking wait each           | `pygame.time.wait`; freezes the whole process, so STEP events queue up during it |
| Pill spawn                                                                                                                                   | next frame after lock                |                                                                                  |
| Rotation/move animation                                                                                                                      | none, instant                        |                                                                                  |
| Sprite animations                                                                                                                            | none implemented                     | germ 'b' frames and clear_* unused                                               |
| Key repeat                                                                                                                                   | none                                 |                                                                                  |
| Hover beep                                                                                                                                   | once per hover entry                 |                                                                                  |
| Timers: pygame.time.set_timer never cancelled when leaving a game screen, so STEP events continue to be posted on menus (harmless, ignored). |

---

## 11. Reference tick algorithm for a deterministic TypeScript port (corrected behaviour)

---

Fixed-step simulation, dt = 1000/60 ms; accumulate `stepTimer += dt`; when `stepTimer >= SPEED[speed]` fire STEP (carry remainder). Per board, per frame:

1. If top-out cells (0,3) or (0,4) occupied => lose (round/game). If germs==0 => win.
2. Spawn capsule at (0,3)/(0,4) if none (draw 2 colours from the seeded PRNG).
3. Apply queued inputs (left, right, soft drop, rotate) with immediate re-validation after each (sect. 2.2-2.3 [FIX] rule). Inputs ignored while cascade falls are in progress (optional).
4. Compute matches (sect. 4.2 [FIX]) and fall list (sect. 5 [FIX]) once.
5. On STEP: if matches => clear (sect. 4.3); else if fall list => fall 1 row; else if capsule supported => lock; else capsule down 1.
   Notes for deterministic replays: record the seed and input events with frame numbers; do not use wall-clock timers inside the simulation.

---

## 12. Bug / oddity checklist (do not replicate)

---

1. 1P LOW speed button sets MED (views.py L149).
2. Match scan carries run state across rows/columns: bottom-row / last-column runs never clear, line-start runs can be missed (sect. 4.2).
3. Vertical landed capsules never fall (sect. 5).
4. Rotation kick has no free-space/edge check; can write col -1 (sect. 2.3).
5. Versus: clears computed before lock is applied and consumed only on next lock (sect. 7.5).
6. Versus crowns duplicated/overlapping (sect. 7.4).
7. Game-over / win-round panels never visible (draw not flipped before 3 s wait); no win banner.
8. No level progression after a win; returns to the menu.
9. Music not looped; chill/fever are only audio choices.
10. Clear sfx only for capsule halves, never germs; unused sound/sprite assets (sect. 9).
11. Germ placement can pre-create matches; no no-three-in-a-row rule; no colour balance.
12. Spawn overlap not tested; only (0,3) checked in single-player.
13. QUIT handling calls pygame.quit() then keeps looping on menus; ignored in game.
14. Blocked flags are stale within a frame; input after lock in same frame touches the landed capsule object.
15. `casting/grid.py` runs code (builds a grid, prints it) at import time; `Grid.reset_board` lacks `self`-style naming; images are re-loaded from disk on every spawn. Implementation noise only.
16. Rotation at row 0 impossible (cell above ceiling), so a fresh capsule cannot rotate until it has fallen one row.
17. Space "pause" only prints state; pause.wav unused.
