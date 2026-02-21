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
      segments: { start: number, end: number, id: string }[],
      lutPath?: string,
      lutIntensity?: number,
      jobId?: string
    }) => Promise<{
      success: boolean;
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

    showOpenDialog: () => Promise<string | null>;
    showOpenLutDialog: () => Promise<string | null>;
    showSaveDialog: () => Promise<string | null>;




    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    off(channel: string, ...args: unknown[]): void;
    send(channel: string, ...args: unknown[]): void;
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  }
}
