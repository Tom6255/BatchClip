import { v4 as uuidv4 } from 'uuid';
import { useCallback, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { getFileNameFromPath, isSupportedVideoFile } from '../../../lib/video';
import type {
  DefaultExportPreference,
  ExportProgressController,
  QuickLutBatchVideoItem,
  TranslateFn
} from '../types';

interface UseQuickSplitBySizeParams {
  t: TranslateFn;
  exportController: ExportProgressController;
  defaultExportPreference: DefaultExportPreference;
  defaultTargetSizeMb: number;
}

interface UseQuickSplitBySizeResult {
  quickSplitTargetSizeMb: number;
  setQuickSplitTargetSizeMb: Dispatch<SetStateAction<number>>;
  quickSplitSourceVideos: QuickLutBatchVideoItem[];
  handleQuickSplitSourceChange: (event: ChangeEvent<HTMLInputElement>) => void;
  clearQuickSplitSources: () => void;
  removeQuickSplitSource: (videoId: string) => void;
  runQuickSplitBySize: () => Promise<void>;
}

const resolveQuickSplitParallelism = (videoCount: number): number => {
  if (videoCount <= 0) {
    return 1;
  }

  const hardwareThreadCount = Number(navigator.hardwareConcurrency || 0);
  const preferredParallelism = Number.isFinite(hardwareThreadCount) && hardwareThreadCount >= 8 ? 3 : 2;
  return Math.max(1, Math.min(videoCount, preferredParallelism));
};

// EN: Encapsulates "split by target size" quick action state + side effects.
// ZH: 封装“按目标体积分割”快捷功能的状态与副作用，便于独立维护。
export const useQuickSplitBySize = ({
  t,
  exportController,
  defaultExportPreference,
  defaultTargetSizeMb
}: UseQuickSplitBySizeParams): UseQuickSplitBySizeResult => {
  const [quickSplitTargetSizeMb, setQuickSplitTargetSizeMb] = useState(defaultTargetSizeMb);
  const [quickSplitSourceVideos, setQuickSplitSourceVideos] = useState<QuickLutBatchVideoItem[]>([]);

  const handleQuickSplitSourceChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
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
    setQuickSplitSourceVideos((prev) => {
      const existingPathSet = new Set(prev.map((item) => item.filePath));
      const nextItems = [...prev];

      for (const file of validFiles) {
        const sourcePath = (file as File & { path?: string }).path ?? '';
        if (!sourcePath) {
          missingPathCount += 1;
          continue;
        }

        if (existingPathSet.has(sourcePath)) {
          continue;
        }

        existingPathSet.add(sourcePath);
        nextItems.push({
          id: uuidv4(),
          filePath: sourcePath,
          displayName: getFileNameFromPath(sourcePath),
          sizeBytes: file.size
        });
      }

      return nextItems;
    });

    if (missingPathCount > 0) {
      alert(t('pathError'));
    }
  }, [t]);

  const clearQuickSplitSources = useCallback(() => {
    setQuickSplitSourceVideos([]);
  }, []);

  const removeQuickSplitSource = useCallback((videoId: string) => {
    setQuickSplitSourceVideos((prev) => prev.filter((item) => item.id !== videoId));
  }, []);

  const runQuickSplitBySize = useCallback(async () => {
    try {
      if (quickSplitSourceVideos.length === 0) {
        alert(t('quickSplitNeedSource'));
        return;
      }

      const normalizedTargetSizeMb = Number(quickSplitTargetSizeMb);
      if (!Number.isFinite(normalizedTargetSizeMb) || normalizedTargetSizeMb <= 0) {
        alert(t('quickSplitInvalidTarget'));
        return;
      }

      const outputDir = await window.ipcRenderer.showOpenDialog();
      if (!outputDir) {
        return;
      }

      exportController.clearExportProgressTimer();
      const jobId = `split-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const videoJobs = quickSplitSourceVideos.map((videoItem, index) => ({
        videoItem,
        subJobId: `${jobId}:${index + 1}`
      }));
      exportController.activeExportJobIdRef.current = jobId;
      exportController.activeExportContextRef.current = {
        mode: 'multi',
        totalClips: videoJobs.length,
        clipProgressByJobId: Object.fromEntries(videoJobs.map((item) => [item.subJobId, 0]))
      };
      exportController.setExportMode('split');
      exportController.setExportProgressPercent(0);
      exportController.setExportProgressClip({ current: 0, total: quickSplitSourceVideos.length });
      exportController.setIsExporting(true);
      let splitCompleted = false;
      let splitCanceled = false;
      let totalSuccessCount = 0;
      const failedVideoDetails: Array<{ name: string; reason: string }> = [];
      const maxParallelJobs = resolveQuickSplitParallelism(videoJobs.length);

      try {
        let nextJobIndex = 0;
        const runSingleSplitJob = async (videoItem: QuickLutBatchVideoItem, subJobId: string) => {
          const result = await window.ipcRenderer.processSizeSplit({
            filePath: videoItem.filePath,
            outputDir,
            targetSizeMb: normalizedTargetSizeMb,
            defaultExportPreference,
            jobId: subJobId
          });
          if (result.canceled) {
            splitCanceled = true;
            return;
          }

          const successCount = result.results.filter((item) => item.success).length;
          totalSuccessCount += successCount;

          if (!result.success || successCount === 0 || successCount !== result.results.length) {
            const firstItemError = result.results.find((item) => !item.success && item.error)?.error;
            const fallbackReason = t('exportFailed');
            const rawReason = typeof result.error === 'string' && result.error.trim().length > 0
              ? result.error
              : (typeof firstItemError === 'string' && firstItemError.trim().length > 0 ? firstItemError : fallbackReason);
            const normalizedReason = rawReason.replace(/\s+/g, ' ').trim();

            failedVideoDetails.push({
              name: videoItem.displayName,
              reason: normalizedReason
            });
          }
        };

        const runWorker = async () => {
          while (nextJobIndex < videoJobs.length) {
            if (splitCanceled) {
              return;
            }

            const currentJobIndex = nextJobIndex;
            nextJobIndex += 1;
            if (currentJobIndex >= videoJobs.length) {
              return;
            }

            const currentJob = videoJobs[currentJobIndex];
            await runSingleSplitJob(currentJob.videoItem, currentJob.subJobId);
          }
        };

        const workerCount = Math.max(1, Math.min(videoJobs.length, maxParallelJobs));
        await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

        if (splitCanceled) {
          alert(t('exportCanceled'));
        } else if (failedVideoDetails.length > 0) {
          splitCompleted = true;
          const failedList = failedVideoDetails.slice(0, 3).map((item) => item.name).join(', ');
          const failedSuffix = failedVideoDetails.length > 3 ? '...' : '';
          const summary = t('quickSplitBatchPartialFailed', {
            failed: failedVideoDetails.length,
            total: quickSplitSourceVideos.length,
            names: `${failedList}${failedSuffix}`
          });
          const detailPreviewLimit = 8;
          const detailLines = failedVideoDetails
            .slice(0, detailPreviewLimit)
            .map((item) => `- ${item.name}: ${item.reason}`)
            .join('\n');
          const hiddenCount = failedVideoDetails.length - detailPreviewLimit;
          const moreLine = hiddenCount > 0 ? `\n- ... (+${hiddenCount})` : '';
          alert(`${summary}\n\n${detailLines}${moreLine}`);
        } else if (totalSuccessCount <= 0) {
          splitCompleted = true;
          alert(t('quickSplitFailed') + t('exportFailed'));
        } else {
          splitCompleted = true;
          alert(t('quickSplitSuccess', { count: totalSuccessCount }));
        }
      } finally {
        exportController.setIsExporting(false);
        if (exportController.activeExportJobIdRef.current === jobId) {
          exportController.activeExportJobIdRef.current = null;
          exportController.activeExportContextRef.current = null;
          if (splitCompleted) {
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
      console.error('Size split export error:', error);
      alert(t('quickSplitFailed') + errorMessage);
    }
  }, [defaultExportPreference, exportController, quickSplitSourceVideos, quickSplitTargetSizeMb, t]);

  return {
    quickSplitTargetSizeMb,
    setQuickSplitTargetSizeMb,
    quickSplitSourceVideos,
    handleQuickSplitSourceChange,
    clearQuickSplitSources,
    removeQuickSplitSource,
    runQuickSplitBySize
  };
};
