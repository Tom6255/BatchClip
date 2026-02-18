# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BatchClip is an Electron desktop application for batch clipping video segments. It uses React + TypeScript for the renderer and Node.js for the main process, with FFmpeg for video processing.

## Development Commands

```bash
npm run dev          # Start Vite dev server with Electron
npm run build        # Build for all platforms (Vite + Electron)
npm run build:win    # Build for Windows only
npm run build:mac    # Build for macOS
npm run lint         # Run ESLint
```

## Architecture

### Tech Stack
- **Renderer**: React 18 + TypeScript + TailwindCSS
- **Main Process**: Electron 30 with Node.js native modules
- **Build**: Vite with `vite-plugin-electron` and `electron-builder`
- **Video Processing**: `fluent-ffmpeg` with `ffmpeg-static`

### Project Structure
```
├── electron/
│   ├── main.ts       # Electron main process, IPC handlers, FFmpeg integration
│   └── preload.ts    # Context bridge exposing ipcRenderer API
├── src/
│   ├── App.tsx       # Main React component with state management
│   ├── components/
│   │   ├── VideoPlayer.tsx   # Video playback with ref-based controls
│   │   └── Timeline.tsx      # Zoomable timeline visualization
│   └── lib/utils.ts  # cn() utility for Tailwind classes
├── dist/             # Vite build output (renderer)
├── dist-electron/    # Electron build output
└── release/          # Packaged application
```

### Key Patterns

**IPC Communication**: The preload script exposes a typed API via `contextBridge`:
- `window.ipcRenderer.processBatch({ filePath, outputDir, segments })`
- `window.ipcRenderer.showOpenDialog()`
- `window.ipcRenderer.showSaveDialog()`

**Media Protocol**: Custom `media://` protocol handles local file access in production:
- Format: `media://local/<encoded_path>`
- Registered in `electron/main.ts` with `protocol.handle()`

**Video Processing Flow**:
1. User drops video file → stored with `.path` property (Electron-specific)
2. Source URL uses `media://` protocol for security
3. `process-batch` IPC handler runs FFmpeg for each segment
4. Output: `{baseName}_clip_{index}.mov`

**Keyboard Shortcuts** (in App.tsx):
- `I`: Set segment start (mark in)
- `O`: Close segment (mark out)
- `Space`: Play/pause
- `Ctrl+Scroll` on timeline: Zoom

### Build Configuration

**electron-builder.json5**: Outputs to `release/${version}`, supports Windows (NSIS), macOS (DMG), Linux (AppImage).

**vite.config.ts**: Electron plugin externals include `fluent-ffmpeg`, `ffmpeg-static`, `exiftool-vendored`, `adm-zip`, `uuid`.

**TypeScript**: Strict mode, `moduleResolution: "bundler"`, references `tsconfig.node.json` for Vite config typing.

### Environment Variables
- `VITE_DEV_SERVER_URL`: Development server URL (auto-injected by vite-plugin-electron)
- `CSC_IDENTITY_AUTO_DISCOVERY=false`: Disables macOS code signing during build
