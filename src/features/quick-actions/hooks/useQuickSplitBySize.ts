import { useCallback, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { getFileNameFromPath, isSupportedVideoFile } from '../../../lib/video';
import type { ExportProgressController, TranslateFn } from '../types';

interface UseQuickSplitBySizeParams {
  t: TranslateFn;
  exportController: ExportProgressController;
  defaultTargetSizeMb: number;
}

interface UseQuickSplitBySizeResult {
  quickSplitTargetSizeMb: number;
  setQuickSplitTargetSizeMb: Dispatch<SetStateAction<number>>;
  quickSplitSourcePath: string;
  quickSplitSourceName: string;
  quickSplitSourceSizeBytes: number | null;
  handleQuickSplitSourceChange: (event: ChangeEvent<HTMLInputElement>) => void;
  runQuickSplitBySize: () => Promise<void>;
}

// EN: Encapsulates "split by target size" quick action state + side effects.
// ZH: 封装“按目标体积分割”快捷功能的状态与副作用，便于独立维护。
export const useQuickSplitBySize = ({
  t,
  exportController,
  defaultTargetSizeMb
}: UseQuickSplitBySizeParams): UseQuickSplitBySizeResult => {
  const [quickSplitTargetSizeMb, setQuickSplitTargetSizeMb] = useState(defaultTargetSizeMb);
  const [quickSplitSourcePath, setQuickSplitSourcePath] = useState('');
  const [quickSplitSourceName, setQuickSplitSourceName] = useState('');
  const [quickSplitSourceSizeBytes, setQuickSplitSourceSizeBytes] = useState<number | null>(null);

  const handleQuickSplitSourceChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    if (!isSupportedVideoFile(selectedFile)) {
      alert(t('uploadVideoAlert'));
      return;
    }

    const sourcePath = (selectedFile as File & { path?: string }).path ?? '';
    if (!sourcePath) {
      alert(t('pathError'));
      return;
    }

    setQuickSplitSourcePath(sourcePath);
    setQuickSplitSourceName(getFileNameFromPath(sourcePath));
    setQuickSplitSourceSizeBytes(selectedFile.size);
  }, [t]);

  const runQuickSplitBySize = useCallback(async () => {
    try {
      if (!quickSplitSourcePath) {
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
      exportController.activeExportJobIdRef.current = jobId;
      exportController.activeExportContextRef.current = null;
      exportController.setExportMode('split');
      exportController.setExportProgressPercent(0);
      exportController.setExportProgressClip({ current: 0, total: 0 });
      exportController.setIsExporting(true);
      let splitCompleted = false;

      try {
        const result = await window.ipcRenderer.processSizeSplit({
          filePath: quickSplitSourcePath,
          outputDir,
          targetSizeMb: normalizedTargetSizeMb,
          jobId
        });

        splitCompleted = true;
        const successCount = result.results.filter((item) => item.success).length;
        if (!result.success || successCount === 0 || successCount !== result.results.length) {
          if (result.error) {
            alert(t('quickSplitFailed') + result.error);
          } else {
            alert(t('exportFailed'));
          }
        } else {
          alert(t('quickSplitSuccess', { count: successCount }));
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
  }, [exportController, quickSplitSourcePath, quickSplitTargetSizeMb, t]);

  return {
    quickSplitTargetSizeMb,
    setQuickSplitTargetSizeMb,
    quickSplitSourcePath,
    quickSplitSourceName,
    quickSplitSourceSizeBytes,
    handleQuickSplitSourceChange,
    runQuickSplitBySize
  };
};
