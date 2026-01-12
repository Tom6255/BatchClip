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
      segments: { start: number, end: number, id: string }[]
    }) => Promise<{ success: boolean; results: any[] }>;

    showOpenDialog: () => Promise<string | null>;
    showSaveDialog: () => Promise<string | null>;




    on(channel: string, listener: (event: any, ...args: any[]) => void): void;
    off(channel: string, ...args: any[]): void;
    send(channel: string, ...args: any[]): void;
    invoke(channel: string, ...args: any[]): Promise<any>;
  }
}
