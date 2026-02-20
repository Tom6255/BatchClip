# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React renderer code (TypeScript + Tailwind). Main entry is `src/main.tsx`, app shell is `src/App.tsx`, reusable UI lives in `src/components/`, helpers in `src/lib/`.
- `electron/`: Electron process code. Use `electron/main.ts` for app lifecycle + IPC handlers and `electron/preload.ts` for the safe renderer bridge.
- `public/`: Static assets bundled by Vite.
- `docs/`: Project documentation assets (for example `docs/screenshot.png`).
- Build output: `dist/` (renderer), `dist-electron/` (main/preload), packaged artifacts in `release/`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start the app in local development mode (Vite + Electron).
- `npm run lint`: run ESLint for `.ts/.tsx`; must pass before PR.
- `npm run build` or `npm run build:win`: type-check, bundle, and package Windows build.
- `npm run build:win:ps1`: Windows build via PowerShell helper (useful for winCodeSign symlink permission issues).
- `npm run build:mac`: package macOS build.
- `npm run build:all`: attempt both Windows and macOS packaging (platform-limited by host).
- `npm run preview`: preview renderer bundle.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict` mode enabled in `tsconfig.json`).
- Indentation: 2 spaces; keep style consistent with surrounding file.
- Components: PascalCase filenames and exports (for example `VideoPlayer.tsx`).
- Variables/functions: `camelCase`; constants `UPPER_SNAKE_CASE`.
- IPC channel names: kebab-case strings (for example `process-batch`).
- Run `npm run lint` before committing; no Prettier config is enforced in-repo.

## Testing Guidelines
- No automated test framework is configured yet.
- Minimum validation for every change:
  - `npm run lint`
  - manual flow check in `npm run dev` (import video, mark clips, export clips).
- If you add tests, prefer co-located `*.test.ts`/`*.test.tsx` files and document the run command in `package.json`.

## Commit & Pull Request Guidelines
- Follow existing history style: short, task-focused commit subjects, commonly in Chinese (for example `更新了配置文件`, `支持了更多视频格式`).
- Keep one logical change per commit.
- PRs should include:
  - concise change summary and motivation
  - linked issue (if any)
  - screenshots/GIFs for UI changes
  - tested platforms (Windows/macOS) and command results (`lint`, build variant used).
