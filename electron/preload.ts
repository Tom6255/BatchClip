import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // Specific API for Video Processing
  processBatch: (opts: {
    filePath: string,
    outputDir: string,
    segments: { start: number, end: number, id: string, tags?: string[] }[],
    lutPath?: string,
    lutIntensity?: number,
    defaultExportPreference?: {
      mode: 'transcode' | 'source',
      format: 'mp4' | 'mkv' | 'webm' | 'mov',
      videoCodec: 'h264' | 'hevc' | 'vp9' | 'av1' | 'prores'
    },
    jobId?: string
  }) => ipcRenderer.invoke('process-batch', opts),

  processLutFullBatch: (opts: {
    videos: { id: string, filePath: string }[],
    outputDir: string,
    lutPath: string,
    lutIntensity?: number,
    defaultExportPreference?: {
      mode: 'transcode' | 'source',
      format: 'mp4' | 'mkv' | 'webm' | 'mov',
      videoCodec: 'h264' | 'hevc' | 'vp9' | 'av1' | 'prores'
    },
    jobId?: string
  }) => ipcRenderer.invoke('process-lut-full-batch', opts),

  processSizeSplit: (opts: {
    filePath: string,
    outputDir: string,
    targetSizeMb: number,
    defaultExportPreference?: {
      mode: 'transcode' | 'source',
      format: 'mp4' | 'mkv' | 'webm' | 'mov',
      videoCodec: 'h264' | 'hevc' | 'vp9' | 'av1' | 'prores'
    },
    jobId?: string
  }) => ipcRenderer.invoke('process-size-split', opts),

  processConvertBatch: (opts: {
    videos: { id: string; filePath: string }[],
    outputDir: string,
    format: 'mp4' | 'mkv' | 'webm' | 'mov',
    videoCodec: 'h264' | 'hevc' | 'vp9' | 'av1' | 'prores',
    audioCodec: 'aac' | 'opus' | 'copy',
    crf: number,
    performanceMode?: 'auto' | 'cpu',
    jobId?: string
  }) => ipcRenderer.invoke('process-convert-batch', opts),

  processLivePhotoBatch: (opts: {
    videos: { id: string; filePath: string }[],
    outputDir: string,
    coverPositionPercent?: number,
    motionDurationSec?: number,
    jobId?: string
  }) => ipcRenderer.invoke('process-live-photo-batch', opts),

  preparePreview: (opts: {
    filePath: string,
    forceProxy?: boolean,
    lutPath?: string,
    lutIntensity?: number,
    jobId?: string
  }) => ipcRenderer.invoke('prepare-preview', opts),

  cleanupPreview: (opts: {
    proxyPath: string
  }) => ipcRenderer.invoke('cleanup-preview', opts),

  readLutFile: (opts: {
    lutPath: string
  }) => ipcRenderer.invoke('read-lut-file', opts),

  setWindowTheme: (opts: {
    theme: 'dark' | 'light'
  }) => ipcRenderer.invoke('set-window-theme', opts),

  openExternalLink: (opts: {
    url: string
  }) => ipcRenderer.invoke('open-external-link', opts),

  cancelJob: (opts: {
    jobId: string
  }) => ipcRenderer.invoke('cancel-job', opts),

  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showOpenLutDialog: () => ipcRenderer.invoke('show-open-lut-dialog'),
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog')
})
