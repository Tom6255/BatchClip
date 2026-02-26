import type {
  ConvertContainerFormat,
  ConvertVideoCodecTarget,
  DefaultExportPreference
} from '../../quick-actions/types';

export const DEFAULT_EXPORT_PREFERENCE_STORAGE_KEY = 'defaultExportPreference';

export const DEFAULT_EXPORT_PREFERENCE: DefaultExportPreference = {
  mode: 'transcode',
  format: 'mp4',
  videoCodec: 'h264'
};

export const DEFAULT_EXPORT_FORMAT_VIDEO_CODECS: Record<ConvertContainerFormat, ConvertVideoCodecTarget[]> = {
  mp4: ['h264', 'hevc', 'av1'],
  mkv: ['h264', 'hevc', 'vp9', 'av1'],
  webm: ['vp9', 'av1'],
  mov: ['h264', 'hevc', 'prores']
};

export const DEFAULT_EXPORT_FORMAT_DEFAULT_VIDEO_CODEC: Record<ConvertContainerFormat, ConvertVideoCodecTarget> = {
  mp4: 'h264',
  mkv: 'h264',
  webm: 'vp9',
  mov: 'h264'
};

export const normalizeDefaultExportFormat = (value: unknown): ConvertContainerFormat => {
  if (value === 'mkv' || value === 'webm' || value === 'mov') {
    return value;
  }
  return 'mp4';
};

export const normalizeDefaultExportVideoCodec = (value: unknown): ConvertVideoCodecTarget => {
  if (value === 'hevc' || value === 'vp9' || value === 'av1' || value === 'prores') {
    return value;
  }
  return 'h264';
};

export const ensureCompatibleDefaultExportVideoCodec = (
  format: ConvertContainerFormat,
  videoCodec: ConvertVideoCodecTarget
): ConvertVideoCodecTarget => {
  const allowed = DEFAULT_EXPORT_FORMAT_VIDEO_CODECS[format];
  if (allowed.includes(videoCodec)) {
    return videoCodec;
  }
  return DEFAULT_EXPORT_FORMAT_DEFAULT_VIDEO_CODEC[format];
};

export const normalizeDefaultExportPreference = (value: unknown): DefaultExportPreference => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_EXPORT_PREFERENCE };
  }

  const candidate = value as Record<string, unknown>;
  const mode = candidate.mode === 'source' ? 'source' : 'transcode';
  const format = normalizeDefaultExportFormat(candidate.format);
  const codec = ensureCompatibleDefaultExportVideoCodec(
    format,
    normalizeDefaultExportVideoCodec(candidate.videoCodec)
  );

  return {
    mode,
    format,
    videoCodec: codec
  };
};
