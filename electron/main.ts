import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

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
const previewProxyPaths = new Set<string>()

// On macOS, force software rendering for better compatibility with problematic media decoders.
// Set BATCHCLIP_FORCE_HW_ACCEL=1 to opt back in to hardware acceleration.
if (process.platform === 'darwin' && process.env.BATCHCLIP_FORCE_HW_ACCEL !== '1') {
  app.disableHardwareAcceleration()
  console.log('[BatchClip] Hardware acceleration is disabled on macOS for video compatibility.')
}

type ProbeVideoStream = {
  codec_name?: string
  profile?: string | number
  pix_fmt?: string
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function runFfmpegCommand(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command.on('end', () => resolve()).on('error', (err: Error) => reject(err)).run()
  })
}

function parseVideoStreamFromFfmpegOutput(stderrOutput: string): ProbeVideoStream | null {
  const videoLine = stderrOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.includes('Video:'))

  if (!videoLine) return null

  const markerIndex = videoLine.indexOf('Video:')
  if (markerIndex === -1) return null

  const payload = videoLine.slice(markerIndex + 'Video:'.length).trim()
  const parts = payload.split(',').map((part) => part.trim())
  const firstPart = parts[0] ?? ''
  const secondPart = parts[1] ?? ''

  const codec_name = firstPart.split(/\s+/)[0]?.toLowerCase()
  const profileMatch = firstPart.match(/\(([^)]+)\)/)
  const pix_fmt = secondPart.split(/[\s(]/)[0]?.toLowerCase()

  return {
    codec_name: codec_name || undefined,
    profile: profileMatch?.[1],
    pix_fmt: pix_fmt || undefined
  }
}

function probeFirstVideoStream(filePath: string): Promise<ProbeVideoStream | null> {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-i', filePath]
    const probeProcess = spawn(ffmpegPath, args, {
      windowsHide: true
    })

    let stderrOutput = ''

    probeProcess.stderr.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString()
    })

    probeProcess.once('error', (error) => {
      reject(error)
    })

    // ffmpeg -i exits with non-zero when no output is specified; still usable for stream parsing.
    probeProcess.once('close', () => {
      resolve(parseVideoStreamFromFfmpegOutput(stderrOutput))
    })
  })
}

function shouldUsePreviewProxy(stream: ProbeVideoStream | null): boolean {
  if (!stream) return false

  const codec = (stream.codec_name ?? '').toLowerCase()
  const profile = String(stream.profile ?? '').toLowerCase()
  const pixelFormat = (stream.pix_fmt ?? '').toLowerCase()

  return codec === 'hevc' || codec === 'h265' || profile.includes('main 10') || pixelFormat.includes('10')
}

async function createPreviewProxy(filePath: string): Promise<string> {
  const previewDir = path.join(app.getPath('temp'), 'batchclip-preview')
  await fs.promises.mkdir(previewDir, { recursive: true })

  const baseName = path.basename(filePath, path.extname(filePath))
  const proxyPath = path.join(previewDir, `${baseName}_preview_${Date.now()}.mp4`)

  const command = ffmpeg(filePath)
    .output(proxyPath)
    .videoCodec('libx264')
    .audioCodec('aac')
    .audioBitrate('192k')
    .outputOptions([
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-vf', 'scale=min(1920\\,iw):-2'
    ])

  await runFfmpegCommand(command)
  previewProxyPaths.add(proxyPath)
  return proxyPath
}

async function cleanupPreviewProxy(proxyPath: string): Promise<void> {
  previewProxyPaths.delete(proxyPath)
  try {
    await fs.promises.unlink(proxyPath)
  } catch (error: unknown) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      console.warn(`Failed to cleanup preview proxy: ${proxyPath}`, error)
    }
  }
}

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

app.on('before-quit', () => {
  const stalePreviewPaths = Array.from(previewProxyPaths)
  for (const proxyPath of stalePreviewPaths) {
    void cleanupPreviewProxy(proxyPath)
  }
})

app.whenReady().then(() => {
  createWindow()
})


// --- IPC Handlers for Video Processing ---

// Get the file path from a dropped file
ipcMain.handle('get-file-path', (_event, file) => {
  return (file as { path?: string }).path || null;
});


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

ipcMain.handle('prepare-preview', async (_event, { filePath }) => {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, useProxy: false, error: 'Invalid file path' }
  }

  try {
    const stream = await probeFirstVideoStream(filePath)

    if (!shouldUsePreviewProxy(stream)) {
      return {
        success: true,
        useProxy: false,
        url: pathToFileURL(filePath).toString()
      }
    }

    const proxyPath = await createPreviewProxy(filePath)

    return {
      success: true,
      useProxy: true,
      path: proxyPath,
      url: pathToFileURL(proxyPath).toString()
    }
  } catch (error: unknown) {
    console.error('Failed to prepare preview source:', error)
    return {
      success: false,
      useProxy: false,
      error: getErrorMessage(error) || 'Failed to prepare preview'
    }
  }
})

ipcMain.handle('cleanup-preview', async (_event, { proxyPath }) => {
  if (!proxyPath || typeof proxyPath !== 'string') {
    return { success: true }
  }

  try {
    await cleanupPreviewProxy(proxyPath)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) || 'Failed to cleanup preview proxy' }
  }
})

ipcMain.handle('process-batch', async (_event, { filePath, outputDir, segments }) => {
  // segments: { start, end, id }[]
  const results = [];
  console.log(`Batch processing ${segments.length} clips from: ${filePath}`);

  // Ensure output dir exists
  await fs.promises.mkdir(outputDir, { recursive: true });

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
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error(`Error processing clip ${i + 1}:`, error);
      results.push({ id: seg.id, success: false, error: errorMessage });
    }
  }

  return { success: true, results };
});
