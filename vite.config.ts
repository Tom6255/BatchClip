import { defineConfig } from 'vite'
import path from 'node:path'
import electronSimpleImport from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

type ElectronSimpleFactory = (options: unknown) => unknown

const resolveElectronSimple = (): ElectronSimpleFactory => {
  if (typeof electronSimpleImport === 'function') {
    return electronSimpleImport as ElectronSimpleFactory
  }

  const firstDefault = (electronSimpleImport as { default?: unknown }).default
  if (typeof firstDefault === 'function') {
    return firstDefault as ElectronSimpleFactory
  }

  const secondDefault = (firstDefault as { default?: unknown } | undefined)?.default
  if (typeof secondDefault === 'function') {
    return secondDefault as ElectronSimpleFactory
  }

  throw new TypeError('Failed to resolve vite-plugin-electron/simple export')
}

const electronSimple = resolveElectronSimple()

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electronSimple({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: [
                'fluent-ffmpeg',
                'ffmpeg-static',
                'exiftool-vendored',
                'adm-zip',
                'uuid'
              ],
            },
          },
        },

      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},
    }),
  ],
})
