import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src/renderer/src'),
        '@main': path.join(__dirname, 'src/main'),
        '@renderer': path.join(__dirname, 'src/renderer'),
        '@shared': path.join(__dirname, 'src/shared'),
        '@preload': path.join(__dirname, 'src/preload'),
      },
    },
    plugins: [
      react(),
      electron({
        main: {
          // Main process entry point
          entry: 'src/main/index.ts',
          onstart(args) {
            if (process.env.VSCODE_DEBUG) {
              // eslint-disable-next-line no-console
              console.log(/* For `.vscode/.debug.script.mjs` */'[startup] Electron App')
            } else {
              args.startup()
            }
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
            resolve: {
              alias: {
                '@main': path.join(__dirname, 'src/main'),
                '@shared': path.join(__dirname, 'src/shared'),
              },
            },
          },
        },
        preload: {
          // Two preload scripts: chat renderer and TradingView
          input: {
            index: 'src/preload/index.ts',
            tradingview: 'src/preload/tradingview.ts',
          },
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
                output: {
                  // Disable inlineDynamicImports for multiple inputs
                  inlineDynamicImports: false,
                  // Use entryFileNames to keep simple names
                  entryFileNames: '[name].js',
                },
              },
            },
            resolve: {
              alias: {
                '@shared': path.join(__dirname, 'src/shared'),
                '@preload': path.join(__dirname, 'src/preload'),
              },
            },
          },
        },
        // Ployfill the Electron and Node.js API for Renderer process.
        // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: {},
      }),
    ],
    server: process.env.VSCODE_DEBUG && (() => {
      const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
      return {
        host: url.hostname,
        port: +url.port,
      }
    })(),
    clearScreen: false,
  }
})
