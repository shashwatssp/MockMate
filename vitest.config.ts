import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Default to the node environment (no jsdom) so the pure-logic unit tests for
// the mappers + Gemini helper run with a minimal, fast stack. Component tests
// opt into jsdom via the `/** @vitest-environment jsdom */` doc comment.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    // setupFiles left empty for now — explicit imports keep tooling lean.
    coverage: {
      provider: 'v8',
      reporter: ['text'],
    },
  },
});
