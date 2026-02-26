import { v4 as uuidv4 } from 'uuid';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from 'react';
import { getFileNameFromPath, isSupportedVideoFile, toFileUrl } from '../../../lib/video';
import type {
  DefaultExportPreference,
  ExportProgressController,
  QuickLutBatchVideoItem,
  TranslateFn
} from '../types';
import type { VideoPlayerRef } from '../../../components/VideoPlayer';

interface PreviewPrepareProgressPayload {
  jobId: string;
  phase: 'start' | 'progress' | 'done';
  percent: number;
}

interface UseQuickLutBatchParams {
  t: TranslateFn;
  isQuickLutBatchPanelOpen: boolean;
  defaultExportPreference: DefaultExportPreference;
  exportController: ExportProgressController;
  cleanupPreviewProxy: (proxyPath: string | null) => Promise<void>;
  clampLutIntensity: (value: number) => number;
  defaultLutIntensity: number;
}

interface UseQuickLutBatchResult {
  quickLutBatchVideos: QuickLutBatchVideoItem[];
  quickLutBatchLutPath: string;
  setQuickLutBatchLutPath: Dispatch<SetStateAction<string>>;
  quickLutBatchLutIntensity: number;
  setQuickLutBatchLutIntensity: Dispatch<SetStateAction<number>>;
  quickLutRealtimePreviewEnabled: boolean;
  setQuickLutRealtimePreviewEnabled: Dispatch<SetStateAction<boolean>>;
  quickLutPreviewVideoId: string | null;
  quickLutPreviewSrc: string;
  quickLutPreviewPlaying: boolean;
  quickLutPreviewDuration: number;
  quickLutPreviewCurrentTime: number;
  quickLutPreviewPreparing: boolean;
  quickLutPreviewProgressPercent: number | null;
  quickLutPreviewUsingCompatible: boolean;
  quickLutPreviewCompatibleSuggested: boolean;
  showQuickLutPreviewVideoList: boolean;
  setShowQuickLutPreviewVideoList: Dispatch<SetStateAction<boolean>>;
  quickLutPreviewPlayerRef: RefObject<VideoPlayerRef>;
  handleQuickLutBatchVideosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  clearQuickLutBatchVideos: () => void;
  removeQuickLutBatchVideo: (videoId: string) => void;
  handleQuickLutBatchImportLut: () => Promise<void>;
  runQuickLutBatchExport: () => Promise<void>;
  switchQuickLutPreviewVideo: (videoId: string) => void;
  switchToQuickLutCompatiblePreview: () => void;
  handleQuickLutPreviewDecodeIssue: (issue: { type: 'decode-error' | 'src-not-supported'; code?: number }) => void;
  handleQuickLutPreviewSeek: (nextTime: number) => void;
  toggleQuickLutPreviewPlaying: () => void;
  onQuickLutPreviewTimeUpdate: (time: number) => void;
  onQuickLutPreviewDurationChange: (duration: number) => void;
  onQuickLutPreviewEnded: () => void;
}

const isPreviewPrepareProgressPayload = (payload: unknown): payload is PreviewPrepareProgressPayload => {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload as Record<string, unknown>;
  const isValidPhase = data.phase === 'start' || data.phase === 'progress' || data.phase === 'done';
  return typeof data.jobId === 'string' && typeof data.percent === 'number' && isValidPhase;
};

// EN: Manages quick LUT batch export and first-screen live preview lifecycle.
// ZH: 管理快捷 LUT 批量导出与首页实时预览全链路状态。
export const useQuickLutBatch = ({
  t,
  isQuickLutBatchPanelOpen,
  defaultExportPreference,
  exportController,
  cleanupPreviewProxy,
  clampLutIntensity,
  defaultLutIntensity
}: UseQuickLutBatchParams): UseQuickLutBatchResult => {
  const [quickLutBatchVideos, setQuickLutBatchVideos] = useState<QuickLutBatchVideoItem[]>([]);
  const [quickLutBatchLutPath, setQuickLutBatchLutPath] = useState('');
  const [quickLutBatchLutIntensity, setQuickLutBatchLutIntensity] = useState(defaultLutIntensity);
  const [quickLutRealtimePreviewEnabled, setQuickLutRealtimePreviewEnabled] = useState(true);
  const [quickLutPreviewVideoId, setQuickLutPreviewVideoId] = useState<string | null>(null);
  const [quickLutPreviewSrc, setQuickLutPreviewSrc] = useState('');
  const [quickLutPreviewFilePath, setQuickLutPreviewFilePath] = useState('');
  const [quickLutPreviewPlaying, setQuickLutPreviewPlaying] = useState(false);
  const [quickLutPreviewDuration, setQuickLutPreviewDuration] = useState(0);
  const [quickLutPreviewCurrentTime, setQuickLutPreviewCurrentTime] = useState(0);
  const [quickLutPreviewPreparing, setQuickLutPreviewPreparing] = useState(false);
  const [quickLutPreviewProgressPercent, setQuickLutPreviewProgressPercent] = useState<number | null>(null);
  const [quickLutPreviewUsingCompatible, setQuickLutPreviewUsingCompatible] = useState(false);
  const [quickLutPreviewCompatibleSuggested, setQuickLutPreviewCompatibleSuggested] = useState(false);
  const [showQuickLutPreviewVideoList, setShowQuickLutPreviewVideoList] = useState(false);

  const quickLutPreviewPlayerRef = useRef<VideoPlayerRef>(null);
  const quickLutPreviewProxyPathRef = useRef<string | null>(null);
  const quickLutPreviewJobIdRef = useRef<string | null>(null);
  const quickLutPreviewPreparingRef = useRef(false);
  const quickLutPreviewProgressHideTimerRef = useRef<number | null>(null);
  const quickLutPreviewAutoFallbackTriedRef = useRef(false);

  const clearQuickLutPreviewProgressTimer = useCallback(() => {
    if (quickLutPreviewProgressHideTimerRef.current !== null) {
      window.clearTimeout(quickLutPreviewProgressHideTimerRef.current);
      quickLutPreviewProgressHideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handlePreviewProgress = (_event: unknown, payload: unknown) => {
      if (!isPreviewPrepareProgressPayload(payload)) {
        return;
      }
      if (payload.jobId !== quickLutPreviewJobIdRef.current) {
        return;
      }
      setQuickLutPreviewProgressPercent(Math.min(100, Math.max(0, payload.percent)));
    };

    window.ipcRenderer.on('preview-prepare-progress', handlePreviewProgress);
    return () => {
      window.ipcRenderer.off('preview-prepare-progress', handlePreviewProgress);
    };
  }, []);

  const handleQuickLutBatchVideosChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
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
    setQuickLutBatchVideos((prev) => {
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

  const clearQuickLutBatchVideos = useCallback(() => {
    setQuickLutBatchVideos([]);
  }, []);

  const removeQuickLutBatchVideo = useCallback((videoId: string) => {
    setQuickLutBatchVideos((prev) => prev.filter((item) => item.id !== videoId));
  }, []);

  const handleQuickLutBatchImportLut = useCallback(async () => {
    try {
      const selectedLutPath = await window.ipcRenderer.showOpenLutDialog();
      if (!selectedLutPath) {
        return;
      }
      setQuickLutBatchLutPath(selectedLutPath);
    } catch (error) {
      console.error('Failed to import quick batch LUT file:', error);
    }
  }, []);

  const runQuickLutBatchExport = useCallback(async () => {
    try {
      if (quickLutBatchVideos.length === 0) {
        alert(t('quickLutBatchNeedVideos'));
        return;
      }

      const normalizedLutPath = quickLutBatchLutPath.trim();
      if (!normalizedLutPath) {
        alert(t('quickLutBatchNeedLut'));
        return;
      }

      const outputDir = await window.ipcRenderer.showOpenDialog();
      if (!outputDir) return;

      exportController.clearExportProgressTimer();
      const jobId = `quick-lut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      exportController.activeExportJobIdRef.current = jobId;
      exportController.activeExportContextRef.current = null;
      exportController.setExportMode('full');
      exportController.setExportProgressPercent(0);
      exportController.setExportProgressClip({ current: 0, total: quickLutBatchVideos.length });
      exportController.setIsExporting(true);
      let exportCompleted = false;
      let exportCanceled = false;

      try {
        const result = await window.ipcRenderer.processLutFullBatch({
          videos: quickLutBatchVideos.map((video) => ({
            id: video.id,
            filePath: video.filePath
          })),
          outputDir,
          lutPath: normalizedLutPath,
          lutIntensity: clampLutIntensity(quickLutBatchLutIntensity),
          defaultExportPreference,
          jobId
        });

        if (result.canceled) {
          exportCanceled = true;
          alert(t('exportCanceled'));
          return;
        }

        const successCount = result.results.filter((item) => item.success).length;
        exportCompleted = true;
        if (!result.success || successCount === 0 || successCount !== result.results.length) {
          if ('error' in result && typeof result.error === 'string' && result.error.length > 0) {
            alert(t('quickLutBatchFailed') + result.error);
          } else {
            alert(t('exportFailed'));
          }
        } else {
          alert(t('quickLutBatchSuccess', { count: successCount }));
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
      console.error('Quick LUT batch export error:', error);
      alert(t('quickLutBatchFailed') + errorMessage);
    }
  }, [
    clampLutIntensity,
    defaultExportPreference,
    exportController,
    quickLutBatchLutIntensity,
    quickLutBatchLutPath,
    quickLutBatchVideos,
    t
  ]);

  useEffect(() => {
    if (quickLutBatchVideos.length === 0) {
      setQuickLutPreviewVideoId(null);
      setShowQuickLutPreviewVideoList(false);
      return;
    }

    if (!quickLutPreviewVideoId || !quickLutBatchVideos.some((video) => video.id === quickLutPreviewVideoId)) {
      setQuickLutPreviewVideoId(quickLutBatchVideos[0].id);
    }
  }, [quickLutBatchVideos, quickLutPreviewVideoId]);

  const switchQuickLutPreviewVideo = useCallback((videoId: string) => {
    setQuickLutPreviewVideoId(videoId);
    setShowQuickLutPreviewVideoList(false);
    setQuickLutPreviewPlaying(false);
  }, []);

  const switchToQuickLutProxyPreview = useCallback(async () => {
    if (!quickLutPreviewFilePath || quickLutPreviewPreparingRef.current || !quickLutRealtimePreviewEnabled) {
      return;
    }

    clearQuickLutPreviewProgressTimer();
    const jobId = `quick-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    quickLutPreviewJobIdRef.current = jobId;
    setQuickLutPreviewProgressPercent(0);
    quickLutPreviewPreparingRef.current = true;
    setQuickLutPreviewPreparing(true);
    let conversionCompleted = false;

    try {
      const result = await window.ipcRenderer.preparePreview({
        filePath: quickLutPreviewFilePath,
        forceProxy: true,
        jobId
      });

      if (!result.success) {
        console.warn('Quick LUT preview compatible conversion failed:', result.error);
        return;
      }

      if (quickLutPreviewJobIdRef.current !== jobId) {
        return;
      }

      if (result.useProxy && result.url && result.path) {
        if (quickLutPreviewProxyPathRef.current) {
          const stalePreviewPath = quickLutPreviewProxyPathRef.current;
          quickLutPreviewProxyPathRef.current = null;
          void cleanupPreviewProxy(stalePreviewPath);
        }

        quickLutPreviewProxyPathRef.current = result.path;
        setQuickLutPreviewSrc(result.url);
        setQuickLutPreviewUsingCompatible(true);
        conversionCompleted = true;
      }
    } catch (error) {
      console.warn('Quick LUT preview compatible conversion failed:', error);
    } finally {
      quickLutPreviewPreparingRef.current = false;
      setQuickLutPreviewPreparing(false);

      if (quickLutPreviewJobIdRef.current === jobId) {
        if (!conversionCompleted) {
          quickLutPreviewJobIdRef.current = null;
          setQuickLutPreviewProgressPercent(null);
        } else {
          setQuickLutPreviewProgressPercent(100);
          clearQuickLutPreviewProgressTimer();
          quickLutPreviewProgressHideTimerRef.current = window.setTimeout(() => {
            if (quickLutPreviewJobIdRef.current === jobId) {
              quickLutPreviewJobIdRef.current = null;
              setQuickLutPreviewProgressPercent(null);
            }
            quickLutPreviewProgressHideTimerRef.current = null;
          }, 350);
        }
      }
    }
  }, [cleanupPreviewProxy, clearQuickLutPreviewProgressTimer, quickLutPreviewFilePath, quickLutRealtimePreviewEnabled]);

  const switchToQuickLutCompatiblePreview = useCallback(() => {
    if (!quickLutPreviewFilePath || quickLutPreviewPreparingRef.current || quickLutPreviewUsingCompatible || !quickLutRealtimePreviewEnabled) {
      return;
    }
    void switchToQuickLutProxyPreview();
  }, [quickLutPreviewFilePath, quickLutPreviewUsingCompatible, quickLutRealtimePreviewEnabled, switchToQuickLutProxyPreview]);

  const handleQuickLutPreviewDecodeIssue = useCallback((issue: { type: 'decode-error' | 'src-not-supported'; code?: number }) => {
    if (quickLutPreviewUsingCompatible || quickLutPreviewPreparing || !quickLutPreviewFilePath || !quickLutRealtimePreviewEnabled) {
      return;
    }

    if (quickLutPreviewAutoFallbackTriedRef.current) {
      return;
    }
    quickLutPreviewAutoFallbackTriedRef.current = true;

    console.warn('Quick LUT preview decode issue detected, switching to compatible preview...', issue);
    switchToQuickLutCompatiblePreview();
  }, [quickLutPreviewFilePath, quickLutPreviewPreparing, quickLutPreviewUsingCompatible, quickLutRealtimePreviewEnabled, switchToQuickLutCompatiblePreview]);

  // EN: Auto-refresh preview source when source list / panel visibility / preview mode changes.
  // ZH: 当视频列表、面板状态、实时预览开关变化时，自动刷新预览源。
  useEffect(() => {
    let cancelled = false;
    const selectedPreviewVideo = quickLutPreviewVideoId
      ? quickLutBatchVideos.find((video) => video.id === quickLutPreviewVideoId) ?? null
      : null;

    clearQuickLutPreviewProgressTimer();
    quickLutPreviewJobIdRef.current = null;
    quickLutPreviewPreparingRef.current = false;
    setQuickLutPreviewPreparing(false);
    setQuickLutPreviewProgressPercent(null);

    if (quickLutPreviewProxyPathRef.current) {
      const stalePreviewPath = quickLutPreviewProxyPathRef.current;
      quickLutPreviewProxyPathRef.current = null;
      void cleanupPreviewProxy(stalePreviewPath);
    }

    setQuickLutPreviewPlaying(false);
    setQuickLutPreviewCurrentTime(0);
    setQuickLutPreviewDuration(0);
    setQuickLutPreviewUsingCompatible(false);
    setQuickLutPreviewCompatibleSuggested(false);
    quickLutPreviewAutoFallbackTriedRef.current = false;

    if (!selectedPreviewVideo) {
      setQuickLutPreviewFilePath('');
      setQuickLutPreviewSrc('');
      return;
    }

    setQuickLutPreviewFilePath(selectedPreviewVideo.filePath);
    if (!isQuickLutBatchPanelOpen || !quickLutRealtimePreviewEnabled) {
      setQuickLutPreviewSrc('');
      return;
    }

    setQuickLutPreviewSrc(toFileUrl(selectedPreviewVideo.filePath));
    window.ipcRenderer.preparePreview({
      filePath: selectedPreviewVideo.filePath,
      forceProxy: false
    })
      .then((result) => {
        if (cancelled) return;

        if (!result.success) {
          console.warn('Quick LUT preview preparation failed:', result.error);
          return;
        }

        setQuickLutPreviewCompatibleSuggested(Boolean(result.suggestCompatibleMode));
        if (result.useProxy && result.url && result.path) {
          quickLutPreviewProxyPathRef.current = result.path;
          setQuickLutPreviewSrc(result.url);
          setQuickLutPreviewUsingCompatible(true);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('Quick LUT preview preparation failed:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    cleanupPreviewProxy,
    clearQuickLutPreviewProgressTimer,
    isQuickLutBatchPanelOpen,
    quickLutBatchVideos,
    quickLutPreviewVideoId,
    quickLutRealtimePreviewEnabled
  ]);

  useEffect(() => {
    if (!isQuickLutBatchPanelOpen) {
      setShowQuickLutPreviewVideoList(false);
    }
  }, [isQuickLutBatchPanelOpen]);

  useEffect(() => {
    return () => {
      clearQuickLutPreviewProgressTimer();
      quickLutPreviewJobIdRef.current = null;
      quickLutPreviewPreparingRef.current = false;
      const stalePreviewPath = quickLutPreviewProxyPathRef.current;
      quickLutPreviewProxyPathRef.current = null;
      void cleanupPreviewProxy(stalePreviewPath);
    };
  }, [cleanupPreviewProxy, clearQuickLutPreviewProgressTimer]);

  const handleQuickLutPreviewSeek = useCallback((nextTime: number) => {
    const maxDuration = Number.isFinite(quickLutPreviewDuration) ? Math.max(0, quickLutPreviewDuration) : 0;
    const safeTime = Math.min(maxDuration, Math.max(0, Number.isFinite(nextTime) ? nextTime : 0));
    quickLutPreviewPlayerRef.current?.seekTo(safeTime);
    setQuickLutPreviewCurrentTime(safeTime);
  }, [quickLutPreviewDuration]);

  const toggleQuickLutPreviewPlaying = useCallback(() => {
    setQuickLutPreviewPlaying((prev) => !prev);
  }, []);

  const onQuickLutPreviewEnded = useCallback(() => {
    setQuickLutPreviewPlaying(false);
  }, []);

  return {
    quickLutBatchVideos,
    quickLutBatchLutPath,
    setQuickLutBatchLutPath,
    quickLutBatchLutIntensity,
    setQuickLutBatchLutIntensity,
    quickLutRealtimePreviewEnabled,
    setQuickLutRealtimePreviewEnabled,
    quickLutPreviewVideoId,
    quickLutPreviewSrc,
    quickLutPreviewPlaying,
    quickLutPreviewDuration,
    quickLutPreviewCurrentTime,
    quickLutPreviewPreparing,
    quickLutPreviewProgressPercent,
    quickLutPreviewUsingCompatible,
    quickLutPreviewCompatibleSuggested,
    showQuickLutPreviewVideoList,
    setShowQuickLutPreviewVideoList,
    quickLutPreviewPlayerRef,
    handleQuickLutBatchVideosChange,
    clearQuickLutBatchVideos,
    removeQuickLutBatchVideo,
    handleQuickLutBatchImportLut,
    runQuickLutBatchExport,
    switchQuickLutPreviewVideo,
    switchToQuickLutCompatiblePreview,
    handleQuickLutPreviewDecodeIssue,
    handleQuickLutPreviewSeek,
    toggleQuickLutPreviewPlaying,
    onQuickLutPreviewTimeUpdate: setQuickLutPreviewCurrentTime,
    onQuickLutPreviewDurationChange: setQuickLutPreviewDuration,
    onQuickLutPreviewEnded
  };
};
