import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

// EN: Shared domain types for Quick Actions.
// ZH: 快捷功能共享领域类型，避免在 App 与组件间重复定义。
export type ExportMode = 'clips' | 'full' | 'split' | 'convert';

export type ExportProgressClip = { current: number; total: number } | null;

export interface QuickLutBatchVideoItem {
  id: string;
  filePath: string;
  displayName: string;
  sizeBytes: number;
}

export type QuickConvertBatchVideoItem = QuickLutBatchVideoItem;

export type ConvertContainerFormat = 'mp4' | 'mkv' | 'webm' | 'mov';

export type ConvertVideoCodecTarget = 'h264' | 'hevc' | 'vp9' | 'av1' | 'prores';

export type ConvertAudioCodecTarget = 'aac' | 'opus' | 'copy';

export type ConvertPerformanceMode = 'auto' | 'cpu';

export type DefaultExportPreferenceMode = 'transcode' | 'source';

export interface DefaultExportPreference {
  mode: DefaultExportPreferenceMode;
  format: ConvertContainerFormat;
  videoCodec: ConvertVideoCodecTarget;
}

export interface QuickConvertBatchSettings {
  format: ConvertContainerFormat;
  videoCodec: ConvertVideoCodecTarget;
  audioCodec: ConvertAudioCodecTarget;
  crf: number;
  performanceMode: ConvertPerformanceMode;
}

export interface QuickConvertCustomTemplate {
  id: string;
  title: string;
  description: string;
  settings: QuickConvertBatchSettings;
}

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export interface ExportProgressController {
  clearExportProgressTimer: () => void;
  setExportMode: Dispatch<SetStateAction<ExportMode>>;
  setExportProgressPercent: Dispatch<SetStateAction<number | null>>;
  setExportProgressClip: Dispatch<SetStateAction<ExportProgressClip>>;
  setIsExporting: Dispatch<SetStateAction<boolean>>;
  activeExportJobIdRef: MutableRefObject<string | null>;
  activeExportContextRef: MutableRefObject<{ clipOffset: number; clipCount: number; totalClips: number } | null>;
  exportProgressHideTimerRef: MutableRefObject<number | null>;
}
