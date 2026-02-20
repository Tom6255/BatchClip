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

type ProbeVideoInfo = {
  stream: ProbeVideoStream | null
  durationSec: number | null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function parseTimemarkToSeconds(timemark: string): number | null {
  const match = timemark.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null
  }

  return hours * 3600 + minutes * 60 + seconds
}

function runFfmpegCommand(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command.on('end', () => resolve()).on('error', (err: Error) => reject(err)).run()
  })
}

function parseProbeInfoFromFfmpegOutput(stderrOutput: string): ProbeVideoInfo {
  const lines = stderrOutput
    .split(/\r?\n/)
    .map((line) => line.trim())

  const videoLine = lines.find((line) => line.includes('Video:'))
  const durationLine = lines.find((line) => line.startsWith('Duration:'))
  let durationSec: number | null = null

  if (durationLine) {
    const durationMatch = durationLine.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (durationMatch) {
      const parsed = parseTimemarkToSeconds(`${durationMatch[1]}:${durationMatch[2]}:${durationMatch[3]}`)
      if (parsed !== null) {
        durationSec = parsed
      }
    }
  }

  if (!videoLine) {
    return {
      stream: null,
      durationSec
    }
  }

  const markerIndex = videoLine.indexOf('Video:')
  if (markerIndex === -1) {
    return {
      stream: null,
      durationSec
    }
  }

  const payload = videoLine.slice(markerIndex + 'Video:'.length).trim()
  const parts = payload.split(',').map((part) => part.trim())
  const firstPart = parts[0] ?? ''
  const secondPart = parts[1] ?? ''

  const codec_name = firstPart.split(/\s+/)[0]?.toLowerCase()
  const profileMatch = firstPart.match(/\(([^)]+)\)/)
  const pix_fmt = secondPart.split(/[\s(]/)[0]?.toLowerCase()

  return {
    stream: {
      codec_name: codec_name || undefined,
      profile: profileMatch?.[1],
      pix_fmt: pix_fmt || undefined
    },
    durationSec
  }
}

function probeVideoInfo(filePath: string): Promise<ProbeVideoInfo> {
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
      resolve(parseProbeInfoFromFfmpegOutput(stderrOutput))
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

async function createPreviewProxy(filePath: string, options?: {
  durationSec?: number | null
  onProgress?: (percent: number) => void
}): Promise<string> {
  const { durationSec = null, onProgress } = options ?? {}
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
    .on('start', () => {
      onProgress?.(0)
    })
    .on('progress', (progress) => {
      let percent = typeof progress.percent === 'number' ? progress.percent : null

      if ((percent === null || !Number.isFinite(percent)) && durationSec && durationSec > 0) {
        const processedSeconds = parseTimemarkToSeconds(progress.timemark)
        if (processedSeconds !== null) {
          percent = (processedSeconds / durationSec) * 100
        }
      }

      if (percent !== null && Number.isFinite(percent)) {
        onProgress?.(Math.min(100, Math.max(0, percent)))
      }
    })

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

ipcMain.handle('prepare-preview', async (event, { filePath, forceProxy = false, jobId }) => {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, useProxy: false, error: 'Invalid file path' }
  }

  try {
    const progressJobId = typeof jobId === 'string' && jobId ? jobId : null
    let lastReportedProgress = -1
    const emitProgress = (phase: 'start' | 'progress' | 'done', percent: number) => {
      if (!progressJobId) return

      const clampedPercent = Math.min(100, Math.max(0, percent))
      const rounded = Math.round(clampedPercent)
      if (phase === 'progress' && rounded === lastReportedProgress) {
        return
      }

      if (phase === 'progress') {
        lastReportedProgress = rounded
      }

      event.sender.send('preview-prepare-progress', {
        jobId: progressJobId,
        phase,
        percent: rounded
      })
    }

    let suggestCompatibleMode = false
    let probeInfo: ProbeVideoInfo = { stream: null, durationSec: null }
    try {
      probeInfo = await probeVideoInfo(filePath)
      suggestCompatibleMode = shouldUsePreviewProxy(probeInfo.stream)
    } catch (error) {
      console.warn('Probe failed, fallback to direct preview decision:', error)
    }

    // Default strategy: direct preview first. Only transcode when explicitly requested.
    if (!forceProxy) {
      return {
        success: true,
        useProxy: false,
        url: pathToFileURL(filePath).toString(),
        suggestCompatibleMode
      }
    }

    emitProgress('start', 0)
    const proxyPath = await createPreviewProxy(filePath, {
      durationSec: probeInfo.durationSec,
      onProgress: (percent) => emitProgress('progress', percent)
    })
    emitProgress('done', 100)

    return {
      success: true,
      useProxy: true,
      path: proxyPath,
      url: pathToFileURL(proxyPath).toString(),
      suggestCompatibleMode
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

ipcMain.handle('process-batch', async (event, { filePath, outputDir, segments, jobId }) => {
  // segments: { start, end, id }[]
  const results = [];
  console.log(`Batch processing ${segments.length} clips from: ${filePath}`);

  const progressJobId = typeof jobId === 'string' && jobId ? jobId : null
  let lastReportedProgress = -1
  const emitExportProgress = (phase: 'start' | 'progress' | 'done', percent: number, currentClip = 0, totalClips = segments.length) => {
    if (!progressJobId) return

    const clampedPercent = Math.min(100, Math.max(0, percent))
    const rounded = Math.round(clampedPercent)
    if (phase === 'progress' && rounded === lastReportedProgress) {
      return
    }
    if (phase === 'progress') {
      lastReportedProgress = rounded
    }

    event.sender.send('batch-export-progress', {
      jobId: progressJobId,
      phase,
      percent: rounded,
      currentClip,
      totalClips
    })
  }

  emitExportProgress('start', 0, 0, segments.length)

  // Ensure output dir exists
  await fs.promises.mkdir(outputDir, { recursive: true });

  const baseName = path.basename(filePath, path.extname(filePath));

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const duration = seg.end - seg.start;
    const clipIndex = i + 1
    const segmentStartPercent = (i / Math.max(segments.length, 1)) * 100
    const segmentWeight = 100 / Math.max(segments.length, 1)
    // Output name: VideoName_clip_01_Time.mov
    // Use a safe timestamp format or just index
    const outName = `${baseName}_clip_${clipIndex.toString().padStart(2, '0')}.mov`;
    const tempVidPath = path.join(outputDir, outName);

    console.log(`Processing clip ${clipIndex}: ${seg.start}-${seg.end} -> ${outName}`);
    emitExportProgress('progress', segmentStartPercent, clipIndex, segments.length)

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
          .on('progress', (progress) => {
            let segmentPercent = typeof progress.percent === 'number' ? progress.percent : null
            if ((segmentPercent === null || !Number.isFinite(segmentPercent)) && duration > 0) {
              const processedSeconds = parseTimemarkToSeconds(progress.timemark)
              if (processedSeconds !== null) {
                segmentPercent = (processedSeconds / duration) * 100
              }
            }

            if (segmentPercent !== null && Number.isFinite(segmentPercent)) {
              const overallPercent = segmentStartPercent + (Math.min(100, Math.max(0, segmentPercent)) / 100) * segmentWeight
              emitExportProgress('progress', overallPercent, clipIndex, segments.length)
            }
          })
          .on('end', () => resolve())
          .on('error', (err) => reject(new Error(`Clip ${clipIndex} failed: ${err.message}`)))
          .run();
      });
      emitExportProgress('progress', ((i + 1) / Math.max(segments.length, 1)) * 100, clipIndex, segments.length)
      results.push({ id: seg.id, success: true, path: tempVidPath });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error(`Error processing clip ${clipIndex}:`, error);
      emitExportProgress('progress', ((i + 1) / Math.max(segments.length, 1)) * 100, clipIndex, segments.length)
      results.push({ id: seg.id, success: false, error: errorMessage });
    }
  }

  emitExportProgress('done', 100, segments.length, segments.length)
  return { success: true, results };
});
