# Game content

The surveys and puzzles the games play. Everything here is original and
written for this project: no real survey results and no puzzles copied from
the shows. Respondent counts are illustrative. Keep it family-friendly; it is
played at work events.

| File                    | Holds                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `family_feud.json`      | 115 main-game surveys (`surveys`) and 79 Fast Money questions (`fastMoney`)                                       |
| `wheel_of_fortune.json` | 331 puzzles (`puzzles`) for rounds, toss-ups, Triple Toss-Up sets, Prize Puzzles, tiebreakers and the Bonus Round |
| `feud.ts`, `wheel.ts`   | Types, pickers and validation for each file                                                                       |
| `shared.ts`, `index.ts` | Shared types, `pickRandom`, and `validateContent()` for both files                                                |

Both files start with `metadata` (`source`, `sourceUrl`, `lastValidated`).

## Nothing repeats within an event

The games report every id they put on screen, and the event session keeps
the list (`usedContentIds`) until **Start a new event** or **Reset scores &
chips**. The pickers always prefer content not on that list, and only reuse
something when a pool has run dry, so a long event never gets stuck. The
Family Feud console shows how many fresh surveys and Fast Money questions are
left ("Running low" under 10).

## Family Feud: `family_feud.json`

```json
{
  "id": "gst-001",
  "question": "Name something people do when they wake up.",
  "surveyed": "100 office workers",
  "difficulty": "easy",
  "answers": [
    {
      "answer": "CHECK THEIR PHONE",
      "points": 24,
      "aliases": ["phone", "check my phone", "scroll on my phone"]
    },
    { "answer": "HIT THE SNOOZE BUTTON", "points": 19, "aliases": ["snooze", "hit snooze"] }
  ]
}
```

- `id`: unique across both lists.
- `question`: what the host reads.
- `surveyed` (optional): who was asked, for the host's intro line ("We
  asked 100 office workers").
- `difficulty` (optional): `easy`, `medium` or `hard`. `source` (optional):
  where it came from.
- `answers`: highest points first.
  - `answer`: the board text, in capitals, 22 characters at most, no slash.
  - `points`: a whole number of respondents, at least 2. The points on one
    survey add up to 100 or less.
  - `aliases` (optional): other wordings the host would accept. They are
    never shown. The matcher already handles plurals, tenses and common
    synonyms, and sends near misses to the host, so list real alternatives
    ("snooze", "hit snooze") rather than spelling variants. An alias must not also stand for another answer on the
    same survey.

Main-game surveys have 4 to 8 answers; Fast Money questions have 5 to 12.

Which survey a round gets: round 1 prefers 6-8 answers, round 2 5-7, round 3
4-6, round 4 exactly 4, and Sudden Death any survey with a single clear #1
(no tie at the top). Keep plenty of 4-answer surveys; round 4 and many round 3
boards use them. Fast Money deals five unused questions for each game.

## Wheel of Fortune: `wheel_of_fortune.json`

```json
{
  "id": "wof-round-001",
  "category": "PHRASE",
  "phrase": "EVERY CLOUD HAS A SILVER LINING",
  "lines": ["EVERY CLOUD", "HAS A SILVER", "LINING"],
  "use": ["round"]
}
```

- `id`: unique. `phrase`: unique.
- `category`: one of the show's category names listed in `WHEEL_CATEGORIES`
  in `wheel.ts` (PHRASE, THING, PLACE, BEFORE & AFTER, SAME LETTER, ...).
- `phrase`: capitals A-Z, spaces and `' & ! ? . -` only. Numbers are spelled
  out; single spaces, no leading or trailing space.
- `lines` (needed when the phrase is longer than 14 characters): the board
  lines, top to bottom, which must spell the phrase. A line may end in a
  hyphen to break a hyphenated word (`A WELL-` / `DESERVED`). They must fit
  the 12/14/14/12 board: at most 14 characters per line, at most 13 in a 3- or
  4-line puzzle, and at most 12 on the top and bottom rows (one line uses row
  2, two lines rows 2-3, three lines rows 1-3, four lines all rows).
- `use`: where it can be played, one or more of:

| Use        | Played as                           | Extra rules                                                                                                  |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `round`    | Rounds 1-4 and the Speed-Up         | -                                                                                                            |
| `tossup`   | Opening toss-ups and Fortune Frenzy | 1-2 lines                                                                                                    |
| `triple`   | Triple Toss-Up                      | 1-2 lines; `set` and `theme`; no other use; exactly 3 per set, same category and theme, played in file order |
| `prize`    | Round 3, the Prize Puzzle           | `prize`: `{ "name": "A TRIP TO MAUI", "value": 9800 }`, value $7,000-$15,000                                 |
| `tiebreak` | The tiebreaker toss-up              | 1-2 lines                                                                                                    |
| `bonus`    | The Bonus Round                     | 1-2 lines, 2-4 words, at least 7 letters, a Bonus Round category (`WHEEL_BONUS_CATEGORIES`)                  |

- `sameLetter`: required for SAME LETTER puzzles; one consonant that starts
  every word. Calling it pays the $1,000 bonus.
- `notes` (optional): a note for editors.

Current counts: 138 round, 18 prize, 70 toss-up (10 in each of the seven
toss-up categories), 42 Triple Toss-Up (14 sets), 10 tiebreak and 63 bonus
puzzles.

Fortune Frenzy plays toss-ups from one category and tops up from that same
category. It opens in a random category that still has at least 10 toss-ups
not yet used this event (its first 6 plus 4 spares), or else the one with the
most, so keep every toss-up category at 10 or more: then any of them can open
a new event's Frenzy. The Bonus Round offers three categories, always
including THING or PHRASE when there is one.

A puzzle the host throws out is replaced from the same pool. In a main round
the replacement is the one the Wheel console shows under _Next puzzle_. A
Triple Toss-Up replacement keeps the set's category (a spare carrying the
set id first, then a toss-up or other puzzle in that category). A Bonus
replacement is another puzzle in the chosen category, else any Bonus puzzle,
and never one of the three on offer.

## Adding content

1. Add entries to the right list in the JSON file, following the rules above.
2. Run `npm test`. `test/feudContent.test.ts`, `test/wheelContent.test.ts` and
   `test/content.test.ts` run `validateContent()` and name the file, the id and
   the problem for anything wrong. The dev server also logs problems at
   startup.
3. Check a new survey on the board before the event: in Family Feud's Host
   Tools, _Browse question bank_, pick it and _Use for this round_.

No code changes are needed. The dev server picks up new entries on reload;
`HOST_GAME.bat` picks them up when it builds (so not with `-SkipBuild`).
