import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useBuzzHotkeys } from './useBuzzHotkeys';

const Harness = ({ onBuzz, enabled = true }: { onBuzz: (team: number) => void; enabled?: boolean }) => {
  useBuzzHotkeys(enabled, onBuzz);
  return (
    <div>
      <input aria-label="name" />
      <textarea aria-label="notes" />
      <button type="button">ok</button>
    </div>
  );
};

describe('useBuzzHotkeys', () => {
  it('buzzes for keys 1 to 8 only', async () => {
    const user = userEvent.setup();
    const onBuzz = vi.fn();
    render(<Harness onBuzz={onBuzz} />);
    await user.keyboard('18907');
    expect(onBuzz.mock.calls).toEqual([[1], [8], [7]]);
  });

  it('ignores text fields, held keys and modifier combinations', async () => {
    const user = userEvent.setup();
    const onBuzz = vi.fn();
    const { getByLabelText } = render(<Harness onBuzz={onBuzz} />);
    await user.click(getByLabelText('name'));
    await user.keyboard('3');
    await user.click(getByLabelText('notes'));
    await user.keyboard('4');
    expect(onBuzz).not.toHaveBeenCalled();
    getByLabelText('notes').blur();
    await user.keyboard('{Control>}5{/Control}');
    await user.keyboard('{Alt>}6{/Alt}');
    expect(onBuzz).not.toHaveBeenCalled();
    await user.keyboard('{2>3/}');
    expect(onBuzz).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', async () => {
    const user = userEvent.setup();
    const onBuzz = vi.fn();
    render(<Harness onBuzz={onBuzz} enabled={false} />);
    await user.keyboard('2');
    expect(onBuzz).not.toHaveBeenCalled();
  });
});
