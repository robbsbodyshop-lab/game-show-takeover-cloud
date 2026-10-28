# Design system: 16-bit game show with a PS1 menu layer

The whole app looks like a SNES / Mega Drive game-show cartridge that boots on a PlayStation:
pixel type, flat panels with ink outlines and two-tone bevels, hard offset shadows, chasing
marquee bulbs, square corners and CRT scanlines, plus a 2-second boot screen, memory-card menus,
ordered dither, an optional CRT curve and a flat-shaded polygon look. Everything lives in
`src/design/`; tokens are CSS custom properties in `tokens.css`. This page is the reference for
keeping new screens on model. Run the app and open `/design` (dev only) to see every primitive.

## The rules

1. **Flat fills, no gradients.** Depth comes from a two-tone bevel (light top-left, dark
   bottom-right) and a hard offset shadow in ink. The only "gradient" is the dither helper, which
   is a tiny SVG tile of pixels (`dither.module.css`), never a CSS gradient. A test enforces this.
2. **Ink outlines everywhere.** 3 px (controls, badges, wells) or 4 px (panels, tiles, marquee)
   `--c-ink` borders. Team colours get an ink outline too so any colour reads on the night blue.
3. **Square corners.** `global.css` zeroes `border-radius` on everything. The single exception is
   the CRT overlay, which is not interactive and not a surface.
4. **Pixel type.** Press Start 2P for headlines, Pixelify Sans for everything else, Silkscreen
   for numbers. Digits inside Pixelify Sans are drawn by Silkscreen automatically (`fonts.css`
   re-points U+0030-0039), because Pixelify's `2` is a closed loop that reads as `8` from the back
   of a room. No letter-spacing tricks, no soft shadows on text; text shadows are hard 3-4 px ink.
5. **One picture.** Stage screens are laid out once at 1920x1080 and `Stage` scales that frame to
   the window, letterboxed. Phone screens are responsive and use the same tokens.
6. **Stepped motion.** Every animation uses `steps()`, never easing, and every animation is
   switched off by one `prefers-reduced-motion` rule in `global.css`.
7. **Tokens only.** Use `var(--c-*)`, `var(--space-*)`, `var(--bw-*)`; no raw hex in component
   CSS. The few SVG data URIs (floor, scanlines, bulbs, dither) cannot read custom properties and
   repeat hex values; each carries a comment saying so.
8. **No emoji** in the UI.

### The PS1 layer

- **Boot**: `BootScreen` runs ink, then an ordered-dither spectrum sweep, then the wordmark, in
  2 seconds (`--motion-boot`). It calls `onDone` once; a key press or tap skips it; under reduced
  motion it renders nothing and calls `onDone` immediately.
- **Memory-card menus**: `MemoryCardMenu` is a grid of chunky tiles (icon slot, title, subtitle)
  with one cursor. Hub, settings and the puzzle game's title/level/speed screens use it. Arrows,
  Home and End move the cursor (no wrap, disabled tiles skipped); Enter, Space or a click selects.
- **Dither**: `Dither` / `dither.module.css` give a panel texture, a 50% checker and an ink fade
  in 17 ordered-dither bands, all drawn with `image-rendering: pixelated`.
- **CRT curve**: `html[data-crt='on']` adds stepped ink bands that darken the rim and round the
  corners (host toggle, off by default). Scanlines (`body::before`, 3 px period) are always on.
- **Flat-shaded polygons**: the wheel hub, Plinko pegs and the puzzle frame are drawn in 2D with
  two or three flat tones per face (light, base, shade) and an ink outline, no smoothing.

## Palette (`--c-*`, names are roles)

| Token     | Hex       | Role                                                          |
| --------- | --------- | ------------------------------------------------------------- |
| `gold`    | `#FFD23F` | Titles, revealed Feud slots, secondary buttons, SPIN, trim    |
| `mustard` | `#FFF07A` | Highlight text, selected-tile bevel                           |
| `bulb`    | `#FFFFB0` | Marquee bulbs, focus rings, "current" glow                    |
| `orange`  | `#FF7A1F` | Primary buttons, Team 1 badge, category banner                |
| `rust`    | `#E23B4A` | Danger buttons, strikes, red wedge                            |
| `avocado` | `#3DC24F` | Confirm buttons, green wedge                                  |
| `olive`   | `#9BEA5C` | Success text                                                  |
| `teal`    | `#2F6FE8` | Board blue: hidden Feud slots, puzzle blanks, utility buttons |
| `aqua`    | `#5FE0FF` | Info text, cyan wedge                                         |
| `cream`   | `#FFF6DC` | Body text, revealed tiles, inputs                             |
| `mist`    | `#B7BDFF` | Muted text and labels                                         |
| `deep`    | `#4B39B8` | Bevel highlight, quiet buttons, menu cursor                   |
| `lagoon`  | `#2B1F72` | Panels (sidebar, boards, drawers)                             |
| `night`   | `#12093A` | Stage backdrop, insets                                        |
| `ink`     | `#0B0620` | Outlines, shadows, text on bright fills                       |
| `walnut`  | `#8A5A2B` | Pixel wood: the doors                                         |
| `plum`    | `#A845D8` | Host-only controls, BUY, double-points badge                  |
| `mauve`   | `#EBA6FF` | Host-only text                                                |
| `coral`   | `#FF7C7C` | Errors and warnings                                           |
| `shade`   | `#1A0F52` | Derived: dark half of every bevel, dark checkerboard square   |

Team colours default to 16-bit primaries (red, blue, green, yellow, purple, cyan, orange, pink)
and are editable per event.

### Contrast (WCAG 2.x, enforced in `tokens.test.ts`)

| Pair                                             | Ratio              | Bar                 |
| ------------------------------------------------ | ------------------ | ------------------- |
| cream / lagoon, cream / night                    | 12.6, 17.3         | 4.5 body text       |
| gold / lagoon, mustard / lagoon                  | 9.4, 11.7          | 4.5                 |
| mist / lagoon, mist / night, mist / deep         | 7.6, 10.4, 4.6     | 4.5                 |
| olive, aqua, mauve, coral on lagoon              | 9.3, 8.8, 7.4, 5.5 | 4.5                 |
| ink on orange, gold, avocado, aqua, cream, mauve | 7.6 to 18.4        | 4.5 button text     |
| ink on rust                                      | 4.7                | 4.5                 |
| ink on teal, ink on plum                         | 4.3, 4.3           | 3.0 large bold only |
| cream on deep (quiet button)                     | 7.6                | 4.5                 |
| bulb (focus ring) on lagoon and night            | 13.1, 17.9         | 3.0 non-text        |

Cream on orange (2.4), avocado (2.2) and gold (1.3) fails, so bright fills carry ink text. Teal
and plum buttons are 4.3:1 with ink, which only meets the large-text bar, so those variants must
stay bold and 18 px or larger (the default); do not shrink them below the `md` size on stage.

## Type

| Token / face     | Use                                                     |
| ---------------- | ------------------------------------------------------- |
| `--font-display` | Press Start 2P: title cards, board letters, headers     |
| `--font-groovy`  | Pixelify Sans: buttons, labels, badges, wedge text      |
| `--font-body`    | Pixelify Sans: body copy, inputs                        |
| `--font-numeral` | Silkscreen: number-only displays (scores, timers, cash) |

Sizes: `--fs-audience` 18 px (minimum for anything the room reads), `--fs-small` 16 px (labels and
badges; host surfaces and phones), `--fs-title` 32 px, `--fs-hero` 56 px. All three faces are
bundled from `@fontsource` (SIL OFL); nothing loads from a CDN. Use `NumberDisplay` when a whole
element is a number; it pairs Silkscreen with `tabular-nums` so clocks and scores never jitter.

## Surfaces

- **Panel**: dithered `lagoon`, 4 px ink outline, two-tone bevel, 6 px hard shadow. The main
  container for boards, drawers, dialogs and menus.
- **Marquee**: ink band with a gold frame and two interleaved rings of square bulbs that chase
  in opposition with `steps(1)`. Wraps every screen title (`as="h1"` when it is the page title).
- **Inset**: `night` well with an ink inner shadow, for settings groups, lists and read-outs.
- **Stripes**: orange / gold / green / blue bar under titles and at the top of menus.
- **Dither**: decorative overlays; put them inside a positioned parent.
- **Dialog**: modal `Panel` in a portal over an ink-tinted backdrop.

## Controls

- **Button** variants: `primary` (orange), `secondary` (gold), `tertiary` (teal), `danger`
  (rust), `confirm` (avocado), `host` (plum), `quiet` (deep, cream text). Sizes `sm`, `md`, `lg`.
  3 px ink border, bevel, 4 px hard shadow; presses down onto its shadow. `type` defaults to
  `button`; pass `type="submit"` for forms. Disabled is 50% opacity.
- **MemoryCardMenu**: see the PS1 layer. Give it an accessible `label`; `value` marks the
  committed choice, the cursor is separate.
- **Badge**: tag with ink outline (buzzer numbers, team slots, door plates). **Label**: small
  uppercase mist text; pass `htmlFor` to get a real `<label>`.

## The stage

`Stage` renders a fixed 1920x1080 frame, scales it with a CSS transform to
`min(innerWidth / 1920, innerHeight / 1080)` (`computeStageScale`), centres it with letterboxing
and exposes `--stage-scale` on its wrapper. It listens to `resize` and a `ResizeObserver`. The
page never scrolls, so every stage screen has to fit the frame with eight teams; long host-only
content scrolls inside its own drawer.

## Motifs

- **Backdrop**: `body` is `night` with a two-row checkerboard floor (48 px squares) along the
  bottom edge; screens paint their own scenery above it.
- **Scanlines**: fixed, pointer-transparent 3 px overlay above everything.
- **Bulbs**: marquee lights frame every screen title and the winner card.
- **Stripes**: the four-colour bar under titles and at the top of the hub menu.
- **Screen wipes**: stepped horizontal clip wipes; never fades or slides with easing.

## Phone layout

Phones use the same tokens at a responsive layout. Single column, 16 px side gutters
(`--space-4`), no horizontal scroll. Every tap target is at least 44 px (`--tap`): `Button` sizes
`md` and `lg` already are, and `sm` is raised to 44 px on `pointer: coarse` devices. Keep at least
8 px between adjacent targets. Prefer `MemoryCardMenu` with `columns={1}` or `2` for pickers.
Stage-only affordances (hover, hotkey hints) do not appear on phones.

## Accessibility

- Audience text is 18 px or larger on the 1920x1080 frame; badges and labels never below 16 px.
- Focus is always visible: a 3 px `bulb` outline with a 2 px offset on `:focus-visible`.
- Every animation is disabled under `prefers-reduced-motion`; `BootScreen` is skipped entirely.
- Never convey state with colour alone: selected tiles also get a `>` marker and
  `aria-selected`; disabled controls are also dimmed and not focusable.
- Dialogs trap focus, close on Escape and return focus to the control that opened them.
- Contrast is checked in tests; see the table above before adding a colour pair.

## Adding a screen

1. Wrap it in `Panel` (and a `Marquee` + `Stripes` for the title). Stage screens go inside `Stage`.
2. Group controls in `Inset` blocks with a `Label` heading.
3. Use `Button` variants rather than raw colours, and tokens only; never a gradient.
4. Team-coloured elements take the team colour as an inline border/background and keep an ink
   outline.
5. Fit the 1920x1080 frame with eight teams; nothing on the stage may scroll.
6. Audience text 18 px or more; phone targets 44 px or more; no emoji.
7. Use `steps()` for any motion and rely on the global reduced-motion rule; if you add JS timers
   or `requestAnimationFrame` motion, gate them with `useReducedMotion()`.
8. Menus are `MemoryCardMenu`; confirmations are `Dialog`; first load of the stage shows
   `BootScreen` once.
9. Add the new pattern to `DesignGallery` (`/design`) if it is reusable, and a test beside it.
