import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// vitest.config.ts sets globals: false, so Testing Library's auto-cleanup does not run.
afterEach(() => {
  cleanup();
});
