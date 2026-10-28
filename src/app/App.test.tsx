import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('@/stage/StageApp', () => ({ StageApp: () => <p data-testid="route">stage</p> }));
vi.mock('@/host/HostView', () => ({ HostView: () => <p data-testid="route">host</p> }));
vi.mock('@/phone/PhoneApp', () => ({ PhoneApp: () => <p data-testid="route">play</p> }));

describe('App', () => {
  it('lazy-loads the entry point for the path', async () => {
    window.history.replaceState({}, '', '/play?room=DMKT');
    render(<App />);
    expect(await screen.findByTestId('route')).toHaveTextContent('play');
  });
});
