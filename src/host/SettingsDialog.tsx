import { useId, useState, type ReactNode } from 'react';
import { Button, Dialog, Inset, Label } from '@/design';
import { logger } from '@/lib/logger';
import {
  ANSWER_SOURCES,
  detectVoiceSupport,
  hostViewLink,
  type AnswerSource,
  type AppSettings,
} from './appSettings';
import { useTwoTap } from './useTwoTap';
import styles from './SettingsDialog.module.css';

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  /** Shown in the host view link; the link row is hidden without it. */
  roomCode?: string;
  /** Two-tap "Reset scores & chips"; the row is hidden without it. */
  onResetScores?: () => void;
  onSignOut?: () => void;
  /** Overrides detection of `SpeechRecognition` (tests). */
  voiceAvailable?: boolean;
  /** Extra settings (game options) rendered under the app settings. */
  children?: ReactNode;
}

const ANSWER_LABELS: Record<AnswerSource, string> = {
  host: 'Host types or speaks',
  phones: 'Phones',
  both: 'Host and phones',
};

/** App settings form used by the stage and the host view (HOST_FEATURE_INVENTORY §2.5). */
export const SettingsDialog = ({
  open,
  onClose,
  settings,
  onChange,
  roomCode,
  onResetScores,
  onSignOut,
  voiceAvailable,
  children,
}: SettingsDialogProps) => {
  const ids = { volume: useId(), answers: useId() };
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const reset = useTwoTap(() => {
    onResetScores?.();
  });
  const canUseVoice = voiceAvailable ?? detectVoiceSupport();

  const copyLink = () => {
    if (roomCode === undefined) return;
    const link = hostViewLink(roomCode);
    navigator.clipboard.writeText(link).then(
      () => {
        setCopied('copied');
      },
      (error: unknown) => {
        logger.warn('[settings] clipboard write failed', error);
        setCopied('failed');
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <div className={styles.form}>
        <div className={styles.group}>
          <Label>Sound</Label>
          <label className={styles.field}>
            <input
              type="checkbox"
              checked={settings.musicOn}
              onChange={(e) => {
                onChange({ musicOn: e.target.checked });
              }}
            />
            Music
          </label>
          <div className={styles.field}>
            <Label htmlFor={ids.volume}>Volume</Label>
            <input
              id={ids.volume}
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.volume * 100)}
              onChange={(e) => {
                onChange({ volume: Number(e.target.value) / 100 });
              }}
            />
            <span aria-hidden="true">{Math.round(settings.volume * 100)}</span>
          </div>
        </div>

        <div className={styles.group}>
          <Label>Display</Label>
          <label className={styles.field}>
            <input
              type="checkbox"
              checked={settings.showMode}
              onChange={(e) => {
                onChange({ showMode: e.target.checked });
              }}
            />
            Show mode (hide host buttons on the stage)
          </label>
          <label className={styles.field}>
            <input
              type="checkbox"
              checked={settings.crtCurve}
              onChange={(e) => {
                onChange({ crtCurve: e.target.checked });
              }}
            />
            CRT curve
          </label>
        </div>

        <div className={styles.group}>
          <Label>Answers</Label>
          <label className={styles.field}>
            <input
              type="checkbox"
              checked={settings.voice === 'on' && canUseVoice}
              disabled={!canUseVoice}
              onChange={(e) => {
                onChange({ voice: e.target.checked ? 'on' : 'off' });
              }}
            />
            Voice answers
          </label>
          {canUseVoice ? null : <p className={styles.note}>Not available in this browser</p>}
          <div className={styles.field}>
            <Label htmlFor={ids.answers}>Answers from</Label>
            <select
              id={ids.answers}
              className={styles.select}
              value={settings.answersFrom}
              onChange={(e) => {
                const value = ANSWER_SOURCES.find((s) => s === e.target.value);
                if (value !== undefined) onChange({ answersFrom: value });
              }}
            >
              {ANSWER_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {ANSWER_LABELS[source]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.group}>
          <Label>Diagnostics</Label>
          <label className={styles.field}>
            <input
              type="checkbox"
              checked={settings.verboseLogging}
              onChange={(e) => {
                onChange({ verboseLogging: e.target.checked });
              }}
            />
            Verbose logging
          </label>
        </div>

        {children}

        {roomCode === undefined ? null : (
          <div className={styles.group}>
            <Label>Host view</Label>
            <div className={styles.row}>
              <Button variant="host" onClick={copyLink}>
                Open host view link
              </Button>
            </div>
            <Inset>
              <span className={styles.url}>{hostViewLink(roomCode)}</span>
            </Inset>
            <p className={styles.note} role="status">
              {copied === 'copied' ? 'Link copied. Open it on the laptop or tablet.' : null}
              {copied === 'failed' ? 'Could not copy; select the link above instead.' : null}
            </p>
          </div>
        )}

        <div className={styles.row}>
          {onResetScores === undefined ? null : (
            <Button variant="danger" onClick={reset.press}>
              {reset.armed ? 'Tap again: zero all scores and chips' : 'Reset scores & chips'}
            </Button>
          )}
          {onSignOut === undefined ? null : (
            <Button variant="tertiary" onClick={onSignOut}>
              Sign out
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
