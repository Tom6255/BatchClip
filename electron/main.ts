import { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

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
const jobControllers = new Map<string, JobController>()

type WindowTheme = 'dark' | 'light'

const WINDOW_THEME_CONFIG: Record<WindowTheme, {
  backgroundColor: string
  overlayColor: string
  symbolColor: string
}> = {
  dark: {
    backgroundColor: '#09090b',
    overlayColor: '#09090b',
    symbolColor: '#ffffff'
  },
  light: {
    backgroundColor: '#f7faff',
    overlayColor: '#f7faff',
    symbolColor: '#0f172a'
  }
}

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

type BatchSegmentInput = {
  id: string
  start: number
  end: number
  tags?: unknown
}

type ConvertContainerFormat = 'mp4' | 'mkv' | 'webm' | 'mov'

type ConvertVideoCodecTarget = 'h264' | 'hevc' | 'vp9' | 'av1'

type ConvertAudioCodecTarget = 'aac' | 'opus' | 'copy'

type ConvertPerformanceMode = 'auto' | 'cpu'

type ConvertEncoderConfig = {
  name: string
  videoCodec: string
  inputOptions?: string[]
  outputOptions: (options: {
    crf: number
  }) => string[]
}

type JobController = {
  canceled: boolean
  scopeDepth: number
  activeCommands: Set<ffmpeg.FfmpegCommand>
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

const EXPORT_PRIMARY_X264_PRESET = process.env.BATCHCLIP_EXPORT_PRESET || 'medium'
const EXPORT_FALLBACK_X264_PRESET = process.env.BATCHCLIP_EXPORT_PRESET_FALLBACK || 'slow'
const MAX_PROBE_CACHE_ENTRIES = 128
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g
const BYTES_PER_MEGABYTE = 1024 * 1024
const MIN_SPLIT_CLIP_DURATION_SEC = 0.2
const MAX_SPLIT_SEGMENTS = 10000
const JOB_CANCELED_ERROR_MESSAGE = 'Job canceled by user'

const EXPORT_WINDOWS_NVENC_ENCODER: ExportEncoderConfig = {
  name: 'h264_nvenc',
  videoCodec: 'h264_nvenc',
  outputOptions: ['-preset', 'p6', '-tune', 'hq', '-rc', 'vbr_hq']
}

const EXPORT_WINDOWS_QSV_ENCODER: ExportEncoderConfig = {
  name: 'h264_qsv',
  videoCodec: 'h264_qsv',
  outputOptions: ['-look_ahead', '0']
}

const EXPORT_WINDOWS_AMF_ENCODER: ExportEncoderConfig = {
  name: 'h264_amf',
  videoCodec: 'h264_amf',
  outputOptions: ['-quality', 'quality']
}

const EXPORT_DARWIN_VIDEOTOOLBOX_ENCODER: ExportEncoderConfig = {
  name: 'h264_videotoolbox',
  videoCodec: 'h264_videotoolbox',
  outputOptions: ['-allow_sw', '1']
}

const LUT_EXPORT_VIDEO_BITRATE_SCALE = 1.12
const LUT_EXPORT_VIDEO_MAXRATE_SCALE = 1.28
const LUT_EXPORT_VIDEO_BUFSIZE_SCALE = 2.0
const LUT_EXPORT_MIN_VIDEO_BITRATE_KBPS = 600
const LUT_EXPORT_MAX_VIDEO_BITRATE_KBPS = 120000
const LUT_EXPORT_FALLBACK_AAC_BITRATE_KBPS = 192
const LUT_EXPORT_MIN_AAC_BITRATE_KBPS = 96
const LUT_EXPORT_MAX_AAC_BITRATE_KBPS = 512

const DEFAULT_CONVERT_CRF = 23
const MIN_CONVERT_CRF = 0
const MAX_CONVERT_CRF = 51
const MAX_CONVERT_THREADS = 16
const DEFAULT_CONVERT_THREADS = Math.max(1, Math.min(MAX_CONVERT_THREADS, os.cpus().length || 1))

const CONVERT_FORMAT_EXTENSION_MAP: Record<ConvertContainerFormat, string> = {
  mp4: '.mp4',
  mkv: '.mkv',
  webm: '.webm',
  mov: '.mov'
}

const CONVERT_FORMAT_MUXER_MAP: Record<ConvertContainerFormat, string> = {
  mp4: 'mp4',
  mkv: 'matroska',
  webm: 'webm',
  mov: 'mov'
}

const CONVERT_FORMAT_DEFAULT_VIDEO_CODEC: Record<ConvertContainerFormat, ConvertVideoCodecTarget> = {
  mp4: 'h264',
  mkv: 'h264',
  webm: 'vp9',
  mov: 'h264'
}

const CONVERT_FORMAT_DEFAULT_AUDIO_CODEC: Record<ConvertContainerFormat, ConvertAudioCodecTarget> = {
  mp4: 'aac',
  mkv: 'aac',
  webm: 'opus',
  mov: 'aac'
}

const CONVERT_FORMAT_ALLOWED_VIDEO_CODECS: Record<ConvertContainerFormat, Set<ConvertVideoCodecTarget>> = {
  mp4: new Set<ConvertVideoCodecTarget>(['h264', 'hevc', 'av1']),
  mkv: new Set<ConvertVideoCodecTarget>(['h264', 'hevc', 'vp9', 'av1']),
  webm: new Set<ConvertVideoCodecTarget>(['vp9', 'av1']),
  mov: new Set<ConvertVideoCodecTarget>(['h264', 'hevc'])
}

const CONVERT_FORMAT_ALLOWED_AUDIO_CODECS: Record<ConvertContainerFormat, Set<ConvertAudioCodecTarget>> = {
  mp4: new Set<ConvertAudioCodecTarget>(['aac']),
  mkv: new Set<ConvertAudioCodecTarget>(['aac', 'opus', 'copy']),
  webm: new Set<ConvertAudioCodecTarget>(['opus']),
  mov: new Set<ConvertAudioCodecTarget>(['aac'])
}

const unsupportedConvertEncoders = new Set<string>()

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function getOrCreateJobController(jobId: string): JobController {
  const existing = jobControllers.get(jobId)
  if (existing) {
    return existing
  }

  const created: JobController = {
    canceled: false,
    scopeDepth: 0,
    activeCommands: new Set<ffmpeg.FfmpegCommand>()
  }
  jobControllers.set(jobId, created)
  return created
}

function cleanupJobControllerIfIdle(jobId: string): void {
  const controller = jobControllers.get(jobId)
  if (!controller) {
    return
  }

  if (controller.scopeDepth <= 0 && controller.activeCommands.size === 0) {
    jobControllers.delete(jobId)
  }
}

function beginJobScope(jobId: string | null): (() => void) | null {
  if (!jobId) {
    return null
  }

  const controller = getOrCreateJobController(jobId)
  controller.scopeDepth += 1

  return () => {
    const current = jobControllers.get(jobId)
    if (!current) {
      return
    }

    current.scopeDepth = Math.max(0, current.scopeDepth - 1)
    cleanupJobControllerIfIdle(jobId)
  }
}

function registerJobCommand(jobId: string | null, command: ffmpeg.FfmpegCommand): () => void {
  if (!jobId) {
    return () => {}
  }

  const controller = getOrCreateJobController(jobId)
  controller.activeCommands.add(command)

  if (controller.canceled) {
    try {
      command.kill('SIGKILL')
    } catch (error) {
      console.warn(`[BatchClip] Failed to kill canceled job command: ${jobId}`, error)
    }
  }

  return () => {
    const current = jobControllers.get(jobId)
    if (!current) {
      return
    }

    current.activeCommands.delete(command)
    cleanupJobControllerIfIdle(jobId)
  }
}

function isJobMarkedCanceled(jobId: string | null): boolean {
  if (!jobId) {
    return false
  }
  return jobControllers.get(jobId)?.canceled ?? false
}

function createJobCanceledError(): Error {
  const error = new Error(JOB_CANCELED_ERROR_MESSAGE)
  error.name = 'BatchClipJobCanceledError'
  return error
}

function isJobCanceledError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return error.name === 'BatchClipJobCanceledError' || error.message === JOB_CANCELED_ERROR_MESSAGE
}

function throwIfJobCanceled(jobId: string | null): void {
  if (isJobMarkedCanceled(jobId)) {
    throw createJobCanceledError()
  }
}

function cancelRunningJob(jobId: string): boolean {
  const controller = jobControllers.get(jobId)
  if (!controller) {
    return false
  }

  controller.canceled = true
  for (const command of controller.activeCommands) {
    try {
      command.kill('SIGKILL')
    } catch (error) {
      console.warn(`[BatchClip] Failed to kill command for canceled job: ${jobId}`, error)
    }
  }

  return true
}

function normalizeTagLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length > 0 ? normalized : null
}

function sanitizeFilenamePart(value: string): string {
  const sanitized = Array.from(value.replace(INVALID_FILENAME_CHARS, ''))
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized.replace(/\.+$/, '')
}

function resolveStreamCopyOutputExtension(filePath: string): string {
  const sourceExt = path.extname(filePath).toLowerCase()
  if (!sourceExt) {
    return '.mp4'
  }

  // .m4s is a DASH segment container and is not a suitable output target for clip exports.
  if (sourceExt === '.m4s') {
    return '.mp4'
  }

  return sourceExt
}

function normalizeSegmentTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const tags: string[] = []
  const dedupeSet = new Set<string>()

  for (const item of value) {
    const normalized = normalizeTagLabel(item)
    if (!normalized) {
      continue
    }

    const dedupeKey = normalized.toLowerCase()
    if (dedupeSet.has(dedupeKey)) {
      continue
    }
    dedupeSet.add(dedupeKey)
    tags.push(normalized)
  }

  return tags
}

function buildClipOutputBaseName(baseName: string, clipIndex: number, tags: string[]): string {
  const safeBaseName = sanitizeFilenamePart(baseName) || baseName
  const clipBaseName = `${safeBaseName}_clip_${clipIndex.toString().padStart(2, '0')}`
  const tagPrefix = tags
    .map((tag) => sanitizeFilenamePart(tag))
    .filter((tag) => tag.length > 0)
    .join('_')

  if (!tagPrefix) {
    return clipBaseName
  }

  return `${tagPrefix}_${clipBaseName}`
}

function buildSizeSplitOutputBaseName(baseName: string, clipIndex: number): string {
  const safeBaseName = sanitizeFilenamePart(baseName) || baseName
  return `${safeBaseName}_clip${clipIndex.toString().padStart(2, '0')}`
}

function resolveSourceBitRateKbps(info: ProbeVideoInfo): number | null {
  if (info.formatBitRateKbps && info.formatBitRateKbps > 0) {
    return info.formatBitRateKbps
  }

  const videoBitRate = info.stream?.bit_rate_kbps ?? null
  const audioBitRate = info.audioStream?.bit_rate_kbps ?? null
  if (videoBitRate && videoBitRate > 0 && audioBitRate && audioBitRate > 0) {
    return videoBitRate + audioBitRate
  }

  if (videoBitRate && videoBitRate > 0) {
    return videoBitRate
  }

  if (audioBitRate && audioBitRate > 0) {
    return audioBitRate
  }

  return null
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

async function isRecoverableSizeSplitFfmpegFailure(options: {
  outputPath: string
  errorMessage: string
  stderrOutput: string
}): Promise<boolean> {
  const { outputPath, errorMessage, stderrOutput } = options
  const normalized = `${errorMessage}\n${stderrOutput}`.toLowerCase()
  const fatalPatterns = [
    /no space left on device/,
    /permission denied/,
    /operation not permitted/,
    /invalid argument/,
    /input\/output error/,
    /i\/o error/,
    /resource busy/,
    /device not configured/
  ]
  if (fatalPatterns.some((pattern) => pattern.test(normalized))) {
    return false
  }

  const hasExpectedFailureMarker = normalized.includes('conversion failed')
    || normalized.includes('ffmpeg exited with code')
    || normalized.includes('lsize=')
  if (!hasExpectedFailureMarker) {
    return false
  }

  try {
    const stat = await fs.promises.stat(outputPath)
    if (!stat.isFile() || stat.size <= 0) {
      return false
    }

    const clipInfo = await probeVideoInfo(outputPath)
    return !!clipInfo.stream && !!clipInfo.durationSec && clipInfo.durationSec > MIN_SPLIT_CLIP_DURATION_SEC
  } catch {
    return false
  }
}

function runFfmpegCommand(command: ffmpeg.FfmpegCommand, options?: {
  jobId?: string | null
}): Promise<void> {
  const jobId = options?.jobId ?? null
  return new Promise((resolve, reject) => {
    let settled = false
    const unregisterCommand = registerJobCommand(jobId, command)
    const settleOnce = (handler: () => void) => {
      if (settled) {
        return
      }

      settled = true
      unregisterCommand()
      handler()
    }

    command
      .on('end', () => settleOnce(resolve))
      .on('error', (error: Error) => {
        if (isJobMarkedCanceled(jobId)) {
          settleOnce(() => reject(createJobCanceledError()))
          return
        }
        settleOnce(() => reject(error))
      })

    try {
      throwIfJobCanceled(jobId)
      command.run()
    } catch (error) {
      settleOnce(() => reject(error instanceof Error ? error : new Error(String(error))))
    }
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

function normalizeConvertFormat(value: unknown): ConvertContainerFormat {
  if (value === 'mkv' || value === 'webm' || value === 'mov') {
    return value
  }
  return 'mp4'
}

function normalizeConvertVideoCodec(value: unknown): ConvertVideoCodecTarget {
  if (value === 'hevc' || value === 'vp9' || value === 'av1') {
    return value
  }
  return 'h264'
}

function normalizeConvertAudioCodec(value: unknown): ConvertAudioCodecTarget {
  if (value === 'opus' || value === 'copy') {
    return value
  }
  return 'aac'
}

function normalizeConvertPerformanceMode(value: unknown): ConvertPerformanceMode {
  if (value === 'cpu') {
    return 'cpu'
  }
  return 'auto'
}

function normalizeConvertCrf(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return DEFAULT_CONVERT_CRF
  }
  return Math.min(MAX_CONVERT_CRF, Math.max(MIN_CONVERT_CRF, Math.round(numeric)))
}

function resolveConvertThreadCount(): number {
  const cpuCount = os.cpus().length
  if (!Number.isFinite(cpuCount) || cpuCount <= 0) {
    return DEFAULT_CONVERT_THREADS
  }
  return Math.max(1, Math.min(MAX_CONVERT_THREADS, Math.floor(cpuCount)))
}

function ensureCompatibleConvertVideoCodec(
  format: ConvertContainerFormat,
  videoCodec: ConvertVideoCodecTarget
): ConvertVideoCodecTarget {
  const allowed = CONVERT_FORMAT_ALLOWED_VIDEO_CODECS[format]
  if (allowed.has(videoCodec)) {
    return videoCodec
  }
  return CONVERT_FORMAT_DEFAULT_VIDEO_CODEC[format]
}

function ensureCompatibleConvertAudioCodec(
  format: ConvertContainerFormat,
  audioCodec: ConvertAudioCodecTarget
): ConvertAudioCodecTarget {
  const allowed = CONVERT_FORMAT_ALLOWED_AUDIO_CODECS[format]
  if (allowed.has(audioCodec)) {
    return audioCodec
  }
  return CONVERT_FORMAT_DEFAULT_AUDIO_CODEC[format]
}

function isUnsupportedEncoderError(errorMessage: string): boolean {
  return /unknown encoder|encoder .* not found|unable to find an encoder/i.test(errorMessage)
}

function mapCrfToVideoToolboxQuality(crf: number): number {
  const normalized = Math.min(MAX_CONVERT_CRF, Math.max(MIN_CONVERT_CRF, crf))
  const quality = Math.round(((MAX_CONVERT_CRF - normalized) / MAX_CONVERT_CRF) * 100)
  return Math.min(100, Math.max(1, quality))
}

function mapCrfToVpxCrf(crf: number): number {
  return Math.min(63, Math.max(0, Math.round((crf / MAX_CONVERT_CRF) * 63)))
}

function mapCrfToAv1Crf(crf: number): number {
  return Math.min(63, Math.max(0, Math.round((crf / MAX_CONVERT_CRF) * 63)))
}

function clampLutExportBitrateKbps(value: number): number {
  return Math.min(
    LUT_EXPORT_MAX_VIDEO_BITRATE_KBPS,
    Math.max(LUT_EXPORT_MIN_VIDEO_BITRATE_KBPS, Math.round(value))
  )
}

function buildLutExportVideoBitrateOptions(sourceVideoBitRateKbps: number): string[] {
  const targetBitrateKbps = clampLutExportBitrateKbps(sourceVideoBitRateKbps * LUT_EXPORT_VIDEO_BITRATE_SCALE)
  const maxRateKbps = clampLutExportBitrateKbps(targetBitrateKbps * LUT_EXPORT_VIDEO_MAXRATE_SCALE)
  const bufferSizeKbps = clampLutExportBitrateKbps(targetBitrateKbps * LUT_EXPORT_VIDEO_BUFSIZE_SCALE)

  return [
    '-b:v', `${targetBitrateKbps}k`,
    '-maxrate', `${Math.max(targetBitrateKbps, maxRateKbps)}k`,
    '-bufsize', `${Math.max(targetBitrateKbps, bufferSizeKbps)}k`
  ]
}

function resolveLutFallbackAudioBitrateKbps(sourceAudioBitRateKbps: number | null): number {
  const candidate = sourceAudioBitRateKbps && Number.isFinite(sourceAudioBitRateKbps)
    ? Math.round(sourceAudioBitRateKbps)
    : LUT_EXPORT_FALLBACK_AAC_BITRATE_KBPS
  return Math.min(LUT_EXPORT_MAX_AAC_BITRATE_KBPS, Math.max(LUT_EXPORT_MIN_AAC_BITRATE_KBPS, candidate))
}

function isLikelyAudioCopyFailure(errorMessage: string): boolean {
  return /audio|codec .* not currently supported in container|could not find tag for codec|could not write header/i.test(errorMessage)
}

function buildConvertEncoderAttempts(options: {
  videoCodec: ConvertVideoCodecTarget
  performanceMode: ConvertPerformanceMode
}): ConvertEncoderConfig[] {
  const { videoCodec, performanceMode } = options
  const attempts: ConvertEncoderConfig[] = []
  const shouldUseHardware = performanceMode === 'auto'

  const pushEncoder = (encoder: ConvertEncoderConfig) => {
    const duplicated = attempts.some((item) => item.name === encoder.name && item.videoCodec === encoder.videoCodec)
    if (!duplicated) {
      attempts.push(encoder)
    }
  }

  if (shouldUseHardware) {
    if (process.platform === 'win32') {
      if (videoCodec === 'h264') {
        pushEncoder({
          name: 'h264_nvenc',
          videoCodec: 'h264_nvenc',
          inputOptions: ['-hwaccel', 'auto'],
          outputOptions: ({ crf }) => ['-preset', 'p4', '-rc', 'vbr', '-cq', `${crf}`, '-b:v', '0']
        })
        pushEncoder({
          name: 'h264_qsv',
          videoCodec: 'h264_qsv',
          inputOptions: ['-hwaccel', 'auto'],
          outputOptions: ({ crf }) => ['-look_ahead', '0', '-global_quality', `${crf}`]
        })
        pushEncoder({
          name: 'h264_amf',
          videoCodec: 'h264_amf',
          inputOptions: ['-hwaccel', 'auto'],
          outputOptions: ({ crf }) => ['-quality', 'balanced', '-rc', 'cqp', '-qp_i', `${crf}`, '-qp_p', `${crf}`]
        })
      } else if (videoCodec === 'hevc') {
        pushEncoder({
          name: 'hevc_nvenc',
          videoCodec: 'hevc_nvenc',
          inputOptions: ['-hwaccel', 'auto'],
          outputOptions: ({ crf }) => ['-preset', 'p4', '-rc', 'vbr', '-cq', `${crf}`, '-b:v', '0']
        })
        pushEncoder({
          name: 'hevc_qsv',
          videoCodec: 'hevc_qsv',
          inputOptions: ['-hwaccel', 'auto'],
          outputOptions: ({ crf }) => ['-look_ahead', '0', '-global_quality', `${crf}`]
        })
        pushEncoder({
          name: 'hevc_amf',
          videoCodec: 'hevc_amf',
          inputOptions: ['-hwaccel', 'auto'],
          outputOptions: ({ crf }) => ['-quality', 'balanced', '-rc', 'cqp', '-qp_i', `${crf}`, '-qp_p', `${crf}`]
        })
      } else if (videoCodec === 'av1') {
        pushEncoder({
          name: 'av1_nvenc',
          videoCodec: 'av1_nvenc',
          inputOptions: ['-hwaccel', 'auto'],
          outputOptions: ({ crf }) => ['-preset', 'p4', '-rc', 'vbr', '-cq', `${crf}`, '-b:v', '0']
        })
        pushEncoder({
          name: 'av1_qsv',
          videoCodec: 'av1_qsv',
          inputOptions: ['-hwaccel', 'auto'],
          outputOptions: ({ crf }) => ['-look_ahead', '0', '-global_quality', `${crf}`]
        })
        pushEncoder({
          name: 'av1_amf',
          videoCodec: 'av1_amf',
          inputOptions: ['-hwaccel', 'auto'],
          outputOptions: ({ crf }) => ['-quality', 'balanced', '-rc', 'cqp', '-qp_i', `${crf}`, '-qp_p', `${crf}`]
        })
      }
    } else if (process.platform === 'darwin') {
      if (videoCodec === 'h264') {
        pushEncoder({
          name: 'h264_videotoolbox',
          videoCodec: 'h264_videotoolbox',
          outputOptions: ({ crf }) => ['-allow_sw', '1', '-q:v', `${mapCrfToVideoToolboxQuality(crf)}`]
        })
      } else if (videoCodec === 'hevc') {
        pushEncoder({
          name: 'hevc_videotoolbox',
          videoCodec: 'hevc_videotoolbox',
          outputOptions: ({ crf }) => ['-allow_sw', '1', '-q:v', `${mapCrfToVideoToolboxQuality(crf)}`]
        })
      } else if (videoCodec === 'av1') {
        pushEncoder({
          name: 'av1_videotoolbox',
          videoCodec: 'av1_videotoolbox',
          outputOptions: ({ crf }) => ['-allow_sw', '1', '-q:v', `${mapCrfToVideoToolboxQuality(crf)}`]
        })
      }
    }
  }

  if (videoCodec === 'h264') {
    pushEncoder({
      name: `libx264-${EXPORT_PRIMARY_X264_PRESET}`,
      videoCodec: 'libx264',
      outputOptions: ({ crf }) => ['-preset', EXPORT_PRIMARY_X264_PRESET, '-crf', `${crf}`]
    })
    if (EXPORT_FALLBACK_X264_PRESET !== EXPORT_PRIMARY_X264_PRESET) {
      pushEncoder({
        name: `libx264-${EXPORT_FALLBACK_X264_PRESET}`,
        videoCodec: 'libx264',
        outputOptions: ({ crf }) => ['-preset', EXPORT_FALLBACK_X264_PRESET, '-crf', `${crf}`]
      })
    }
  } else if (videoCodec === 'hevc') {
    pushEncoder({
      name: `libx265-${EXPORT_PRIMARY_X264_PRESET}`,
      videoCodec: 'libx265',
      outputOptions: ({ crf }) => ['-preset', EXPORT_PRIMARY_X264_PRESET, '-crf', `${crf}`]
    })
    if (EXPORT_FALLBACK_X264_PRESET !== EXPORT_PRIMARY_X264_PRESET) {
      pushEncoder({
        name: `libx265-${EXPORT_FALLBACK_X264_PRESET}`,
        videoCodec: 'libx265',
        outputOptions: ({ crf }) => ['-preset', EXPORT_FALLBACK_X264_PRESET, '-crf', `${crf}`]
      })
    }
  } else if (videoCodec === 'vp9') {
    pushEncoder({
      name: 'libvpx-vp9',
      videoCodec: 'libvpx-vp9',
      outputOptions: ({ crf }) => ['-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-crf', `${mapCrfToVpxCrf(crf)}`, '-b:v', '0']
    })
    pushEncoder({
      name: 'libvpx-vp9-fast',
      videoCodec: 'libvpx-vp9',
      outputOptions: ({ crf }) => ['-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-crf', `${mapCrfToVpxCrf(crf)}`, '-b:v', '0']
    })
  } else if (videoCodec === 'av1') {
    pushEncoder({
      name: 'libsvtav1',
      videoCodec: 'libsvtav1',
      outputOptions: ({ crf }) => ['-crf', `${mapCrfToAv1Crf(crf)}`, '-preset', '6']
    })
    pushEncoder({
      name: 'libaom-av1',
      videoCodec: 'libaom-av1',
      outputOptions: ({ crf }) => ['-crf', `${mapCrfToAv1Crf(crf)}`, '-b:v', '0', '-cpu-used', '4']
    })
  }

  return attempts
}

function buildExportOutputOptions(options: {
  encoder: ExportEncoderConfig
  lutPath?: string | null
  lutIntensity?: number
  sourceVideoBitRateKbps?: number | null
}): string[] {
  const {
    encoder,
    lutPath = null,
    lutIntensity = 100,
    sourceVideoBitRateKbps = null
  } = options

  const outputOptions = [
    '-movflags', 'use_metadata_tags',
    ...encoder.outputOptions
  ]

  const lutFilterGraph = buildLutFilterGraph(lutPath, lutIntensity)
  if (lutFilterGraph) {
    outputOptions.push('-vf', lutFilterGraph)
  }

  if (sourceVideoBitRateKbps && sourceVideoBitRateKbps > 0) {
    outputOptions.push(...buildLutExportVideoBitrateOptions(sourceVideoBitRateKbps))
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
  jobId?: string | null
  onProgress?: (percent: number) => void
}): Promise<string> {
  const { durationSec = null, lutPath = null, lutIntensity = 100, jobId = null, onProgress } = options ?? {}
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
      await runFfmpegCommand(command, { jobId })
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
  jobId?: string | null
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
    jobId = null,
    onProgress
  } = options

  const shouldApplyLut = Boolean(lutPath)
  if (!shouldApplyLut) {
    const command = ffmpeg(filePath)
      .setStartTime(startSec)
      .setDuration(durationSec)
      .output(outputPath)
      .outputOptions([
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-dn',
        '-avoid_negative_ts', 'make_zero'
      ])
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

    await runFfmpegCommand(command, { jobId })
    return
  }

  const encoderAttempts = getExportEncoderAttempts()
  let lastErrorMessage = 'Failed to export clip'
  const fallbackAudioBitrateKbps = resolveLutFallbackAudioBitrateKbps(sourceAudioBitRateKbps)

  for (let index = 0; index < encoderAttempts.length; index++) {
    const encoder = encoderAttempts[index]
    const outputOptions = buildExportOutputOptions({
      encoder,
      lutPath,
      lutIntensity,
      sourceVideoBitRateKbps
    })

    const runEncodedClip = async (audioMode: 'copy' | 'aac') => {
      const command = ffmpeg(filePath)
        .setStartTime(startSec)
        .setDuration(durationSec)
        .output(outputPath)
        .videoCodec(encoder.videoCodec)
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

      if (audioMode === 'copy') {
        command.audioCodec('copy')
      } else {
        command.audioCodec('aac')
        command.audioBitrate(`${fallbackAudioBitrateKbps}k`)
      }

      await runFfmpegCommand(command, { jobId })
    }

    try {
      await runEncodedClip('copy')
      return
    } catch (copyError: unknown) {
      const copyErrorMessage = getErrorMessage(copyError)
      await removeFileIfExists(outputPath)

      if (isUnsupportedEncoderError(copyErrorMessage)) {
        lastErrorMessage = copyErrorMessage
        if (index < encoderAttempts.length - 1) {
          console.warn(`[BatchClip] Clip export encoder "${encoder.name}" failed, trying fallback.`, copyError)
        }
        continue
      }

      try {
        await runEncodedClip('aac')
        return
      } catch (aacError: unknown) {
        lastErrorMessage = getErrorMessage(aacError)
        await removeFileIfExists(outputPath)

        if (index < encoderAttempts.length - 1) {
          const errorToLog = isLikelyAudioCopyFailure(copyErrorMessage) ? aacError : copyError
          console.warn(`[BatchClip] Clip export encoder "${encoder.name}" failed, trying fallback.`, errorToLog)
        }
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
  jobId?: string | null
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
    jobId = null,
    onProgress
  } = options

  const encoderAttempts = getExportEncoderAttempts()
  let lastErrorMessage = 'Failed to export full video'
  const fallbackAudioBitrateKbps = resolveLutFallbackAudioBitrateKbps(sourceAudioBitRateKbps)

  for (let index = 0; index < encoderAttempts.length; index++) {
    const encoder = encoderAttempts[index]
    const outputOptions = buildExportOutputOptions({
      encoder,
      lutPath,
      lutIntensity,
      sourceVideoBitRateKbps
    })

    const runEncodedFullVideo = async (audioMode: 'copy' | 'aac') => {
      const command = ffmpeg(filePath)
        .output(outputPath)
        .videoCodec(encoder.videoCodec)
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

      if (audioMode === 'copy') {
        command.audioCodec('copy')
      } else {
        command.audioCodec('aac')
        command.audioBitrate(`${fallbackAudioBitrateKbps}k`)
      }

      await runFfmpegCommand(command, { jobId })
    }

    try {
      await runEncodedFullVideo('copy')
      return
    } catch (copyError: unknown) {
      const copyErrorMessage = getErrorMessage(copyError)
      await removeFileIfExists(outputPath)

      if (isUnsupportedEncoderError(copyErrorMessage)) {
        lastErrorMessage = copyErrorMessage
        if (index < encoderAttempts.length - 1) {
          console.warn(`[BatchClip] Full export encoder "${encoder.name}" failed, trying fallback.`, copyError)
        }
        continue
      }

      try {
        await runEncodedFullVideo('aac')
        return
      } catch (aacError: unknown) {
        lastErrorMessage = getErrorMessage(aacError)
        await removeFileIfExists(outputPath)

        if (index < encoderAttempts.length - 1) {
          const errorToLog = isLikelyAudioCopyFailure(copyErrorMessage) ? aacError : copyError
          console.warn(`[BatchClip] Full export encoder "${encoder.name}" failed, trying fallback.`, errorToLog)
        }
      }
    }
  }

  throw new Error(lastErrorMessage)
}

async function exportSingleConvertedVideo(options: {
  filePath: string
  outputPath: string
  format: ConvertContainerFormat
  videoCodec: ConvertVideoCodecTarget
  audioCodec: ConvertAudioCodecTarget
  crf: number
  performanceMode: ConvertPerformanceMode
  durationSec?: number | null
  jobId?: string | null
  onProgress?: (percent: number) => void
}): Promise<void> {
  const {
    filePath,
    outputPath,
    format,
    videoCodec,
    audioCodec,
    crf,
    performanceMode,
    durationSec = null,
    jobId = null,
    onProgress
  } = options

  const threadCount = resolveConvertThreadCount()
  const encoderAttempts = buildConvertEncoderAttempts({ videoCodec, performanceMode })
  const muxerFormat = CONVERT_FORMAT_MUXER_MAP[format]
  if (encoderAttempts.length === 0) {
    throw new Error('No available encoder for selected codec and performance mode')
  }

  let attemptedCount = 0
  let lastErrorMessage = 'Failed to convert video'

  for (let index = 0; index < encoderAttempts.length; index++) {
    const encoder = encoderAttempts[index]
    if (unsupportedConvertEncoders.has(encoder.videoCodec)) {
      continue
    }

    attemptedCount += 1
    const outputOptions = [
      '-threads', `${threadCount}`,
      '-pix_fmt', 'yuv420p',
      ...encoder.outputOptions({ crf })
    ]

    if (format === 'mp4' || format === 'mov') {
      outputOptions.unshift('+faststart')
      outputOptions.unshift('-movflags')
    }

    try {
      const command = ffmpeg(filePath)
        .output(outputPath)
        .format(muxerFormat)
        .videoCodec(encoder.videoCodec)
        .outputOptions(outputOptions)
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

      if (encoder.inputOptions && encoder.inputOptions.length > 0) {
        command.inputOptions(encoder.inputOptions)
      }

      if (audioCodec === 'copy') {
        command.audioCodec('copy')
      } else if (audioCodec === 'opus') {
        command.audioCodec('libopus')
        command.audioBitrate('160k')
      } else {
        command.audioCodec('aac')
        command.audioBitrate('160k')
      }

      await runFfmpegCommand(command, { jobId })

      return
    } catch (error: unknown) {
      lastErrorMessage = getErrorMessage(error)
      await removeFileIfExists(outputPath)

      if (isUnsupportedEncoderError(lastErrorMessage)) {
        unsupportedConvertEncoders.add(encoder.videoCodec)
      }

      if (index < encoderAttempts.length - 1) {
        console.warn(`[BatchClip] Convert encoder "${encoder.name}" failed, trying fallback.`, error)
      }
    }
  }

  if (attemptedCount === 0) {
    throw new Error('No compatible encoder available on current machine')
  }

  throw new Error(lastErrorMessage)
}

async function exportSingleSizeSplitClip(options: {
  filePath: string
  outputPath: string
  startSec: number
  targetSizeBytes: number
  estimatedDurationSec?: number
  jobId?: string | null
  onProgress?: (processedSeconds: number) => void
}): Promise<void> {
  const {
    filePath,
    outputPath,
    startSec,
    targetSizeBytes,
    estimatedDurationSec = 0,
    jobId = null,
    onProgress
  } = options

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg(filePath)
      .setStartTime(Math.max(0, startSec))
      .output(outputPath)
      .outputOptions([
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c', 'copy',
        '-dn',
        '-avoid_negative_ts', 'make_zero',
        '-fs', `${Math.max(1, Math.floor(targetSizeBytes))}`
      ])

    const unregisterCommand = registerJobCommand(jobId, command)
    let settled = false
    const settleOnce = (handler: () => void) => {
      if (settled) {
        return
      }
      settled = true
      unregisterCommand()
      handler()
    }

    command
      .on('progress', (progress) => {
        const processedSeconds = parseTimemarkToSeconds(progress.timemark)
        if (processedSeconds !== null) {
          onProgress?.(Math.max(0, processedSeconds))
          return
        }

        if (estimatedDurationSec > 0 && typeof progress.percent === 'number' && Number.isFinite(progress.percent)) {
          const fallbackProgressSeconds = (Math.min(100, Math.max(0, progress.percent)) / 100) * estimatedDurationSec
          onProgress?.(fallbackProgressSeconds)
        }
      })
      .on('end', () => settleOnce(resolve))
      .on('error', (error, _stdout, stderr) => {
        if (isJobMarkedCanceled(jobId)) {
          settleOnce(() => reject(createJobCanceledError()))
          return
        }

        void (async () => {
          const recoverable = await isRecoverableSizeSplitFfmpegFailure({
            outputPath,
            errorMessage: getErrorMessage(error),
            stderrOutput: typeof stderr === 'string' ? stderr : ''
          })
          if (recoverable) {
            console.warn(`[BatchClip] Recovered size-split clip from non-zero ffmpeg exit: ${outputPath}`)
            settleOnce(resolve)
            return
          }

          settleOnce(() => reject(error))
        })().catch((innerError) => {
          settleOnce(() => reject(innerError))
        })
      })

    try {
      throwIfJobCanceled(jobId)
      command.run()
    } catch (error) {
      settleOnce(() => reject(error instanceof Error ? error : new Error(String(error))))
    }
  })
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

function applyWindowTheme(theme: WindowTheme) {
  if (!win || win.isDestroyed()) {
    return
  }

  const config = WINDOW_THEME_CONFIG[theme]
  win.setBackgroundColor(config.backgroundColor)

  if (process.platform === 'win32') {
    win.setTitleBarOverlay({
      color: config.overlayColor,
      symbolColor: config.symbolColor,
      height: 32
    })
  }
}

function createWindow() {
  const initialTheme: WindowTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  const initialThemeConfig = WINDOW_THEME_CONFIG[initialTheme]

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: initialThemeConfig.backgroundColor,
    icon: path.join(process.env.VITE_PUBLIC, 'batchclip.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allow loading local files for now
    },
    titleBarStyle: 'hidden', // Custom title bar
    titleBarOverlay: {
      color: initialThemeConfig.overlayColor,
      symbolColor: initialThemeConfig.symbolColor,
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

ipcMain.handle('set-window-theme', (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Invalid payload' }
  }

  const data = payload as { theme?: unknown }
  if (data.theme !== 'dark' && data.theme !== 'light') {
    return { success: false, error: 'Invalid theme' }
  }

  applyWindowTheme(data.theme)
  return { success: true }
})

ipcMain.handle('open-external-link', async (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Invalid payload' }
  }

  const data = payload as { url?: unknown }
  if (typeof data.url !== 'string' || data.url.length === 0) {
    return { success: false, error: 'Invalid url' }
  }

  try {
    await shell.openExternal(data.url)
    return { success: true }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('cancel-job', (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return { success: false, canceled: false, error: 'Invalid payload' }
  }

  const data = payload as { jobId?: unknown }
  if (typeof data.jobId !== 'string' || data.jobId.length === 0) {
    return { success: false, canceled: false, error: 'Invalid jobId' }
  }

  const canceled = cancelRunningJob(data.jobId)
  return { success: true, canceled }
})


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
      jobId: progressJobId,
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

ipcMain.handle('process-size-split', async (event, { filePath, outputDir, targetSizeMb, jobId }) => {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: 'Invalid file path', results: [] }
  }

  if (!outputDir || typeof outputDir !== 'string') {
    return { success: false, error: 'Invalid output directory', results: [] }
  }

  const normalizedTargetSizeMb = Number(targetSizeMb)
  if (!Number.isFinite(normalizedTargetSizeMb) || normalizedTargetSizeMb <= 0) {
    return { success: false, error: 'Invalid target size', results: [] }
  }

  const targetSizeBytes = Math.max(1, Math.floor(normalizedTargetSizeMb * BYTES_PER_MEGABYTE))
  const results: Array<{ id: string; success: boolean; path?: string; error?: string }> = []

  const progressJobId = typeof jobId === 'string' && jobId ? jobId : null
  const releaseJobScope = beginJobScope(progressJobId)
  let lastReportedProgress = -1
  const emitExportProgress = (phase: 'start' | 'progress' | 'done', percent: number, currentClip = 0, totalClips = 0) => {
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

  try {
    throwIfJobCanceled(progressJobId)
    await fs.promises.mkdir(outputDir, { recursive: true })
    const sourceStat = await fs.promises.stat(filePath)
    if (!sourceStat.isFile() || sourceStat.size <= 0) {
      return { success: false, error: 'Source file is invalid or empty', results }
    }

    const sourceInfo = await probeVideoInfo(filePath)
    const totalDurationSec = sourceInfo.durationSec
    if (!totalDurationSec || !Number.isFinite(totalDurationSec) || totalDurationSec <= 0) {
      return { success: false, error: 'Unable to read source duration', results }
    }

    const estimatedTotalClips = Math.max(1, Math.ceil(sourceStat.size / targetSizeBytes))
    const sourceBitRateKbps = resolveSourceBitRateKbps(sourceInfo)
    const estimatedClipDurationSec = sourceBitRateKbps && sourceBitRateKbps > 0
      ? (targetSizeBytes * 8) / (sourceBitRateKbps * 1000)
      : totalDurationSec / estimatedTotalClips

    const safeEstimatedClipDurationSec = Math.max(MIN_SPLIT_CLIP_DURATION_SEC, estimatedClipDurationSec)
    const sourceExt = path.extname(filePath)
    const outputExt = resolveStreamCopyOutputExtension(filePath)
    const baseName = path.basename(filePath, sourceExt)

    emitExportProgress('start', 0, 0, estimatedTotalClips)

    let startSec = 0
    let clipIndex = 1

    while (startSec < totalDurationSec - 0.01) {
      throwIfJobCanceled(progressJobId)

      if (clipIndex > MAX_SPLIT_SEGMENTS) {
        throw new Error('Segment count exceeded safe limit')
      }

      const clipStartSec = startSec
      const outputBaseName = buildSizeSplitOutputBaseName(baseName, clipIndex)
      const outputPath = await buildUniqueOutputPath(outputDir, outputBaseName, outputExt)

      let maxProcessedSeconds = 0
      const reportSplitProgress = (processedSeconds: number) => {
        maxProcessedSeconds = Math.max(maxProcessedSeconds, processedSeconds)
        const absoluteProgressSeconds = Math.min(totalDurationSec, clipStartSec + maxProcessedSeconds)
        const percent = (absoluteProgressSeconds / totalDurationSec) * 100
        emitExportProgress('progress', percent, Math.min(clipIndex, estimatedTotalClips), estimatedTotalClips)
      }

      await exportSingleSizeSplitClip({
        filePath,
        outputPath,
        startSec: clipStartSec,
        targetSizeBytes,
        estimatedDurationSec: safeEstimatedClipDurationSec,
        jobId: progressJobId,
        onProgress: reportSplitProgress
      })

      const outputStat = await fs.promises.stat(outputPath)
      if (outputStat.size <= 0) {
        await removeFileIfExists(outputPath)
        throw new Error(`Split clip ${clipIndex} is empty`)
      }

      let clipDurationSec: number | null = null
      try {
        const clipInfo = await probeVideoInfo(outputPath)
        clipDurationSec = clipInfo.durationSec
      } catch {
        clipDurationSec = null
      }

      const safeClipDurationSec = clipDurationSec && Number.isFinite(clipDurationSec) && clipDurationSec > MIN_SPLIT_CLIP_DURATION_SEC
        ? clipDurationSec
        : (maxProcessedSeconds > MIN_SPLIT_CLIP_DURATION_SEC ? maxProcessedSeconds : safeEstimatedClipDurationSec)

      if (!Number.isFinite(safeClipDurationSec) || safeClipDurationSec <= 0) {
        await removeFileIfExists(outputPath)
        throw new Error('Failed to determine split clip duration')
      }

      startSec = Math.min(totalDurationSec, clipStartSec + safeClipDurationSec)
      results.push({
        id: `split-${clipIndex}`,
        success: true,
        path: outputPath
      })

      const currentClipCount = results.length
      const progressTotalClips = Math.max(currentClipCount, estimatedTotalClips)
      const percent = (startSec / totalDurationSec) * 100
      emitExportProgress('progress', percent, currentClipCount, progressTotalClips)

      clipIndex += 1
    }

    const finalClipCount = results.length
    emitExportProgress('done', 100, finalClipCount, finalClipCount)
    return { success: true, results }
  } catch (error: unknown) {
    if (isJobCanceledError(error) || isJobMarkedCanceled(progressJobId)) {
      const canceledPercent = lastReportedProgress >= 0 ? lastReportedProgress : 0
      emitExportProgress('done', canceledPercent, results.length, Math.max(results.length, 1))
      return { success: false, canceled: true, error: JOB_CANCELED_ERROR_MESSAGE, results }
    }

    const errorMessage = getErrorMessage(error)
    console.error('Size split failed:', error)
    emitExportProgress('done', 100, results.length, Math.max(results.length, 1))
    return { success: false, error: errorMessage, results }
  } finally {
    releaseJobScope?.()
  }
})

ipcMain.handle('process-batch', async (event, { filePath, outputDir, segments, lutPath, lutIntensity, jobId }) => {
  const progressJobId = typeof jobId === 'string' && jobId ? jobId : null

  const normalizedSegments: BatchSegmentInput[] = Array.isArray(segments)
    ? segments.reduce<BatchSegmentInput[]>((acc, segment) => {
        if (!segment || typeof segment !== 'object') {
          return acc
        }

        const candidate = segment as Record<string, unknown>
        const start = Number(candidate.start)
        const end = Number(candidate.end)
        if (typeof candidate.id !== 'string' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          return acc
        }

        acc.push({
          id: candidate.id,
          start,
          end,
          tags: candidate.tags
        })
        return acc
      }, [])
    : []

  const resolvedLutPath = await resolveLutPath(lutPath)
  const resolvedLutIntensity = normalizeLutIntensity(lutIntensity)
  const shouldApplyLut = Boolean(resolvedLutPath)
  let sourceVideoBitRateKbps: number | null = null
  let sourceAudioBitRateKbps: number | null = null
  if (shouldApplyLut) {
    const probeResult = await probeSourceInfoWithBitrates(filePath)
    sourceVideoBitRateKbps = probeResult.sourceVideoBitRateKbps
    sourceAudioBitRateKbps = probeResult.sourceAudioBitRateKbps
  }
  const totalSegments = normalizedSegments.length
  const results: Array<{ id: string; success: boolean; path?: string; error?: string }> = []
  console.log(`Batch processing ${totalSegments} clips from: ${filePath} (mode: ${shouldApplyLut ? `LUT ${path.basename(resolvedLutPath!)} @ ${resolvedLutIntensity}%` : 'stream-copy'})`)

  const releaseJobScope = beginJobScope(progressJobId)
  let lastReportedProgress = -1
  const emitExportProgress = (phase: 'start' | 'progress' | 'done', percent: number, currentClip = 0, totalClips = totalSegments) => {
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

  try {
    throwIfJobCanceled(progressJobId)
    emitExportProgress('start', 0, 0, totalSegments)

    // Ensure output dir exists
    await fs.promises.mkdir(outputDir, { recursive: true })

    const baseName = path.basename(filePath, path.extname(filePath))
    const outputExtension = shouldApplyLut
      ? '.mov'
      : resolveStreamCopyOutputExtension(filePath)

    for (let i = 0; i < totalSegments; i++) {
      throwIfJobCanceled(progressJobId)
      const seg = normalizedSegments[i]
      const duration = seg.end - seg.start
      const clipIndex = i + 1
      const segmentStartPercent = (i / Math.max(totalSegments, 1)) * 100
      const segmentWeight = 100 / Math.max(totalSegments, 1)
      const outName = `${buildClipOutputBaseName(baseName, clipIndex, normalizeSegmentTags(seg.tags))}${outputExtension}`
      const tempVidPath = path.join(outputDir, outName)

      console.log(`Processing clip ${clipIndex}: ${seg.start}-${seg.end} -> ${outName}`)
      emitExportProgress('progress', segmentStartPercent, clipIndex, totalSegments)

      try {
        let maxSegmentPercent = 0
        const emitSegmentProgress = (segmentPercent: number) => {
          maxSegmentPercent = Math.max(maxSegmentPercent, Math.min(100, Math.max(0, segmentPercent)))
          const overallPercent = segmentStartPercent + (maxSegmentPercent / 100) * segmentWeight
          emitExportProgress('progress', overallPercent, clipIndex, totalSegments)
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
          jobId: progressJobId,
          onProgress: emitSegmentProgress
        })

        emitExportProgress('progress', ((i + 1) / Math.max(totalSegments, 1)) * 100, clipIndex, totalSegments)
        results.push({ id: seg.id, success: true, path: tempVidPath })
      } catch (error: unknown) {
        await removeFileIfExists(tempVidPath)
        if (isJobCanceledError(error) || isJobMarkedCanceled(progressJobId)) {
          const canceledPercent = lastReportedProgress >= 0 ? lastReportedProgress : Math.round(segmentStartPercent)
          emitExportProgress('done', canceledPercent, i, totalSegments)
          return { success: false, canceled: true, error: JOB_CANCELED_ERROR_MESSAGE, results }
        }

        const errorMessage = getErrorMessage(error)
        console.error(`Error processing clip ${clipIndex}:`, error)
        emitExportProgress('progress', ((i + 1) / Math.max(totalSegments, 1)) * 100, clipIndex, totalSegments)
        results.push({ id: seg.id, success: false, error: errorMessage })
      }
    }

    emitExportProgress('done', 100, totalSegments, totalSegments)
    return { success: true, results }
  } catch (error: unknown) {
    if (isJobCanceledError(error) || isJobMarkedCanceled(progressJobId)) {
      const canceledPercent = lastReportedProgress >= 0 ? lastReportedProgress : 0
      emitExportProgress('done', canceledPercent, results.length, Math.max(totalSegments, 1))
      return { success: false, canceled: true, error: JOB_CANCELED_ERROR_MESSAGE, results }
    }

    emitExportProgress('done', 100, results.length, Math.max(totalSegments, 1))
    return { success: false, error: getErrorMessage(error), results }
  } finally {
    releaseJobScope?.()
  }
})

ipcMain.handle('process-lut-full-batch', async (event, { videos, outputDir, lutPath, lutIntensity, jobId }) => {
  const progressJobId = typeof jobId === 'string' && jobId ? jobId : null

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
  const releaseJobScope = beginJobScope(progressJobId)
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

  try {
    throwIfJobCanceled(progressJobId)
    emitExportProgress('start', 0, 0, totalVideos)
    await fs.promises.mkdir(outputDir, { recursive: true })

    for (let i = 0; i < normalizedVideos.length; i++) {
      throwIfJobCanceled(progressJobId)
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
          jobId: progressJobId,
          onProgress: emitVideoProgress
        })

        emitExportProgress('progress', ((i + 1) / Math.max(totalVideos, 1)) * 100, videoIndex, totalVideos)
        results.push({ id: entry.id, success: true, path: outputPath })
      } catch (error: unknown) {
        if (isJobCanceledError(error) || isJobMarkedCanceled(progressJobId)) {
          const canceledPercent = lastReportedProgress >= 0 ? lastReportedProgress : Math.round(segmentStartPercent)
          emitExportProgress('done', canceledPercent, i, totalVideos)
          return { success: false, canceled: true, error: JOB_CANCELED_ERROR_MESSAGE, results }
        }

        const errorMessage = getErrorMessage(error)
        console.error(`Error full-exporting video ${videoIndex}:`, error)
        emitExportProgress('progress', ((i + 1) / Math.max(totalVideos, 1)) * 100, videoIndex, totalVideos)
        results.push({ id: entry.id, success: false, error: errorMessage })
      }
    }

    emitExportProgress('done', 100, totalVideos, totalVideos)
    return { success: true, results }
  } catch (error: unknown) {
    if (isJobCanceledError(error) || isJobMarkedCanceled(progressJobId)) {
      const canceledPercent = lastReportedProgress >= 0 ? lastReportedProgress : 0
      emitExportProgress('done', canceledPercent, results.length, Math.max(totalVideos, 1))
      return { success: false, canceled: true, error: JOB_CANCELED_ERROR_MESSAGE, results }
    }

    emitExportProgress('done', 100, results.length, Math.max(totalVideos, 1))
    return { success: false, error: getErrorMessage(error), results }
  } finally {
    releaseJobScope?.()
  }
})

ipcMain.handle('process-convert-batch', async (event, {
  videos,
  outputDir,
  format,
  videoCodec,
  audioCodec,
  crf,
  performanceMode,
  jobId
}) => {
  if (!outputDir || typeof outputDir !== 'string') {
    return { success: false, error: 'Invalid output directory', results: [] }
  }

  const normalizedVideos = Array.isArray(videos)
    ? videos.filter((video) => (
      Boolean(video) &&
      typeof video.id === 'string' &&
      video.id.length > 0 &&
      typeof video.filePath === 'string' &&
      video.filePath.length > 0
    ))
    : []

  if (normalizedVideos.length === 0) {
    return { success: false, error: 'No videos selected', results: [] }
  }

  const normalizedFormat = normalizeConvertFormat(format)
  const normalizedVideoCodec = normalizeConvertVideoCodec(videoCodec)
  const normalizedAudioCodec = normalizeConvertAudioCodec(audioCodec)
  const normalizedPerformanceMode = normalizeConvertPerformanceMode(performanceMode)
  const normalizedCrf = normalizeConvertCrf(crf)

  const effectiveVideoCodec = ensureCompatibleConvertVideoCodec(normalizedFormat, normalizedVideoCodec)
  const effectiveAudioCodec = ensureCompatibleConvertAudioCodec(normalizedFormat, normalizedAudioCodec)
  const outputExtension = CONVERT_FORMAT_EXTENSION_MAP[normalizedFormat]

  const warnings: string[] = []
  if (effectiveVideoCodec !== normalizedVideoCodec) {
    warnings.push(`Video codec adjusted to ${effectiveVideoCodec} for ${normalizedFormat}`)
  }
  if (effectiveAudioCodec !== normalizedAudioCodec) {
    warnings.push(`Audio codec adjusted to ${effectiveAudioCodec} for ${normalizedFormat}`)
  }

  const totalVideos = normalizedVideos.length
  const results: Array<{ id: string; success: boolean; path?: string; error?: string }> = []
  const progressJobId = typeof jobId === 'string' && jobId ? jobId : null
  const releaseJobScope = beginJobScope(progressJobId)
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

  try {
    throwIfJobCanceled(progressJobId)
    await fs.promises.mkdir(outputDir, { recursive: true })
    emitExportProgress('start', 0, 0, totalVideos)

    for (let index = 0; index < normalizedVideos.length; index++) {
      throwIfJobCanceled(progressJobId)
      const entry = normalizedVideos[index]
      const videoIndex = index + 1
      const segmentStartPercent = (index / Math.max(totalVideos, 1)) * 100
      const segmentWeight = 100 / Math.max(totalVideos, 1)

      try {
        const baseName = path.basename(entry.filePath, path.extname(entry.filePath))
        const outputPath = await buildUniqueOutputPath(outputDir, `${baseName}_convert`, outputExtension)
        let durationSec: number | null = null
        try {
          const probeInfo = await probeVideoInfo(entry.filePath)
          durationSec = probeInfo.durationSec
        } catch {
          durationSec = null
        }

        let maxVideoPercent = 0
        const emitVideoProgress = (videoPercent: number) => {
          maxVideoPercent = Math.max(maxVideoPercent, Math.min(100, Math.max(0, videoPercent)))
          const overallPercent = segmentStartPercent + (maxVideoPercent / 100) * segmentWeight
          emitExportProgress('progress', overallPercent, videoIndex, totalVideos)
        }

        await exportSingleConvertedVideo({
          filePath: entry.filePath,
          outputPath,
          format: normalizedFormat,
          videoCodec: effectiveVideoCodec,
          audioCodec: effectiveAudioCodec,
          crf: normalizedCrf,
          performanceMode: normalizedPerformanceMode,
          durationSec,
          jobId: progressJobId,
          onProgress: emitVideoProgress
        })

        emitExportProgress('progress', ((index + 1) / Math.max(totalVideos, 1)) * 100, videoIndex, totalVideos)
        results.push({ id: entry.id, success: true, path: outputPath })
      } catch (error: unknown) {
        if (isJobCanceledError(error) || isJobMarkedCanceled(progressJobId)) {
          const canceledPercent = lastReportedProgress >= 0 ? lastReportedProgress : Math.round(segmentStartPercent)
          emitExportProgress('done', canceledPercent, index, totalVideos)
          return {
            success: false,
            canceled: true,
            error: JOB_CANCELED_ERROR_MESSAGE,
            results,
            warnings,
            settings: {
              format: normalizedFormat,
              videoCodec: effectiveVideoCodec,
              audioCodec: effectiveAudioCodec,
              crf: normalizedCrf,
              performanceMode: normalizedPerformanceMode
            }
          }
        }

        const errorMessage = getErrorMessage(error)
        emitExportProgress('progress', ((index + 1) / Math.max(totalVideos, 1)) * 100, videoIndex, totalVideos)
        results.push({ id: entry.id, success: false, error: errorMessage })
      }
    }

    emitExportProgress('done', 100, totalVideos, totalVideos)
    return {
      success: true,
      results,
      warnings,
      settings: {
        format: normalizedFormat,
        videoCodec: effectiveVideoCodec,
        audioCodec: effectiveAudioCodec,
        crf: normalizedCrf,
        performanceMode: normalizedPerformanceMode
      }
    }
  } catch (error: unknown) {
    if (isJobCanceledError(error) || isJobMarkedCanceled(progressJobId)) {
      const canceledPercent = lastReportedProgress >= 0 ? lastReportedProgress : 0
      emitExportProgress('done', canceledPercent, results.length, Math.max(results.length, 1))
      return {
        success: false,
        canceled: true,
        error: JOB_CANCELED_ERROR_MESSAGE,
        results,
        warnings,
        settings: {
          format: normalizedFormat,
          videoCodec: effectiveVideoCodec,
          audioCodec: effectiveAudioCodec,
          crf: normalizedCrf,
          performanceMode: normalizedPerformanceMode
        }
      }
    }

    emitExportProgress('done', 100, results.length, Math.max(results.length, 1))
    return {
      success: false,
      error: getErrorMessage(error),
      results,
      warnings,
      settings: {
        format: normalizedFormat,
        videoCodec: effectiveVideoCodec,
        audioCodec: effectiveAudioCodec,
        crf: normalizedCrf,
        performanceMode: normalizedPerformanceMode
      }
    }
  } finally {
    releaseJobScope?.()
  }
})
