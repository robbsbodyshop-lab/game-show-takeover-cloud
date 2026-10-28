import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FEUD_SETTINGS } from '@/games/feud/settings';
import { DEFAULT_WHEEL_SETTINGS } from '@/games/wheel/settings';
import { DEFAULT_APP_SETTINGS, type AppSettings } from './appSettings';
import { SettingsDialog, type SettingsDialogProps } from './SettingsDialog';

const renderDialog = (over: Partial<SettingsDialogProps> = {}, settings: Partial<AppSettings> = {}) => {
  const onChange = vi.fn();
  const props: SettingsDialogProps = {
    open: true,
    onClose: () => undefined,
    settings: { ...DEFAULT_APP_SETTINGS, ...settings },
    onChange,
    voiceAvailable: true,
    ...over,
  };
  render(<SettingsDialog {...props} />);
  return { onChange };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsDialog', () => {
  it('shows the defaults', () => {
    renderDialog();
    expect(screen.getByRole('checkbox', { name: 'Music' })).toBeChecked();
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('80');
    expect(screen.getByRole('checkbox', { name: /show mode/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'CRT curve' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Voice answers' })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Answers from' })).toHaveValue('host');
    expect(screen.getByRole('checkbox', { name: 'Verbose logging' })).not.toBeChecked();
  });

  it('reports each change as a partial patch', async () => {
    const user = userEvent.setup();
    const { onChange } = renderDialog();
    await user.click(screen.getByRole('checkbox', { name: 'Music' }));
    expect(onChange).toHaveBeenLastCalledWith({ musicOn: false });
    await user.click(screen.getByRole('checkbox', { name: /show mode/i }));
    expect(onChange).toHaveBeenLastCalledWith({ showMode: true });
    await user.click(screen.getByRole('checkbox', { name: 'CRT curve' }));
    expect(onChange).toHaveBeenLastCalledWith({ crtCurve: true });
    await user.click(screen.getByRole('checkbox', { name: 'Voice answers' }));
    expect(onChange).toHaveBeenLastCalledWith({ voice: 'on' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Answers from' }), 'both');
    expect(onChange).toHaveBeenLastCalledWith({ answersFrom: 'both' });
    await user.click(screen.getByRole('checkbox', { name: 'Verbose logging' }));
    expect(onChange).toHaveBeenLastCalledWith({ verboseLogging: true });
  });

  it('reports the volume as 0..1', () => {
    const { onChange } = renderDialog();
    const slider = screen.getByRole('slider', { name: 'Volume' });
    // fireEvent-style change on a range input
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(slider, '35');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ volume: 0.35 });
  });

  it('disables voice and explains why when SpeechRecognition is missing', () => {
    renderDialog({ voiceAvailable: false }, { voice: 'on' });
    const box = screen.getByRole('checkbox', { name: 'Voice answers' });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(screen.getByText('Not available in this browser')).toBeInTheDocument();
  });

  it('detects SpeechRecognition on window when not overridden', () => {
    vi.stubGlobal('webkitSpeechRecognition', vi.fn());
    renderDialog({ voiceAvailable: undefined });
    expect(screen.getByRole('checkbox', { name: 'Voice answers' })).toBeEnabled();
    expect(screen.queryByText('Not available in this browser')).toBeNull();
  });

  it('resets scores only on the second tap', async () => {
    const user = userEvent.setup();
    const onResetScores = vi.fn();
    renderDialog({ onResetScores });
    await user.click(screen.getByRole('button', { name: 'Reset scores & chips' }));
    expect(onResetScores).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /tap again: zero all scores and chips/i }));
    expect(onResetScores).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Reset scores & chips' })).toBeInTheDocument();
  });

  it('hides the reset, link and sign-out rows when their handlers are missing', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: /reset scores/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /host view link/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('copies the host view link for the room', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderDialog({ roomCode: 'BKDX' });
    const expected = `${window.location.origin}/host?room=BKDX`;
    expect(screen.getByText(expected)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open host view link' }));
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
  });

  it('says so when the clipboard refuses', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    renderDialog({ roomCode: 'BKDX' });
    await user.click(screen.getByRole('button', { name: 'Open host view link' }));
    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument();
  });

  it('calls sign out, renders extra settings and closes', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onSignOut, onClose, children: <p>Game options slot</p> });
    expect(screen.getByText('Game options slot')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the Feud and Wheel next-game sections only when it is given the settings and a saver', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.queryByText('Family Feud (next game)')).toBeNull();
    cleanup();
    const onSaveGameSettings = vi.fn();
    renderDialog({
      gameSettings: { feud: DEFAULT_FEUD_SETTINGS, wheel: DEFAULT_WHEEL_SETTINGS },
      onSaveGameSettings,
    });
    expect(screen.getByText('Family Feud (next game)')).toBeInTheDocument();
    expect(screen.getByText('Wheel of Fortune (next game)')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Winning score'), '500');
    expect(onSaveGameSettings).toHaveBeenLastCalledWith('feud', {
      ...DEFAULT_FEUD_SETTINGS,
      targetScore: 500,
    });
  });
});
