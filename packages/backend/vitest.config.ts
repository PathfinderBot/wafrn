import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: ['node_modules/**', 'build/**'],
    globals: false,
    testTimeout: 30_000
  }
})
