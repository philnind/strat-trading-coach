import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: __dirname,
    include: [
      'test/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      'src/**/__tests__/**/*.test.?(c|m)[jt]s?(x)',
    ],
    testTimeout: 1000 * 29,
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.{test,spec}.ts',
        '**/dist/',
        '**/dist-electron/',
        '**/.vite/',
        '**/electron/',
      ],
    },
  },
})
