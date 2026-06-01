import type { Api } from './index'

// Makes window.api typed and discoverable in the renderer.
declare global {
  interface Window {
    api: Api
  }
}

export {}
