import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    root: __dirname,
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/renderer/src/test-setup.ts',
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
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
})
