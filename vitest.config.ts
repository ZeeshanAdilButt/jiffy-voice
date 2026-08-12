import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Quiets pino-http's per-request log lines during test runs. This only
    // silences the default logger's own env-driven level; real behavior is
    // unaffected.
    env: {
      LOG_LEVEL: 'silent',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
})
