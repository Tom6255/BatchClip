// EN: Centralized video file helpers for renderer UI and quick-action hooks.
// ZH: 统一管理视频文件辅助函数，供主界面与快捷功能 hooks 复用。

export const VIDEO_FILE_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.ts', '.m4s'];
export const VIDEO_FILE_ACCEPT = ['video/*', ...VIDEO_FILE_EXTENSIONS].join(',');

export const toFileUrl = (absolutePath: string) => {
  const normalized = absolutePath.replace(/\\/g, '/');
  return encodeURI(normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`);
};

export const getFileNameFromPath = (absolutePath: string) => {
  const parts = absolutePath.split(/[\\/]/);
  const fileName = parts[parts.length - 1];
  return fileName || absolutePath;
};

export const isSupportedVideoFile = (file: File) => {
  const fileName = file.name.toLowerCase();
  const hasVideoExtension = VIDEO_FILE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  return file.type.startsWith('video/') || hasVideoExtension;
};
