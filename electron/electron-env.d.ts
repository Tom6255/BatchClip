/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
  }
}

interface Window {
  ipcRenderer: {
    processVideo: (opts: {
      filePath: string,
      startTime: number,
      endTime: number,
      coverTime: number,
      targetPath: string
    }) => Promise<{ success: boolean }>;

    processBatch: (opts: {
      filePath: string,
      outputDir: string,
      segments: { start: number, end: number, id: string, tags?: string[] }[],
      lutPath?: string,
      lutIntensity?: number,
      jobId?: string
    }) => Promise<{
      success: boolean;
      canceled?: boolean;
      error?: string;
      results: Array<{
        id: string;
        success: boolean;
        path?: string;
        error?: string;
      }>;
    }>;

    processLutFullBatch: (opts: {
      videos: { id: string; filePath: string }[];
      outputDir: string;
      lutPath: string;
      lutIntensity?: number;
      jobId?: string;
    }) => Promise<{
      success: boolean;
      canceled?: boolean;
      error?: string;
      results: Array<{
        id: string;
        success: boolean;
        path?: string;
        error?: string;
      }>;
    }>;

    processSizeSplit: (opts: {
      filePath: string;
      outputDir: string;
      targetSizeMb: number;
      jobId?: string;
    }) => Promise<{
      success: boolean;
      canceled?: boolean;
      error?: string;
      results: Array<{
        id: string;
        success: boolean;
        path?: string;
        error?: string;
      }>;
    }>;

    processConvertBatch: (opts: {
      videos: { id: string; filePath: string }[];
      outputDir: string;
      format: 'mp4' | 'mkv' | 'webm' | 'mov';
      videoCodec: 'h264' | 'hevc' | 'vp9' | 'av1';
      audioCodec: 'aac' | 'opus' | 'copy';
      crf: number;
      performanceMode?: 'auto' | 'cpu';
      jobId?: string;
    }) => Promise<{
      success: boolean;
      canceled?: boolean;
      error?: string;
      warnings?: string[];
      settings?: {
        format: 'mp4' | 'mkv' | 'webm' | 'mov';
        videoCodec: 'h264' | 'hevc' | 'vp9' | 'av1';
        audioCodec: 'aac' | 'opus' | 'copy';
        crf: number;
        performanceMode: 'auto' | 'cpu';
      };
      results: Array<{
        id: string;
        success: boolean;
        path?: string;
        error?: string;
      }>;
    }>;

    preparePreview: (opts: {
      filePath: string;
      forceProxy?: boolean;
      lutPath?: string;
      lutIntensity?: number;
      jobId?: string;
    }) => Promise<{
      success: boolean;
      useProxy: boolean;
      url?: string;
      path?: string;
      suggestCompatibleMode?: boolean;
      error?: string;
    }>;

    cleanupPreview: (opts: {
      proxyPath: string
    }) => Promise<{ success: boolean; error?: string }>;

    readLutFile: (opts: {
      lutPath: string
    }) => Promise<{
      success: boolean;
      path?: string;
      content?: string;
      error?: string;
    }>;

    setWindowTheme: (opts: {
      theme: 'dark' | 'light';
    }) => Promise<{
      success: boolean;
      error?: string;
    }>;

    openExternalLink: (opts: {
      url: string;
    }) => Promise<{
      success: boolean;
      error?: string;
    }>;

    cancelJob: (opts: {
      jobId: string;
    }) => Promise<{
      success: boolean;
      canceled?: boolean;
      error?: string;
    }>;

    showOpenDialog: () => Promise<string | null>;
    showOpenLutDialog: () => Promise<string | null>;
    showSaveDialog: () => Promise<string | null>;




    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    off(channel: string, ...args: unknown[]): void;
    send(channel: string, ...args: unknown[]): void;
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  }
}
