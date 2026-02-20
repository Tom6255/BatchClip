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
    segments: { start: number, end: number, id: string }[],
    jobId?: string
  }) => ipcRenderer.invoke('process-batch', opts),

  preparePreview: (opts: {
    filePath: string,
    forceProxy?: boolean,
    jobId?: string
  }) => ipcRenderer.invoke('prepare-preview', opts),

  cleanupPreview: (opts: {
    proxyPath: string
  }) => ipcRenderer.invoke('cleanup-preview', opts),

  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog')
})
