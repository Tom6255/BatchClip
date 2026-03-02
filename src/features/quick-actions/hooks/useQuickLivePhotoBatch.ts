import { v4 as uuidv4 } from 'uuid';
import { useCallback, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { getFileNameFromPath, isSupportedVideoFile } from '../../../lib/video';
import type {
  ExportProgressController,
  QuickLivePhotoBatchSettings,
  QuickLivePhotoBatchVideoItem,
  TranslateFn
} from '../types';

const DEFAULT_LIVE_PHOTO_SETTINGS: QuickLivePhotoBatchSettings = {
  coverPositionPercent: 50,
  motionDurationSec: 3
};

const MIN_LIVE_PHOTO_MOTION_DURATION_SEC = 1.5;
const MAX_LIVE_PHOTO_MOTION_DURATION_SEC = 6;

const normalizeCoverPositionPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIVE_PHOTO_SETTINGS.coverPositionPercent;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const normalizeMotionDurationSec = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIVE_PHOTO_SETTINGS.motionDurationSec;
  }
  const rounded = Math.round(value * 10) / 10;
  return Math.min(MAX_LIVE_PHOTO_MOTION_DURATION_SEC, Math.max(MIN_LIVE_PHOTO_MOTION_DURATION_SEC, rounded));
};

interface UseQuickLivePhotoBatchParams {
  t: TranslateFn;
  exportController: ExportProgressController;
}

interface UseQuickLivePhotoBatchResult {
  quickLivePhotoBatchVideos: QuickLivePhotoBatchVideoItem[];
  quickLivePhotoSettings: QuickLivePhotoBatchSettings;
  setQuickLivePhotoSettings: Dispatch<SetStateAction<QuickLivePhotoBatchSettings>>;
  handleQuickLivePhotoBatchVideosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  clearQuickLivePhotoBatchVideos: () => void;
  removeQuickLivePhotoBatchVideo: (videoId: string) => void;
  updateQuickLivePhotoCoverPositionPercent: (value: number) => void;
  updateQuickLivePhotoMotionDurationSec: (value: number) => void;
  runQuickLivePhotoBatchExport: () => Promise<void>;
}

// EN: Manages quick "batch video to Live Photo" state and export flow.
// ZH: 管理“批量视频转实况照片”快捷功能的状态与导出流程。
export const useQuickLivePhotoBatch = ({
  t,
  exportController
}: UseQuickLivePhotoBatchParams): UseQuickLivePhotoBatchResult => {
  const [quickLivePhotoBatchVideos, setQuickLivePhotoBatchVideos] = useState<QuickLivePhotoBatchVideoItem[]>([]);
  const [quickLivePhotoSettings, setQuickLivePhotoSettings] = useState<QuickLivePhotoBatchSettings>(DEFAULT_LIVE_PHOTO_SETTINGS);

  const handleQuickLivePhotoBatchVideosChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';

    if (selectedFiles.length === 0) {
      return;
    }

    const validFiles = selectedFiles.filter((file) => isSupportedVideoFile(file));
    if (validFiles.length === 0) {
      alert(t('uploadVideoAlert'));
      return;
    }

    let missingPathCount = 0;
    setQuickLivePhotoBatchVideos((prev) => {
      const existingPathSet = new Set(prev.map((item) => item.filePath));
      const nextItems = [...prev];

      for (const file of validFiles) {
        const filePath = (file as File & { path?: string }).path ?? '';
        if (!filePath) {
          missingPathCount += 1;
          continue;
        }

        if (existingPathSet.has(filePath)) {
          continue;
        }

        existingPathSet.add(filePath);
        nextItems.push({
          id: uuidv4(),
          filePath,
          displayName: getFileNameFromPath(filePath),
          sizeBytes: file.size
        });
      }

      return nextItems;
    });

    if (missingPathCount > 0) {
      alert(t('pathError'));
    }
  }, [t]);

  const clearQuickLivePhotoBatchVideos = useCallback(() => {
    setQuickLivePhotoBatchVideos([]);
  }, []);

  const removeQuickLivePhotoBatchVideo = useCallback((videoId: string) => {
    setQuickLivePhotoBatchVideos((prev) => prev.filter((item) => item.id !== videoId));
  }, []);

  const updateQuickLivePhotoCoverPositionPercent = useCallback((value: number) => {
    setQuickLivePhotoSettings((prev) => ({
      ...prev,
      coverPositionPercent: normalizeCoverPositionPercent(value)
    }));
  }, []);

  const updateQuickLivePhotoMotionDurationSec = useCallback((value: number) => {
    setQuickLivePhotoSettings((prev) => ({
      ...prev,
      motionDurationSec: normalizeMotionDurationSec(value)
    }));
  }, []);

  const runQuickLivePhotoBatchExport = useCallback(async () => {
    try {
      if (quickLivePhotoBatchVideos.length === 0) {
        alert(t('quickLivePhotoNeedVideos'));
        return;
      }

      const normalizedMotionDurationSec = normalizeMotionDurationSec(quickLivePhotoSettings.motionDurationSec);
      if (!Number.isFinite(normalizedMotionDurationSec) || normalizedMotionDurationSec <= 0) {
        alert(t('quickLivePhotoInvalidDuration'));
        return;
      }

      const outputDir = await window.ipcRenderer.showOpenDialog();
      if (!outputDir) {
        return;
      }

      exportController.clearExportProgressTimer();
      const jobId = `quick-live-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      exportController.activeExportJobIdRef.current = jobId;
      exportController.activeExportContextRef.current = null;
      exportController.setExportMode('livephoto');
      exportController.setExportProgressPercent(0);
      exportController.setExportProgressClip({ current: 0, total: quickLivePhotoBatchVideos.length });
      exportController.setIsExporting(true);
      let exportCompleted = false;
      let exportCanceled = false;

      try {
        const result = await window.ipcRenderer.processLivePhotoBatch({
          videos: quickLivePhotoBatchVideos.map((video) => ({
            id: video.id,
            filePath: video.filePath
          })),
          outputDir,
          coverPositionPercent: normalizeCoverPositionPercent(quickLivePhotoSettings.coverPositionPercent),
          motionDurationSec: normalizedMotionDurationSec,
          jobId
        });

        if (result.canceled) {
          exportCanceled = true;
          alert(t('exportCanceled'));
          return;
        }

        const successCount = result.results.filter((item) => item.success).length;
        const warningLines = Array.isArray(result.warnings) && result.warnings.length > 0
          ? `\n${t('quickLivePhotoWarnings')}\n- ${result.warnings.join('\n- ')}`
          : '';
        exportCompleted = true;

        if (!result.success || successCount === 0 || successCount !== result.results.length) {
          const failedIdSet = new Set(result.results.filter((item) => !item.success).map((item) => item.id));
          const failedNames = quickLivePhotoBatchVideos
            .filter((item) => failedIdSet.has(item.id))
            .map((item) => item.displayName);
          const failedPreview = failedNames.slice(0, 3).join(', ');
          const failedSuffix = failedNames.length > 3 ? '...' : '';
          const summary = t('quickLivePhotoBatchPartialFailed', {
            failed: failedIdSet.size,
            total: quickLivePhotoBatchVideos.length,
            names: `${failedPreview}${failedSuffix}`
          });
          const failedReasonPreview = result.results
            .filter((item) => !item.success)
            .map((item) => (item.error ?? '').trim())
            .filter((reason) => reason.length > 0)
            .slice(0, 2)
            .join('\n');
          const detailReason = failedReasonPreview.length > 0
            ? failedReasonPreview
            : ((result.error ?? '').trim());
          const detailError = detailReason.length > 0 ? `\n${detailReason}` : '';
          alert(`${summary}${detailError}${warningLines}`);
        } else {
          alert(`${t('quickLivePhotoSuccess', { count: successCount })}${warningLines}`);
        }
      } finally {
        exportController.setIsExporting(false);
        if (exportController.activeExportJobIdRef.current === jobId) {
          exportController.activeExportJobIdRef.current = null;
          exportController.activeExportContextRef.current = null;
          if (exportCompleted && !exportCanceled) {
            exportController.setExportProgressPercent(100);
            exportController.clearExportProgressTimer();
            exportController.exportProgressHideTimerRef.current = window.setTimeout(() => {
              if (exportController.activeExportJobIdRef.current === null) {
                exportController.setExportProgressPercent(null);
                exportController.setExportProgressClip(null);
              }
              exportController.exportProgressHideTimerRef.current = null;
            }, 400);
          } else {
            exportController.setExportProgressPercent(null);
            exportController.setExportProgressClip(null);
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      exportController.setIsExporting(false);
      exportController.activeExportJobIdRef.current = null;
      exportController.activeExportContextRef.current = null;
      exportController.clearExportProgressTimer();
      exportController.setExportProgressPercent(null);
      exportController.setExportProgressClip(null);
      console.error('Quick live photo batch export error:', error);
      alert(t('quickLivePhotoFailed') + errorMessage);
    }
  }, [exportController, quickLivePhotoBatchVideos, quickLivePhotoSettings.coverPositionPercent, quickLivePhotoSettings.motionDurationSec, t]);

  return {
    quickLivePhotoBatchVideos,
    quickLivePhotoSettings,
    setQuickLivePhotoSettings,
    handleQuickLivePhotoBatchVideosChange,
    clearQuickLivePhotoBatchVideos,
    removeQuickLivePhotoBatchVideo,
    updateQuickLivePhotoCoverPositionPercent,
    updateQuickLivePhotoMotionDurationSec,
    runQuickLivePhotoBatchExport
  };
};
