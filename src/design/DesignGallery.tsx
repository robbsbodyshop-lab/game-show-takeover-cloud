import { useEffect, useState } from 'react';
import {
  Badge,
  BootScreen,
  Button,
  Dialog,
  Dither,
  Inset,
  Label,
  Marquee,
  MemoryCardMenu,
  NumberDisplay,
  Panel,
  Stripes,
  computeStageScale,
  type BadgeTone,
  type ButtonSize,
  type ButtonVariant,
  type MemoryCardItem,
} from './index';
import './global.css';
import styles from './DesignGallery.module.css';

const SWATCHES: readonly (readonly [string, string])[] = [
  ['gold', 'Titles, revealed slots, secondary buttons'],
  ['mustard', 'Highlight text'],
  ['bulb', 'Marquee bulbs, focus rings'],
  ['orange', 'Primary buttons, Team 1'],
  ['rust', 'Danger, strikes'],
  ['avocado', 'Confirm, green wedge'],
  ['olive', 'Success text'],
  ['teal', 'Board blue, utility buttons'],
  ['aqua', 'Info text'],
  ['cream', 'Body text, tiles'],
  ['mist', 'Muted text, labels'],
  ['deep', 'Bevel highlight, quiet buttons'],
  ['lagoon', 'Panels'],
  ['night', 'Backdrop'],
  ['ink', 'Outlines, shadows'],
  ['walnut', 'Pixel wood'],
  ['plum', 'Host-only controls'],
  ['mauve', 'Host-only text'],
  ['coral', 'Errors, warnings'],
];

const VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'tertiary',
  'danger',
  'confirm',
  'host',
  'quiet',
];
const SIZES: readonly ButtonSize[] = ['sm', 'md', 'lg'];
const TONES: readonly BadgeTone[] = ['cream', 'gold', 'orange', 'confirm', 'info', 'host'];

const MENU: readonly MemoryCardItem[] = [
  { id: 'feud', title: 'Feud', subtitle: 'Survey says', icon: 'F' },
  { id: 'wheel', title: 'Wheel', subtitle: 'Spin and solve', icon: 'W' },
  { id: 'speed', title: 'Speed', subtitle: 'Beat the clock', icon: 'S' },
  { id: 'plinko', title: 'Plinko', subtitle: 'Drop a chip', icon: 'P' },
  { id: 'puzzle', title: 'Puzzle', subtitle: 'Locked for now', icon: 'Z', disabled: true },
  { id: 'settings', title: 'Settings', subtitle: 'Host only', icon: 'H' },
];

/** Dev-only `/design` route: renders every primitive so a change can be checked by eye. */
export const DesignGallery = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [booting, setBooting] = useState(false);
  const [crt, setCrt] = useState(false);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [scale, setScale] = useState(() => computeStageScale(window.innerWidth, window.innerHeight));

  useEffect(() => {
    document.documentElement.dataset.crt = crt ? 'on' : 'off';
    return () => {
      delete document.documentElement.dataset.crt;
    };
  }, [crt]);

  useEffect(() => {
    const update = () => {
      setScale(computeStageScale(window.innerWidth, window.innerHeight));
    };
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <main className={styles.page}>
      <Marquee as="h1">Design gallery</Marquee>
      <Stripes />

      <Panel className={styles.section}>
        <h2 className={styles.heading}>Palette</h2>
        <div className={styles.swatches}>
          {SWATCHES.map(([name, role]) => (
            <div key={name} className={styles.swatch}>
              <span className={styles.chip} style={{ backgroundColor: `var(--c-${name})` }} />
              <Label>{name}</Label>
              <span className={styles.role}>{role}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className={styles.section}>
        <h2 className={styles.heading}>Type</h2>
        <p className={styles.display}>Press Start 2P display</p>
        <p>Pixelify Sans body copy with digits 0123456789 drawn by Silkscreen.</p>
        <NumberDisplay value={1250} prefix="$" size="xl" />
        <NumberDisplay value={7} padTo={3} />
      </Panel>

      <Panel className={styles.section}>
        <h2 className={styles.heading}>Buttons</h2>
        {SIZES.map((size) => (
          <div key={size} className={styles.row}>
            {VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} size={size}>
                {variant}
              </Button>
            ))}
            <Button variant="primary" size={size} disabled>
              disabled
            </Button>
          </div>
        ))}
      </Panel>

      <Panel className={styles.section}>
        <h2 className={styles.heading}>Badges, labels, insets</h2>
        <div className={styles.row}>
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
        <Inset>
          <Label>Inset well</Label>
          <p>Darker well inside a panel for settings groups and lists.</p>
        </Inset>
      </Panel>

      <Panel className={styles.section}>
        <h2 className={styles.heading}>Memory card menu</h2>
        <MemoryCardMenu label="Game menu" items={MENU} value={picked} onSelect={setPicked} />
        <Label>Chosen: {picked ?? 'nothing yet'}</Label>
      </Panel>

      <Panel className={styles.section}>
        <h2 className={styles.heading}>Dither</h2>
        <div className={styles.dithers}>
          {(['texture', 'checker', 'fade'] as const).map((variant) => (
            <div key={variant} className={styles.dither}>
              <Dither variant={variant} />
              <Label>{variant}</Label>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className={styles.section}>
        <h2 className={styles.heading}>Layers and overlays</h2>
        <div className={styles.row}>
          <Button
            variant="tertiary"
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            Open dialog
          </Button>
          <Button
            variant="host"
            onClick={() => {
              setBooting(true);
            }}
          >
            Replay boot
          </Button>
          <Button
            variant="quiet"
            aria-pressed={crt}
            onClick={() => {
              setCrt((on) => !on);
            }}
          >
            CRT curve: {crt ? 'on' : 'off'}
          </Button>
        </div>
        <Label>Stage scale at this window: {scale.toFixed(3)}</Label>
      </Panel>

      <Dialog
        open={dialogOpen}
        title="Are you sure"
        onClose={() => {
          setDialogOpen(false);
        }}
      >
        <p>Focus is trapped here. Tab cycles; Escape closes.</p>
        <div className={styles.row}>
          <Button
            variant="danger"
            onClick={() => {
              setDialogOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="confirm"
            onClick={() => {
              setDialogOpen(false);
            }}
          >
            Confirm
          </Button>
        </div>
      </Dialog>

      {booting ? (
        <BootScreen
          onDone={() => {
            setBooting(false);
          }}
        />
      ) : null}
    </main>
  );
};
