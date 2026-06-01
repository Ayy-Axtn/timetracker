import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Three independent build targets. Main and preload build to CommonJS (no
// "type": "module" in package.json) — this keeps the sandboxed preload and the
// native better-sqlite3 module on the simplest, most robust path.
//
// externalizeDepsPlugin keeps everything in package.json "dependencies"
// (notably better-sqlite3, a native module) as a runtime require rather than
// trying to bundle it. Only main/preload need this; the renderer is bundled.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        // Two windows, two entries from one bundle: the Today's Log window and
        // the reusable popup window.
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          popup: resolve(__dirname, 'src/renderer/popup.html')
        }
      }
    },
    plugins: [react()]
  }
})
