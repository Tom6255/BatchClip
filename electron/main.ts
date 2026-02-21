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
const probeInfoCache = new Map<string, ProbeCacheEntry>()

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
  width?: number
  height?: number
  bit_rate_kbps?: number
}

type ProbeAudioStream = {
  bit_rate_kbps?: number
}

type ProbeVideoInfo = {
  stream: ProbeVideoStream | null
  audioStream: ProbeAudioStream | null
  durationSec: number | null
  formatBitRateKbps: number | null
}

type ProbeCacheEntry = {
  size: number
  mtimeMs: number
  info: ProbeVideoInfo
}

type PreviewEncoderConfig = {
  name: string
  videoCodec: string
  outputOptions: string[]
}

type ExportEncoderConfig = {
  name: string
  videoCodec: string
  outputOptions: string[]
}

const PREVIEW_COMMON_OUTPUT_OPTIONS = [
  '-map', '0:v:0',
  '-map', '0:a:0?',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart'
]

const PREVIEW_SOFTWARE_ENCODER: PreviewEncoderConfig = {
  name: 'libx264',
  videoCodec: 'libx264',
  outputOptions: ['-preset', 'ultrafast', '-b:v', '1800k', '-maxrate', '2200k', '-bufsize', '4400k']
}

const PREVIEW_WINDOWS_NVENC_ENCODER: PreviewEncoderConfig = {
  name: 'h264_nvenc',
  videoCodec: 'h264_nvenc',
  outputOptions: ['-preset', 'p4', '-rc', 'vbr', '-b:v', '2M', '-maxrate', '3M', '-bufsize', '6M']
}

const PREVIEW_WINDOWS_QSV_ENCODER: PreviewEncoderConfig = {
  name: 'h264_qsv',
  videoCodec: 'h264_qsv',
  outputOptions: ['-global_quality', '24', '-look_ahead', '0', '-b:v', '2M', '-maxrate', '3M', '-bufsize', '6M']
}

const PREVIEW_WINDOWS_AMF_ENCODER: PreviewEncoderConfig = {
  name: 'h264_amf',
  videoCodec: 'h264_amf',
  outputOptions: ['-quality', 'speed', '-b:v', '2M', '-maxrate', '3M', '-bufsize', '6M']
}

const EXPORT_PRIMARY_X264_PRESET = process.env.BATCHCLIP_EXPORT_PRESET || 'fast'
const EXPORT_FALLBACK_X264_PRESET = process.env.BATCHCLIP_EXPORT_PRESET_FALLBACK || 'medium'
const MAX_PROBE_CACHE_ENTRIES = 128

const EXPORT_WINDOWS_NVENC_ENCODER: ExportEncoderConfig = {
  name: 'h264_nvenc',
  videoCodec: 'h264_nvenc',
  outputOptions: ['-preset', 'p4', '-rc', 'vbr']
}

const EXPORT_WINDOWS_QSV_ENCODER: ExportEncoderConfig = {
  name: 'h264_qsv',
  videoCodec: 'h264_qsv',
  outputOptions: ['-look_ahead', '0']
}

const EXPORT_WINDOWS_AMF_ENCODER: ExportEncoderConfig = {
  name: 'h264_amf',
  videoCodec: 'h264_amf',
  outputOptions: ['-quality', 'speed']
}

const EXPORT_DARWIN_VIDEOTOOLBOX_ENCODER: ExportEncoderConfig = {
  name: 'h264_videotoolbox',
  videoCodec: 'h264_videotoolbox',
  outputOptions: ['-allow_sw', '1']
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

function parseBitrateKbpsFromText(line: string): number | null {
  const match = line.match(/(\d+(?:\.\d+)?)\s*kb\/s/i)
  if (!match) {
    return null
  }

  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }

  return Math.round(value)
}

function parseProbeInfoFromFfmpegOutput(stderrOutput: string): ProbeVideoInfo {
  const lines = stderrOutput
    .split(/\r?\n/)
    .map((line) => line.trim())

  const videoLine = lines.find((line) => line.includes('Video:'))
  const audioLine = lines.find((line) => line.includes('Audio:'))
  const durationLine = lines.find((line) => line.startsWith('Duration:'))
  let durationSec: number | null = null
  let formatBitRateKbps: number | null = null

  if (durationLine) {
    const durationMatch = durationLine.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (durationMatch) {
      const parsed = parseTimemarkToSeconds(`${durationMatch[1]}:${durationMatch[2]}:${durationMatch[3]}`)
      if (parsed !== null) {
        durationSec = parsed
      }
    }

    formatBitRateKbps = parseBitrateKbpsFromText(durationLine)
  }

  if (!videoLine) {
    return {
      stream: null,
      audioStream: audioLine ? { bit_rate_kbps: parseBitrateKbpsFromText(audioLine) ?? undefined } : null,
      durationSec,
      formatBitRateKbps
    }
  }

  const markerIndex = videoLine.indexOf('Video:')
  if (markerIndex === -1) {
    return {
      stream: null,
      audioStream: audioLine ? { bit_rate_kbps: parseBitrateKbpsFromText(audioLine) ?? undefined } : null,
      durationSec,
      formatBitRateKbps
    }
  }

  const payload = videoLine.slice(markerIndex + 'Video:'.length).trim()
  const parts = payload.split(',').map((part) => part.trim())
  const firstPart = parts[0] ?? ''
  const secondPart = parts[1] ?? ''

  const codec_name = firstPart.split(/\s+/)[0]?.toLowerCase()
  const profileMatch = firstPart.match(/\(([^)]+)\)/)
  const pix_fmt = secondPart.split(/[\s(]/)[0]?.toLowerCase()
  const resolutionPart = parts.find((part) => /\d{2,5}x\d{2,5}/.test(part)) ?? ''
  const resolutionMatch = resolutionPart.match(/(\d{2,5})x(\d{2,5})/)
  const width = resolutionMatch ? Number(resolutionMatch[1]) : null
  const height = resolutionMatch ? Number(resolutionMatch[2]) : null
  const videoBitRateKbps = parseBitrateKbpsFromText(videoLine)
  const audioBitRateKbps = audioLine ? parseBitrateKbpsFromText(audioLine) : null

  return {
    stream: {
      codec_name: codec_name || undefined,
      profile: profileMatch?.[1],
      pix_fmt: pix_fmt || undefined,
      width: width && Number.isFinite(width) ? width : undefined,
      height: height && Number.isFinite(height) ? height : undefined,
      bit_rate_kbps: videoBitRateKbps ?? undefined
    },
    audioStream: audioBitRateKbps !== null ? { bit_rate_kbps: audioBitRateKbps } : null,
    durationSec,
    formatBitRateKbps
  }
}

function pruneProbeCacheIfNeeded(): void {
  while (probeInfoCache.size > MAX_PROBE_CACHE_ENTRIES) {
    const oldestKey = probeInfoCache.keys().next().value as string | undefined
    if (!oldestKey) break
    probeInfoCache.delete(oldestKey)
  }
}

async function readProbeCache(filePath: string): Promise<ProbeVideoInfo | null> {
  try {
    const stat = await fs.promises.stat(filePath)
    const cached = probeInfoCache.get(filePath)
    if (!cached) {
      return null
    }

    if (cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      return cached.info
    }
  } catch {
    return null
  }

  return null
}

async function writeProbeCache(filePath: string, info: ProbeVideoInfo): Promise<void> {
  try {
    const stat = await fs.promises.stat(filePath)
    probeInfoCache.set(filePath, {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      info
    })
    pruneProbeCacheIfNeeded()
  } catch {
    // Ignore cache write failures
  }
}

async function probeVideoInfo(filePath: string): Promise<ProbeVideoInfo> {
  const cached = await readProbeCache(filePath)
  if (cached) {
    return cached
  }

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
      const info = parseProbeInfoFromFfmpegOutput(stderrOutput)
      void writeProbeCache(filePath, info)
      resolve(info)
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

function normalizeLutPath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeLutIntensity(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return 100
  }

  return Math.min(100, Math.max(0, numeric))
}

async function resolveLutPath(lutPath: unknown): Promise<string | null> {
  const normalizedPath = normalizeLutPath(lutPath)
  if (!normalizedPath) {
    return null
  }

  if (path.extname(normalizedPath).toLowerCase() !== '.cube') {
    throw new Error('Only .cube LUT files are supported')
  }

  try {
    await fs.promises.access(normalizedPath, fs.constants.R_OK)
  } catch {
    throw new Error(`LUT file is not readable: ${normalizedPath}`)
  }

  return normalizedPath
}

function escapePathForFilter(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\\\'")
}

function buildLutFilter(filePath: string): string {
  return `lut3d=file='${escapePathForFilter(filePath)}'`
}

function buildLutFilterGraph(lutPath: string | null, lutIntensity: number): string | null {
  if (!lutPath) {
    return null
  }

  const clampedIntensity = Math.min(100, Math.max(0, lutIntensity))
  if (clampedIntensity <= 0) {
    return null
  }

  if (clampedIntensity >= 100) {
    return buildLutFilter(lutPath)
  }

  const opacity = (clampedIntensity / 100).toFixed(4)
  return `split=2[orig][lutsrc];[lutsrc]${buildLutFilter(lutPath)}[lutout];[lutout][orig]blend=all_mode=normal:all_opacity=${opacity}`
}

function buildPreviewFilterGraph(lutPath: string | null, lutIntensity: number): string {
  const baseFilter = 'scale=min(1280\\,iw):-2'
  const lutFilterGraph = buildLutFilterGraph(lutPath, lutIntensity)
  if (!lutFilterGraph) {
    return baseFilter
  }

  return `${baseFilter},${lutFilterGraph}`
}

function createSoftwareExportEncoder(preset: string): ExportEncoderConfig {
  return {
    name: `libx264-${preset}`,
    videoCodec: 'libx264',
    outputOptions: ['-preset', preset]
  }
}

function getExportEncoderAttempts(): ExportEncoderConfig[] {
  const softwarePrimary = createSoftwareExportEncoder(EXPORT_PRIMARY_X264_PRESET)
  const softwareFallback = createSoftwareExportEncoder(EXPORT_FALLBACK_X264_PRESET)
  const attempts: ExportEncoderConfig[] = []

  if (process.platform === 'win32') {
    attempts.push(
      EXPORT_WINDOWS_NVENC_ENCODER,
      EXPORT_WINDOWS_QSV_ENCODER,
      EXPORT_WINDOWS_AMF_ENCODER
    )
  } else if (process.platform === 'darwin') {
    attempts.push(EXPORT_DARWIN_VIDEOTOOLBOX_ENCODER)
  }

  attempts.push(softwarePrimary)
  if (softwareFallback.name !== softwarePrimary.name) {
    attempts.push(softwareFallback)
  }

  return attempts
}

function buildExportOutputOptions(options: {
  encoder: ExportEncoderConfig
  lutPath?: string | null
  lutIntensity?: number
  sourceVideoBitRateKbps?: number | null
  sourceAudioBitRateKbps?: number | null
}): string[] {
  const {
    encoder,
    lutPath = null,
    lutIntensity = 100,
    sourceVideoBitRateKbps = null,
    sourceAudioBitRateKbps = null
  } = options

  const outputOptions = [
    '-movflags', 'use_metadata_tags',
    '-pix_fmt', 'yuv420p',
    ...encoder.outputOptions
  ]

  const lutFilterGraph = buildLutFilterGraph(lutPath, lutIntensity)
  if (lutFilterGraph) {
    outputOptions.push('-vf', lutFilterGraph)
  }

  if (sourceVideoBitRateKbps && sourceVideoBitRateKbps > 0) {
    outputOptions.push('-b:v', `${Math.round(sourceVideoBitRateKbps)}k`)
  }

  if (sourceAudioBitRateKbps && sourceAudioBitRateKbps > 0) {
    outputOptions.push('-b:a', `${Math.round(sourceAudioBitRateKbps)}k`)
  }

  return outputOptions
}

async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath)
  } catch (error: unknown) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      console.warn(`Failed to remove file: ${filePath}`, error)
    }
  }
}

async function createPreviewProxy(filePath: string, options?: {
  durationSec?: number | null
  lutPath?: string | null
  lutIntensity?: number
  onProgress?: (percent: number) => void
}): Promise<string> {
  const { durationSec = null, lutPath = null, lutIntensity = 100, onProgress } = options ?? {}
  const previewDir = path.join(app.getPath('temp'), 'batchclip-preview')
  await fs.promises.mkdir(previewDir, { recursive: true })

  const baseName = path.basename(filePath, path.extname(filePath))
  const proxyPath = path.join(previewDir, `${baseName}_preview_${Date.now()}.mp4`)
  const previewFilterGraph = buildPreviewFilterGraph(lutPath, lutIntensity)
  const encoderAttempts = process.platform === 'win32'
    ? [
      PREVIEW_WINDOWS_NVENC_ENCODER,
      PREVIEW_WINDOWS_QSV_ENCODER,
      PREVIEW_WINDOWS_AMF_ENCODER,
      PREVIEW_SOFTWARE_ENCODER
    ]
    : [PREVIEW_SOFTWARE_ENCODER]

  let lastErrorMessage = 'Failed to build preview proxy'

  for (let index = 0; index < encoderAttempts.length; index++) {
    const encoder = encoderAttempts[index]

    const command = ffmpeg(filePath)
      .output(proxyPath)
      .videoCodec(encoder.videoCodec)
      .audioCodec('aac')
      .audioBitrate('96k')
      .outputOptions([
        ...PREVIEW_COMMON_OUTPUT_OPTIONS,
        '-vf', previewFilterGraph,
        ...encoder.outputOptions
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

    try {
      await runFfmpegCommand(command)
      previewProxyPaths.add(proxyPath)
      return proxyPath
    } catch (error: unknown) {
      lastErrorMessage = getErrorMessage(error)
      await removeFileIfExists(proxyPath)

      if (index < encoderAttempts.length - 1) {
        console.warn(`[BatchClip] Preview proxy encoder "${encoder.name}" failed, trying fallback.`, error)
      }
    }
  }

  throw new Error(lastErrorMessage)
}

async function exportSingleClip(options: {
  filePath: string
  startSec: number
  durationSec: number
  outputPath: string
  lutPath?: string | null
  lutIntensity?: number
  sourceVideoBitRateKbps?: number | null
  sourceAudioBitRateKbps?: number | null
  onProgress?: (percent: number) => void
}): Promise<void> {
  const {
    filePath,
    startSec,
    durationSec,
    outputPath,
    lutPath = null,
    lutIntensity = 100,
    sourceVideoBitRateKbps = null,
    sourceAudioBitRateKbps = null,
    onProgress
  } = options

  const encoderAttempts = getExportEncoderAttempts()
  let lastErrorMessage = 'Failed to export clip'

  for (let index = 0; index < encoderAttempts.length; index++) {
    const encoder = encoderAttempts[index]
    const outputOptions = buildExportOutputOptions({
      encoder,
      lutPath,
      lutIntensity,
      sourceVideoBitRateKbps,
      sourceAudioBitRateKbps
    })

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .setStartTime(startSec)
          .setDuration(durationSec)
          .output(outputPath)
          .videoCodec(encoder.videoCodec)
          .audioCodec('aac')
          .outputOptions(outputOptions)
          .on('progress', (progress) => {
            let segmentPercent = typeof progress.percent === 'number' ? progress.percent : null
            if ((segmentPercent === null || !Number.isFinite(segmentPercent)) && durationSec > 0) {
              const processedSeconds = parseTimemarkToSeconds(progress.timemark)
              if (processedSeconds !== null) {
                segmentPercent = (processedSeconds / durationSec) * 100
              }
            }

            if (segmentPercent !== null && Number.isFinite(segmentPercent)) {
              onProgress?.(Math.min(100, Math.max(0, segmentPercent)))
            }
          })
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })
      return
    } catch (error: unknown) {
      lastErrorMessage = getErrorMessage(error)
      await removeFileIfExists(outputPath)

      if (index < encoderAttempts.length - 1) {
        console.warn(`[BatchClip] Clip export encoder "${encoder.name}" failed, trying fallback.`, error)
      }
    }
  }

  throw new Error(lastErrorMessage)
}

async function exportSingleFullVideo(options: {
  filePath: string
  outputPath: string
  lutPath?: string | null
  lutIntensity?: number
  sourceVideoBitRateKbps?: number | null
  sourceAudioBitRateKbps?: number | null
  durationSec?: number | null
  onProgress?: (percent: number) => void
}): Promise<void> {
  const {
    filePath,
    outputPath,
    lutPath = null,
    lutIntensity = 100,
    sourceVideoBitRateKbps = null,
    sourceAudioBitRateKbps = null,
    durationSec = null,
    onProgress
  } = options

  const encoderAttempts = getExportEncoderAttempts()
  let lastErrorMessage = 'Failed to export full video'

  for (let index = 0; index < encoderAttempts.length; index++) {
    const encoder = encoderAttempts[index]
    const outputOptions = buildExportOutputOptions({
      encoder,
      lutPath,
      lutIntensity,
      sourceVideoBitRateKbps,
      sourceAudioBitRateKbps
    })

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .output(outputPath)
          .videoCodec(encoder.videoCodec)
          .audioCodec('aac')
          .outputOptions(outputOptions)
          .on('progress', (progress) => {
            let fullPercent = typeof progress.percent === 'number' ? progress.percent : null
            if ((fullPercent === null || !Number.isFinite(fullPercent)) && durationSec && durationSec > 0) {
              const processedSeconds = parseTimemarkToSeconds(progress.timemark)
              if (processedSeconds !== null) {
                fullPercent = (processedSeconds / durationSec) * 100
              }
            }

            if (fullPercent !== null && Number.isFinite(fullPercent)) {
              onProgress?.(Math.min(100, Math.max(0, fullPercent)))
            }
          })
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })
      return
    } catch (error: unknown) {
      lastErrorMessage = getErrorMessage(error)
      await removeFileIfExists(outputPath)

      if (index < encoderAttempts.length - 1) {
        console.warn(`[BatchClip] Full export encoder "${encoder.name}" failed, trying fallback.`, error)
      }
    }
  }

  throw new Error(lastErrorMessage)
}

async function probeSourceInfoWithBitrates(filePath: string): Promise<{
  info: ProbeVideoInfo
  sourceVideoBitRateKbps: number | null
  sourceAudioBitRateKbps: number | null
}> {
  let info: ProbeVideoInfo = {
    stream: null,
    audioStream: null,
    durationSec: null,
    formatBitRateKbps: null
  }

  try {
    info = await probeVideoInfo(filePath)
  } catch (error) {
    console.warn('[BatchClip] Failed to probe source bitrate, fallback to encoder defaults.', error)
  }

  const sourceAudioBitRateKbps = info.audioStream?.bit_rate_kbps ?? null
  const sourceVideoBitRateKbps = info.stream?.bit_rate_kbps ??
    (info.formatBitRateKbps
      ? Math.max(400, info.formatBitRateKbps - (sourceAudioBitRateKbps ?? 0))
      : null)

  return {
    info,
    sourceVideoBitRateKbps,
    sourceAudioBitRateKbps
  }
}

async function buildUniqueOutputPath(outputDir: string, baseName: string, extension: string): Promise<string> {
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`
  for (let suffix = 1; suffix < 100000; suffix++) {
    const candidatePath = suffix === 1
      ? path.join(outputDir, `${baseName}${normalizedExtension}`)
      : path.join(outputDir, `${baseName}_${suffix}${normalizedExtension}`)
    try {
      await fs.promises.access(candidatePath, fs.constants.F_OK)
    } catch {
      return candidatePath
    }
  }

  throw new Error('Failed to allocate output file path')
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
    icon: path.join(process.env.VITE_PUBLIC, 'batchclip.svg'),
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
    title: 'Save BatchClip Archive',
    defaultPath: 'BatchClip.livp',
    filters: [{ name: 'BatchClip Archive', extensions: ['livp', 'zip'] }]
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

ipcMain.handle('show-open-lut-dialog', async () => {
  if (!win) return null
  const { filePaths } = await dialog.showOpenDialog(win, {
    title: 'Select LUT File',
    properties: ['openFile'],
    filters: [{ name: 'LUT Files', extensions: ['cube'] }]
  })
  return filePaths[0] || null
})

ipcMain.handle('read-lut-file', async (_event, { lutPath }) => {
  try {
    const resolvedLutPath = await resolveLutPath(lutPath)
    if (!resolvedLutPath) {
      return { success: false, error: 'Invalid LUT path' }
    }

    const content = await fs.promises.readFile(resolvedLutPath, 'utf8')
    return { success: true, path: resolvedLutPath, content }
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) || 'Failed to read LUT file' }
  }
})

ipcMain.handle('prepare-preview', async (event, { filePath, forceProxy = false, lutPath, lutIntensity, jobId }) => {
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
    let probeInfo: ProbeVideoInfo = {
      stream: null,
      audioStream: null,
      durationSec: null,
      formatBitRateKbps: null
    }
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

    const resolvedLutPath = await resolveLutPath(lutPath)
    const resolvedLutIntensity = normalizeLutIntensity(lutIntensity)

    emitProgress('start', 0)
    const proxyPath = await createPreviewProxy(filePath, {
      durationSec: probeInfo.durationSec,
      lutPath: resolvedLutPath,
      lutIntensity: resolvedLutIntensity,
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

ipcMain.handle('process-batch', async (event, { filePath, outputDir, segments, lutPath, lutIntensity, jobId }) => {
  // segments: { start, end, id }[]
  const resolvedLutPath = await resolveLutPath(lutPath)
  const resolvedLutIntensity = normalizeLutIntensity(lutIntensity)
  const {
    sourceVideoBitRateKbps,
    sourceAudioBitRateKbps
  } = await probeSourceInfoWithBitrates(filePath)
  const results = [];
  console.log(`Batch processing ${segments.length} clips from: ${filePath} (LUT: ${resolvedLutPath ? `${path.basename(resolvedLutPath)} @ ${resolvedLutIntensity}%` : 'off'})`);

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
      let maxSegmentPercent = 0
      const emitSegmentProgress = (segmentPercent: number) => {
        maxSegmentPercent = Math.max(maxSegmentPercent, Math.min(100, Math.max(0, segmentPercent)))
        const overallPercent = segmentStartPercent + (maxSegmentPercent / 100) * segmentWeight
        emitExportProgress('progress', overallPercent, clipIndex, segments.length)
      }

      await exportSingleClip({
        filePath,
        startSec: seg.start,
        durationSec: duration,
        outputPath: tempVidPath,
        lutPath: resolvedLutPath,
        lutIntensity: resolvedLutIntensity,
        sourceVideoBitRateKbps,
        sourceAudioBitRateKbps,
        onProgress: emitSegmentProgress
      })

      emitExportProgress('progress', ((i + 1) / Math.max(segments.length, 1)) * 100, clipIndex, segments.length)
      results.push({ id: seg.id, success: true, path: tempVidPath });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error(`Error processing clip ${clipIndex}:`, error);
      await removeFileIfExists(tempVidPath)
      emitExportProgress('progress', ((i + 1) / Math.max(segments.length, 1)) * 100, clipIndex, segments.length)
      results.push({ id: seg.id, success: false, error: errorMessage });
    }
  }

  emitExportProgress('done', 100, segments.length, segments.length)
  return { success: true, results };
});

ipcMain.handle('process-lut-full-batch', async (event, { videos, outputDir, lutPath, lutIntensity, jobId }) => {
  const resolvedLutPath = await resolveLutPath(lutPath)
  if (!resolvedLutPath) {
    return { success: false, results: [] }
  }

  const resolvedLutIntensity = normalizeLutIntensity(lutIntensity)
  const normalizedVideos = Array.isArray(videos)
    ? videos.filter((video) => (
      Boolean(video) &&
      typeof video.id === 'string' &&
      video.id.length > 0 &&
      typeof video.filePath === 'string' &&
      video.filePath.length > 0
    ))
    : []

  const totalVideos = normalizedVideos.length
  const results: Array<{ id: string; success: boolean; path?: string; error?: string }> = []
  const progressJobId = typeof jobId === 'string' && jobId ? jobId : null
  let lastReportedProgress = -1
  const emitExportProgress = (phase: 'start' | 'progress' | 'done', percent: number, currentVideo = 0, total = totalVideos) => {
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
      currentClip: currentVideo,
      totalClips: total
    })
  }

  emitExportProgress('start', 0, 0, totalVideos)
  await fs.promises.mkdir(outputDir, { recursive: true })

  for (let i = 0; i < normalizedVideos.length; i++) {
    const entry = normalizedVideos[i]
    const videoIndex = i + 1
    const segmentStartPercent = (i / Math.max(totalVideos, 1)) * 100
    const segmentWeight = 100 / Math.max(totalVideos, 1)

    try {
      const {
        info,
        sourceVideoBitRateKbps,
        sourceAudioBitRateKbps
      } = await probeSourceInfoWithBitrates(entry.filePath)
      const baseName = path.basename(entry.filePath, path.extname(entry.filePath))
      const outputPath = await buildUniqueOutputPath(outputDir, `${baseName}_lut`, '.mov')

      let maxVideoPercent = 0
      const emitVideoProgress = (videoPercent: number) => {
        maxVideoPercent = Math.max(maxVideoPercent, Math.min(100, Math.max(0, videoPercent)))
        const overallPercent = segmentStartPercent + (maxVideoPercent / 100) * segmentWeight
        emitExportProgress('progress', overallPercent, videoIndex, totalVideos)
      }

      await exportSingleFullVideo({
        filePath: entry.filePath,
        outputPath,
        lutPath: resolvedLutPath,
        lutIntensity: resolvedLutIntensity,
        sourceVideoBitRateKbps,
        sourceAudioBitRateKbps,
        durationSec: info.durationSec,
        onProgress: emitVideoProgress
      })

      emitExportProgress('progress', ((i + 1) / Math.max(totalVideos, 1)) * 100, videoIndex, totalVideos)
      results.push({ id: entry.id, success: true, path: outputPath })
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error(`Error full-exporting video ${videoIndex}:`, error)
      emitExportProgress('progress', ((i + 1) / Math.max(totalVideos, 1)) * 100, videoIndex, totalVideos)
      results.push({ id: entry.id, success: false, error: errorMessage })
    }
  }

  emitExportProgress('done', 100, totalVideos, totalVideos)
  return { success: true, results }
})
