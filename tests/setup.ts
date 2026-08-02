import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only auto-registers cleanup when Vitest globals are enabled.
// We keep globals off, so it is wired up explicitly here — without this, DOM
// from one test leaks into the next and queries start matching the wrong node.
afterEach(() => {
  cleanup();
});
