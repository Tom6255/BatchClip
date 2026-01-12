import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'

import ffmpeg from 'fluent-ffmpeg'


const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Configure FFmpeg
// When in production, ffmpeg-static path might need adjustment
const ffmpegPath = require('ffmpeg-static').replace(
  'app.asar',
  'app.asar.unpacked'
);
ffmpeg.setFfmpegPath(ffmpegPath);

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#09090b', // Zinc-950
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allow loading local files for now
    },
    titleBarStyle: 'hidden', // Custom title bar
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#ffffff',
      height: 32
    }
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)


// --- IPC Handlers for Video Processing ---


ipcMain.handle('show-save-dialog', async () => {
  if (!win) return null;
  const { filePath } = await dialog.showSaveDialog(win, {
    title: 'Save Live Photo',
    defaultPath: 'LivePhoto.livp',
    filters: [{ name: 'Live Photo', extensions: ['livp', 'zip'] }]
  });
  return filePath || null;
});

ipcMain.handle('show-open-dialog', async () => {
  if (!win) return null;
  const { filePaths } = await dialog.showOpenDialog(win, {
    title: 'Select Output Directory',
    properties: ['openDirectory', 'createDirectory']
  });
  return filePaths[0] || null;
});

ipcMain.handle('process-batch', async (_event, { filePath, outputDir, segments }) => {
  // segments: { start, end, id }[]
  const results = [];
  console.log(`Batch processing ${segments.length} clips from: ${filePath}`);

  // Ensure output dir exists
  await fs.mkdir(outputDir, { recursive: true });

  const baseName = path.basename(filePath, path.extname(filePath));

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const duration = seg.end - seg.start;
    // Output name: VideoName_clip_01_Time.mov
    // Use a safe timestamp format or just index
    const outName = `${baseName}_clip_${(i + 1).toString().padStart(2, '0')}.mov`;
    const tempVidPath = path.join(outputDir, outName);

    console.log(`Processing clip ${i + 1}: ${seg.start}-${seg.end} -> ${outName}`);

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .setStartTime(seg.start)
          .setDuration(duration)
          .output(tempVidPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions([
            '-movflags', 'use_metadata_tags', // basic flags
            '-pix_fmt', 'yuv420p'
          ])
          .on('end', () => resolve())
          .on('error', (err) => reject(new Error(`Clip ${i + 1} failed: ${err.message}`)))
          .run();
      });
      results.push({ id: seg.id, success: true, path: tempVidPath });
    } catch (error: any) {
      console.error(`Error processing clip ${i + 1}:`, error);
      results.push({ id: seg.id, success: false, error: error.message });
    }
  }

  return { success: true, results };
});

