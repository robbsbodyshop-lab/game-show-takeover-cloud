import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the stage route by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Game Show Takeover' })).toBeInTheDocument();
    expect(screen.getByTestId('route')).toHaveTextContent('stage');
  });
});
