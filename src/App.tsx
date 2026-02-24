import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { VideoPlayerRef } from './components/VideoPlayer';
import { QuickLutPreviewVideoListModal } from './components/quick-actions/QuickLutBatchFeature';
import { VIDEO_FILE_ACCEPT, getFileNameFromPath, isSupportedVideoFile, toFileUrl } from './lib/video';
import type { ExportProgressController } from './features/quick-actions/types';
import { useQuickSplitBySize } from './features/quick-actions/hooks/useQuickSplitBySize';
import { useQuickLutBatch } from './features/quick-actions/hooks/useQuickLutBatch';
import { useQuickConvertBatch } from './features/quick-actions/hooks/useQuickConvertBatch';
import AppHeader from './features/main/components/AppHeader';
import GlobalStatusBar from './features/main/components/GlobalStatusBar';
import { useMainSettings, type ThemePreference } from './features/main/hooks/useMainSettings';
import SettingsModal from './features/main/components/SettingsModal';
import QueueModal from './features/main/components/QueueModal';
import LutFullExportConfirmModal from './features/main/components/LutFullExportConfirmModal';
import ProgressOverlays from './features/main/components/ProgressOverlays';
import MainEditorWorkspace from './features/main/components/MainEditorWorkspace';
import MainLandingWorkspace from './features/main/components/MainLandingWorkspace';
import type { QueueVideoItem, Segment } from './features/main/types';
import { translations, type TranslationKey } from './i18n/translations';
import { v4 as uuidv4 } from 'uuid';
import packageJson from '../package.json';

const DEFAULT_FIXED_DURATION = 3.9;
const DEFAULT_LUT_INTENSITY = 100;
const CURRENT_TIME_COMMIT_INTERVAL_MS = 80;
const TAG_LIBRARY_STORAGE_KEY = 'clipTagLibrary';
const MAX_TAG_LENGTH = 24;
const DEFAULT_SPLIT_TARGET_SIZE_MB = 800;
const MIN_SPLIT_TARGET_SIZE_MB = 1;
const MAX_SPLIT_TARGET_SIZE_MB = 1024 * 100;
const APP_VERSION = packageJson.version;

const clampLutIntensity = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_LUT_INTENSITY;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const normalizeTagName = (value: string) => {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
};

const parseStoredTagLibrary = (): string[] => {
  const raw = localStorage.getItem(TAG_LIBRARY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const dedupeSet = new Set<string>();
    const normalizedTags: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') {
        continue;
      }

      const normalizedTag = normalizeTagName(item);
      if (!normalizedTag) {
        continue;
      }

      const dedupeKey = normalizedTag.toLowerCase();
      if (dedupeSet.has(dedupeKey)) {
        continue;
      }

      dedupeSet.add(dedupeKey);
      normalizedTags.push(normalizedTag);
    }

    return normalizedTags;
  } catch {
    return [];
  }
};
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / (1024 ** exponent);
  const precision = exponent >= 2 ? 2 : 1;
  return `${value.toFixed(precision)} ${units[exponent]}`;
};

interface PreviewPrepareProgressPayload {
  jobId: string;
  phase: 'start' | 'progress' | 'done';
  percent: number;
}

interface BatchExportProgressPayload {
  jobId: string;
  phase: 'start' | 'progress' | 'done';
  percent: number;
  currentClip: number;
  totalClips: number;
}

const isPreviewPrepareProgressPayload = (payload: unknown): payload is PreviewPrepareProgressPayload => {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload as Record<string, unknown>;
  const isValidPhase = data.phase === 'start' || data.phase === 'progress' || data.phase === 'done';
  return typeof data.jobId === 'string' && typeof data.percent === 'number' && isValidPhase;
};

const isBatchExportProgressPayload = (payload: unknown): payload is BatchExportProgressPayload => {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload as Record<string, unknown>;
  const isValidPhase = data.phase === 'start' || data.phase === 'progress' || data.phase === 'done';
  return (
    typeof data.jobId === 'string' &&
    typeof data.percent === 'number' &&
    typeof data.currentClip === 'number' &&
    typeof data.totalClips === 'number' &&
    isValidPhase
  );
};

// Main App Component
function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoQueue, setVideoQueue] = useState<QueueVideoItem[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [draggingQueueVideoId, setDraggingQueueVideoId] = useState<string | null>(null);
  const [dragOverQueueVideoId, setDragOverQueueVideoId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showLutFullExportConfirm, setShowLutFullExportConfirm] = useState(false);
  const [tagLibrary, setTagLibrary] = useState<string[]>(parseStoredTagLibrary);
  const [newTagDraft, setNewTagDraft] = useState('');
  const [activeQuickAction, setActiveQuickAction] = useState<'split-by-size' | 'lut-full-batch' | 'convert-batch' | null>(null);
  const isQuickSplitPanelOpen = activeQuickAction === 'split-by-size';
  const isQuickLutBatchPanelOpen = activeQuickAction === 'lut-full-batch';
  const isQuickConvertPanelOpen = activeQuickAction === 'convert-batch';

  const {
    useFixedDuration,
    setUseFixedDuration,
    defaultDuration,
    setDefaultDuration,
    language,
    setLanguage,
    themePreference,
    setThemePreference,
    resolvedTheme,
    lutFilePath,
    setLutFilePath,
    enableLutPreview,
    setEnableLutPreview,
    lutIntensity,
    setLutIntensity,
    lutIntensityDraft,
    setLutIntensityDraft
  } = useMainSettings({
    defaultFixedDuration: DEFAULT_FIXED_DURATION,
    defaultLutIntensity: DEFAULT_LUT_INTENSITY,
    clampLutIntensity
  });

  // i18n helper
  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>) => {
    let text = translations[language][key] || translations.en[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v.toString());
      });
    }
    return text;
  }, [language]);

  // EN: Adapter for feature hooks that use string-based i18n keys.
  // ZH: 为特性 hooks 提供字符串键适配层，避免与 App 内部强类型键冲突。
  const tForFeatures = useCallback((key: string, params?: Record<string, string | number>) => {
    return t(key as TranslationKey, params);
  }, [t]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    void window.ipcRenderer.setWindowTheme({ theme: resolvedTheme }).catch((error: unknown) => {
      console.warn('[BatchClip] Failed to sync window theme:', error);
    });
  }, [resolvedTheme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    const timer = window.setTimeout(() => {
      root.classList.remove('theme-switching');
    }, 420);
    return () => {
      window.clearTimeout(timer);
    };
  }, [resolvedTheme]);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'zh' ? 'en' : 'zh'));
  }, [setLanguage]);

  const changeThemePreference = useCallback((nextTheme: ThemePreference) => {
    setThemePreference(nextTheme);
  }, [setThemePreference]);

  useEffect(() => {
    localStorage.setItem(TAG_LIBRARY_STORAGE_KEY, JSON.stringify(tagLibrary));
  }, [tagLibrary]);


  // Video State
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Editor State
  const [segments, setSegments] = useState<Segment[]>([]);
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  const videoPlayerRef = useRef<VideoPlayerRef>(null);

  // Reset state when file changes
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [filePath, setFilePath] = useState<string>("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [previewProgressPercent, setPreviewProgressPercent] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'clips' | 'full' | 'split' | 'convert'>('clips');
  const [exportProgressPercent, setExportProgressPercent] = useState<number | null>(null);
  const [exportProgressClip, setExportProgressClip] = useState<{ current: number; total: number } | null>(null);
  const [usingCompatiblePreview, setUsingCompatiblePreview] = useState(false);
  const [compatiblePreviewSuggested, setCompatiblePreviewSuggested] = useState(false);
  const previewProxyPathRef = useRef<string | null>(null);
  const activePreviewJobIdRef = useRef<string | null>(null);
  const activeExportJobIdRef = useRef<string | null>(null);
  const activeExportContextRef = useRef<{ clipOffset: number; clipCount: number; totalClips: number } | null>(null);
  const isPreparingPreviewRef = useRef(false);
  const previewProgressHideTimerRef = useRef<number | null>(null);
  const exportProgressHideTimerRef = useRef<number | null>(null);
  const hasAutoFallbackTriedRef = useRef(false);
  const currentTimeRef = useRef(0);
  const pendingStartRef = useRef<number | null>(null);
  const lastCurrentTimeCommitRef = useRef(0);
  const normalizedLutPath = lutFilePath.trim();
  const normalizedLutIntensity = clampLutIntensity(lutIntensity);
  const normalizedLutIntensityDraft = clampLutIntensity(lutIntensityDraft);
  const hasPendingLutIntensity = normalizedLutIntensityDraft !== normalizedLutIntensity;
  const hasLutFile = normalizedLutPath.length > 0;
  const shouldApplyLutOnPreview = enableLutPreview && hasLutFile;
  const shouldApplyLutOnExport = enableLutPreview && hasLutFile;
  const usingLutPreview = shouldApplyLutOnPreview;
  const activeQueueItem = activeVideoId ? videoQueue.find((item) => item.id === activeVideoId) ?? null : null;
  const totalQueueClipCount = videoQueue.reduce((total, item) => total + item.segments.length, 0);

  useEffect(() => {
    setLutIntensityDraft(normalizedLutIntensity);
  }, [normalizedLutIntensity, setLutIntensityDraft]);

  useEffect(() => {
    if (!showQueue) {
      setDraggingQueueVideoId(null);
      setDragOverQueueVideoId(null);
    }
  }, [showQueue]);

  useEffect(() => {
    if (videoQueue.length === 0) {
      if (activeVideoId !== null || videoFile !== null) {
        setActiveVideoId(null);
        setVideoFile(null);
        setSegments([]);
        pendingStartRef.current = null;
        setPendingStart(null);
      }
      return;
    }

    if (!activeVideoId || !videoQueue.some((item) => item.id === activeVideoId)) {
      const firstVideo = videoQueue[0];
      setActiveVideoId(firstVideo.id);
      setSegments(firstVideo.segments);
      setVideoFile(firstVideo.file);
      pendingStartRef.current = null;
      setPendingStart(null);
    }
  }, [activeVideoId, videoFile, videoQueue]);

  const setPendingStartState = useCallback((value: number | null) => {
    pendingStartRef.current = value;
    setPendingStart(value);
  }, []);

  const getQueueFileKey = useCallback((file: File) => {
    const electronPath = (file as File & { path?: string }).path;
    if (electronPath && electronPath.length > 0) {
      return `path:${electronPath}`;
    }
    return `blob:${file.name}:${file.size}:${file.lastModified}`;
  }, []);

  const setActiveSegments = useCallback((updater: Segment[] | ((prev: Segment[]) => Segment[])) => {
    setSegments((prev) => {
      const nextSegments = typeof updater === 'function'
        ? (updater as (value: Segment[]) => Segment[])(prev)
        : updater;

      if (activeVideoId) {
        setVideoQueue((prevQueue) => prevQueue.map((item) => (
          item.id === activeVideoId
            ? { ...item, segments: nextSegments }
            : item
        )));
      }

      return nextSegments;
    });
  }, [activeVideoId]);

  const sortTagsByLibraryOrder = useCallback((tags: string[]) => {
    const orderMap = new Map(tagLibrary.map((tag, index) => [tag, index]));
    const seen = new Set<string>();
    const deduped = tags
      .map((tag) => normalizeTagName(tag))
      .filter((tag) => tag.length > 0)
      .filter((tag) => {
        const dedupeKey = tag.toLowerCase();
        if (seen.has(dedupeKey)) {
          return false;
        }
        seen.add(dedupeKey);
        return true;
      });

    deduped.sort((a, b) => {
      const indexA = orderMap.get(a);
      const indexB = orderMap.get(b);
      if (indexA === undefined && indexB === undefined) {
        return a.localeCompare(b, 'zh-Hans-CN');
      }
      if (indexA === undefined) {
        return 1;
      }
      if (indexB === undefined) {
        return -1;
      }
      return indexA - indexB;
    });

    return deduped;
  }, [tagLibrary]);

  const addTagToLibrary = useCallback((rawTagName: string) => {
    const normalizedTag = normalizeTagName(rawTagName);
    if (!normalizedTag) {
      return;
    }

    setTagLibrary((prevTags) => {
      const existed = prevTags.some((tag) => tag.toLowerCase() === normalizedTag.toLowerCase());
      if (existed) {
        return prevTags;
      }
      return [...prevTags, normalizedTag];
    });
  }, []);

  const commitTagDraft = useCallback(() => {
    const normalizedTag = normalizeTagName(newTagDraft);
    if (!normalizedTag) {
      return;
    }

    addTagToLibrary(normalizedTag);
    setNewTagDraft('');
  }, [addTagToLibrary, newTagDraft]);

  const removeTagFromLibrary = useCallback((targetTag: string) => {
    setTagLibrary((prevTags) => prevTags.filter((tag) => tag !== targetTag));

    const stripTargetTag = (segment: Segment): Segment => {
      if (!segment.tags.includes(targetTag)) {
        return segment;
      }
      return {
        ...segment,
        tags: segment.tags.filter((tag) => tag !== targetTag)
      };
    };

    setVideoQueue((prevQueue) => prevQueue.map((item) => {
      const nextSegments = item.segments.map(stripTargetTag);
      const hasChanged = nextSegments.some((segment, index) => segment !== item.segments[index]);
      if (!hasChanged) {
        return item;
      }
      return { ...item, segments: nextSegments };
    }));

    setSegments((prevSegments) => prevSegments.map(stripTargetTag));
  }, []);

  const toggleSegmentTag = useCallback((videoId: string, segmentId: string, tagName: string) => {
    const updateTargetSegment = (segment: Segment): Segment => {
      if (segment.id !== segmentId) {
        return segment;
      }

      const normalizedTagName = normalizeTagName(tagName);
      if (!normalizedTagName) {
        return segment;
      }

      const hasTag = segment.tags.includes(normalizedTagName);
      const nextTags = hasTag
        ? segment.tags.filter((tag) => tag !== normalizedTagName)
        : sortTagsByLibraryOrder([...segment.tags, normalizedTagName]);

      return {
        ...segment,
        tags: nextTags
      };
    };

    if (videoId === activeVideoId) {
      setActiveSegments((prev) => prev.map(updateTargetSegment));
      return;
    }

    setVideoQueue((prevQueue) => prevQueue.map((item) => (
      item.id === videoId
        ? { ...item, segments: item.segments.map(updateTargetSegment) }
        : item
    )));
  }, [activeVideoId, setActiveSegments, sortTagsByLibraryOrder]);

  const switchToQueueVideo = useCallback((videoId: string) => {
    if (videoId === activeVideoId) {
      return;
    }

    const targetVideo = videoQueue.find((item) => item.id === videoId);
    if (!targetVideo) {
      return;
    }

    setIsPlaying(false);
    setPendingStartState(null);
    setActiveVideoId(videoId);
    setSegments(targetVideo.segments);
    setVideoFile(targetVideo.file);
    setShowQueue(false);
  }, [activeVideoId, setPendingStartState, videoQueue]);

  const enqueueVideos = useCallback((inputFiles: FileList | File[]) => {
    const files = Array.from(inputFiles);
    const validFiles = files.filter((file) => isSupportedVideoFile(file));

    if (validFiles.length === 0) {
      alert(t('uploadVideoAlert'));
      return;
    }

    setVideoQueue((prevQueue) => {
      const existingKeys = new Set(prevQueue.map((item) => item.uniqueKey));
      const nextQueue = [...prevQueue];

      for (const file of validFiles) {
        const uniqueKey = getQueueFileKey(file);
        if (existingKeys.has(uniqueKey)) {
          continue;
        }
        existingKeys.add(uniqueKey);

        const electronPath = (file as File & { path?: string }).path ?? '';
        const displayName = electronPath ? getFileNameFromPath(electronPath) : file.name;
        const newItem: QueueVideoItem = {
          id: uuidv4(),
          file,
          filePath: electronPath,
          displayName,
          segments: [],
          uniqueKey
        };
        nextQueue.push(newItem);
      }

      return nextQueue;
    });

  }, [getQueueFileKey, t]);

  const removeQueueVideo = useCallback((videoId: string) => {
    setVideoQueue((prevQueue) => {
      const targetIndex = prevQueue.findIndex((item) => item.id === videoId);
      if (targetIndex === -1) {
        return prevQueue;
      }

      const nextQueue = prevQueue.filter((item) => item.id !== videoId);
      if (activeVideoId !== videoId) {
        return nextQueue;
      }

      if (nextQueue.length === 0) {
        setActiveVideoId(null);
        setVideoFile(null);
        setSegments([]);
        setPendingStartState(null);
        setShowQueue(false);
        return nextQueue;
      }

      const nextActiveIndex = Math.min(targetIndex, nextQueue.length - 1);
      const nextActiveVideo = nextQueue[nextActiveIndex];
      setActiveVideoId(nextActiveVideo.id);
      setVideoFile(nextActiveVideo.file);
      setSegments(nextActiveVideo.segments);
      setPendingStartState(null);
      return nextQueue;
    });
  }, [activeVideoId, setPendingStartState]);

  const reorderQueueVideos = useCallback((fromVideoId: string, toVideoId: string) => {
    if (fromVideoId === toVideoId) {
      return;
    }

    setVideoQueue((prevQueue) => {
      const fromIndex = prevQueue.findIndex((item) => item.id === fromVideoId);
      const toIndex = prevQueue.findIndex((item) => item.id === toVideoId);
      if (fromIndex === -1 || toIndex === -1) {
        return prevQueue;
      }

      const nextQueue = [...prevQueue];
      const [movedItem] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, movedItem);
      return nextQueue;
    });
  }, []);

  const handleQueueDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, videoId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', videoId);
    setDraggingQueueVideoId(videoId);
    setDragOverQueueVideoId(videoId);
  }, []);

  const handleQueueDragOver = useCallback((event: React.DragEvent<HTMLDivElement>, videoId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverQueueVideoId !== videoId) {
      setDragOverQueueVideoId(videoId);
    }
  }, [dragOverQueueVideoId]);

  const handleQueueDrop = useCallback((event: React.DragEvent<HTMLDivElement>, targetVideoId: string) => {
    event.preventDefault();
    const sourceVideoId = draggingQueueVideoId || event.dataTransfer.getData('text/plain');
    if (sourceVideoId) {
      reorderQueueVideos(sourceVideoId, targetVideoId);
    }
    setDraggingQueueVideoId(null);
    setDragOverQueueVideoId(null);
  }, [draggingQueueVideoId, reorderQueueVideos]);

  const handleQueueDragEnd = useCallback(() => {
    setDraggingQueueVideoId(null);
    setDragOverQueueVideoId(null);
  }, []);

  const addSegment = useCallback((start: number, end: number) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return;
    }

    const normalizedEnd = useFixedDuration && (end - start > defaultDuration)
      ? start + defaultDuration
      : end;

    const newSegment: Segment = {
      id: uuidv4(),
      start,
      end: normalizedEnd,
      tags: []
    };

    setActiveSegments((prev) => {
      const insertIndex = prev.findIndex((segment) => segment.start > newSegment.start);
      if (insertIndex === -1) {
        return [...prev, newSegment];
      }
      return [
        ...prev.slice(0, insertIndex),
        newSegment,
        ...prev.slice(insertIndex)
      ];
    });
    setPendingStartState(null);
  }, [defaultDuration, setActiveSegments, setPendingStartState, useFixedDuration]);

  const cleanupPreviewProxy = useCallback(async (proxyPath: string | null) => {
    if (!proxyPath) return;

    try {
      await window.ipcRenderer.cleanupPreview({ proxyPath });
    } catch (error) {
      console.warn('Failed to cleanup preview proxy:', error);
    }
  }, []);

  const clearPreviewProgressTimer = useCallback(() => {
    if (previewProgressHideTimerRef.current !== null) {
      window.clearTimeout(previewProgressHideTimerRef.current);
      previewProgressHideTimerRef.current = null;
    }
  }, []);

  const clearExportProgressTimer = useCallback(() => {
    if (exportProgressHideTimerRef.current !== null) {
      window.clearTimeout(exportProgressHideTimerRef.current);
      exportProgressHideTimerRef.current = null;
    }
  }, []);

  // EN: Shared progress controller for quick actions (split/LUT).
  // ZH: 快捷功能（分割/LUT）共用的导出进度控制器。
  const exportProgressController = useMemo<ExportProgressController>(() => ({
    clearExportProgressTimer,
    setExportMode,
    setExportProgressPercent,
    setExportProgressClip,
    setIsExporting,
    activeExportJobIdRef,
    activeExportContextRef,
    exportProgressHideTimerRef
  }), [
    clearExportProgressTimer,
    setExportMode,
    setExportProgressPercent,
    setExportProgressClip,
    setIsExporting
  ]);

  // EN: Quick Action #1 state/handlers are isolated in a dedicated hook.
  // ZH: 快捷功能 1（按体积分割）状态与逻辑由独立 hook 托管。
  const {
    quickSplitTargetSizeMb,
    setQuickSplitTargetSizeMb,
    quickSplitSourcePath,
    quickSplitSourceName,
    quickSplitSourceSizeBytes,
    handleQuickSplitSourceChange,
    runQuickSplitBySize
  } = useQuickSplitBySize({
    t: tForFeatures,
    exportController: exportProgressController,
    defaultTargetSizeMb: DEFAULT_SPLIT_TARGET_SIZE_MB
  });

  // EN: Quick Action #2 state/handlers are isolated in a dedicated hook.
  // ZH: 快捷功能 2（批量 LUT + 预览）状态与逻辑由独立 hook 托管。
  const {
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
    onQuickLutPreviewTimeUpdate,
    onQuickLutPreviewDurationChange,
    onQuickLutPreviewEnded
  } = useQuickLutBatch({
    t: tForFeatures,
    isQuickLutBatchPanelOpen,
    exportController: exportProgressController,
    cleanupPreviewProxy,
    clampLutIntensity,
    defaultLutIntensity: DEFAULT_LUT_INTENSITY
  });

  const {
    quickConvertBatchVideos,
    quickConvertSettings,
    quickConvertCustomTemplates,
    activeQuickConvertTemplateId,
    canSaveQuickConvertTemplate,
    showQuickConvertTemplateSaveModal,
    quickConvertTemplateModalMode,
    quickConvertTemplateDraftTitle,
    quickConvertTemplateDraftDescription,
    showQuickConvertCodecGuide,
    setShowQuickConvertCodecGuide,
    handleQuickConvertBatchVideosChange,
    clearQuickConvertBatchVideos,
    removeQuickConvertBatchVideo,
    applyQuickConvertTemplateById,
    openQuickConvertTemplateSaveModal,
    openQuickConvertTemplateRenameModal,
    deleteQuickConvertTemplate,
    closeQuickConvertTemplateSaveModal,
    updateQuickConvertTemplateDraftTitle,
    updateQuickConvertTemplateDraftDescription,
    confirmQuickConvertTemplateSave,
    updateQuickConvertFormat,
    updateQuickConvertVideoCodec,
    updateQuickConvertAudioCodec,
    updateQuickConvertCrf,
    updateQuickConvertPerformanceMode,
    runQuickConvertBatchExport
  } = useQuickConvertBatch({
    t: tForFeatures,
    exportController: exportProgressController
  });

  useEffect(() => {
    if (!isQuickConvertPanelOpen) {
      setShowQuickConvertCodecGuide(false);
    }
  }, [isQuickConvertPanelOpen, setShowQuickConvertCodecGuide]);

  useEffect(() => {
    isPreparingPreviewRef.current = isPreparingPreview;
  }, [isPreparingPreview]);

  useEffect(() => {
    const handlePreviewProgress = (_event: unknown, payload: unknown) => {
      if (!isPreviewPrepareProgressPayload(payload)) {
        return;
      }

      if (payload.jobId === activePreviewJobIdRef.current) {
        setPreviewProgressPercent(Math.min(100, Math.max(0, payload.percent)));
      }
    };

    window.ipcRenderer.on('preview-prepare-progress', handlePreviewProgress);
    return () => {
      window.ipcRenderer.off('preview-prepare-progress', handlePreviewProgress);
    };
  }, []);

  useEffect(() => {
    const handleExportProgress = (_event: unknown, payload: unknown) => {
      if (!isBatchExportProgressPayload(payload)) {
        return;
      }

      if (payload.jobId !== activeExportJobIdRef.current) {
        return;
      }

      const context = activeExportContextRef.current;
      if (!context || context.totalClips <= 0) {
        setExportProgressPercent(Math.min(100, Math.max(0, payload.percent)));
        setExportProgressClip({
          current: payload.currentClip,
          total: payload.totalClips
        });
        return;
      }

      const safePercent = Math.min(100, Math.max(0, payload.percent));
      const currentGlobalClip = Math.min(
        context.totalClips,
        context.clipOffset + Math.max(0, Math.min(context.clipCount, payload.currentClip))
      );
      const overallPercent = ((context.clipOffset + (safePercent / 100) * context.clipCount) / context.totalClips) * 100;

      setExportProgressPercent(Math.min(100, Math.max(0, overallPercent)));
      setExportProgressClip({
        current: currentGlobalClip,
        total: context.totalClips
      });
    };

    window.ipcRenderer.on('batch-export-progress', handleExportProgress);
    return () => {
      window.ipcRenderer.off('batch-export-progress', handleExportProgress);
    };
  }, []);

  const switchToProxyPreview = useCallback(async () => {
    if (!filePath || isPreparingPreviewRef.current) {
      return;
    }

    clearPreviewProgressTimer();
    const jobId = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activePreviewJobIdRef.current = jobId;
    setPreviewProgressPercent(0);
    isPreparingPreviewRef.current = true;
    setIsPreparingPreview(true);
    let conversionCompleted = false;

    try {
      const result = await window.ipcRenderer.preparePreview({
        filePath,
        forceProxy: true,
        jobId
      });

      if (!result.success) {
        console.warn('Compatible preview generation failed:', result.error);
        return;
      }

      if (activePreviewJobIdRef.current !== jobId) {
        return;
      }

      if (result.useProxy && result.url && result.path) {
        if (previewProxyPathRef.current) {
          const stalePreviewPath = previewProxyPathRef.current;
          previewProxyPathRef.current = null;
          void cleanupPreviewProxy(stalePreviewPath);
        }

        previewProxyPathRef.current = result.path;
        setVideoSrc(result.url);
        setUsingCompatiblePreview(true);

        conversionCompleted = true;
      }
    } catch (error) {
      console.warn('Compatible preview generation failed:', error);
    } finally {
      isPreparingPreviewRef.current = false;
      setIsPreparingPreview(false);

      if (activePreviewJobIdRef.current === jobId) {
        if (!conversionCompleted) {
          activePreviewJobIdRef.current = null;
          setPreviewProgressPercent(null);
        } else {
          setPreviewProgressPercent(100);
          clearPreviewProgressTimer();
          previewProgressHideTimerRef.current = window.setTimeout(() => {
            if (activePreviewJobIdRef.current === jobId) {
              activePreviewJobIdRef.current = null;
              setPreviewProgressPercent(null);
            }
            previewProgressHideTimerRef.current = null;
          }, 350);
        }
      }
    }
  }, [cleanupPreviewProxy, clearPreviewProgressTimer, filePath]);

  const switchToCompatiblePreview = useCallback(() => {
    if (!filePath || isPreparingPreviewRef.current || usingCompatiblePreview) {
      return;
    }

    void switchToProxyPreview();
  }, [filePath, switchToProxyPreview, usingCompatiblePreview]);

  // Cleanup preview proxy when component unmounts
  useEffect(() => {
    return () => {
      clearPreviewProgressTimer();
      clearExportProgressTimer();
      activePreviewJobIdRef.current = null;
      activeExportJobIdRef.current = null;
      activeExportContextRef.current = null;
      isPreparingPreviewRef.current = false;
      currentTimeRef.current = 0;
      pendingStartRef.current = null;
      lastCurrentTimeCommitRef.current = 0;
      const stalePreviewPath = previewProxyPathRef.current;
      previewProxyPathRef.current = null;
      void cleanupPreviewProxy(stalePreviewPath);
    };
  }, [cleanupPreviewProxy, clearPreviewProgressTimer, clearExportProgressTimer]);

  // Prepare playback source when file changes
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    // Cleanup stale preview proxy from previous file
    if (previewProxyPathRef.current) {
      const stalePreviewPath = previewProxyPathRef.current;
      previewProxyPathRef.current = null;
      void cleanupPreviewProxy(stalePreviewPath);
    }

    setIsPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    lastCurrentTimeCommitRef.current = 0;
    setPendingStartState(null);
    setUsingCompatiblePreview(false);
    setCompatiblePreviewSuggested(false);
    isPreparingPreviewRef.current = false;
    setIsPreparingPreview(false);
    setIsExporting(false);
    clearPreviewProgressTimer();
    clearExportProgressTimer();
    activePreviewJobIdRef.current = null;
    activeExportJobIdRef.current = null;
    activeExportContextRef.current = null;
    setPreviewProgressPercent(null);
    setExportProgressPercent(null);
    setExportProgressClip(null);
    hasAutoFallbackTriedRef.current = false;

    if (!videoFile) {
      setVideoSrc("");
      setFilePath("");
      return;
    }

    // In Electron, dropped files include an absolute local path.
    const electronPath = (videoFile as File & { path?: string }).path;

    if (electronPath) {
      setFilePath(electronPath);
      setVideoSrc(toFileUrl(electronPath));

      window.ipcRenderer.preparePreview({
        filePath: electronPath,
        forceProxy: false
      })
        .then((result) => {
          if (cancelled) return;

          if (!result.success) {
            console.warn('Preview preparation failed:', result.error);
            return;
          }

          setCompatiblePreviewSuggested(Boolean(result.suggestCompatibleMode));

          if (result.useProxy && result.url && result.path) {
            previewProxyPathRef.current = result.path;
            setVideoSrc(result.url);
            setUsingCompatiblePreview(true);
          }
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn('Preview preparation failed:', error);
        });
    } else {
      objectUrl = URL.createObjectURL(videoFile);
      setVideoSrc(objectUrl);
      setFilePath("");
    }

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [videoFile, cleanupPreviewProxy, clearExportProgressTimer, clearPreviewProgressTimer, setPendingStartState]);

  const handleDurationChange = useCallback((d: number) => {
    if (!d || !isFinite(d)) return;
    setDuration(d);
  }, []);

  const closeSegment = useCallback(() => {
    const start = pendingStartRef.current;
    if (start === null) return;

    addSegment(start, currentTimeRef.current);
  }, [addSegment]);

  // Keyboard Shortcuts (I/O)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeQueueItem) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.toLowerCase() === 'i') {
        setPendingStartState(currentTimeRef.current);
      } else if (e.key.toLowerCase() === 'o') {
        closeSegment();
      } else if (e.code === 'Space') {
        e.preventDefault(); // Prevent scroll
        setIsPlaying(p => !p);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQueueItem, closeSegment, setPendingStartState]);


  // Time Update Logic (Auto-close)
  const handleTimeUpdate = useCallback((t: number) => {
    currentTimeRef.current = t;

    const now = Date.now();
    if (now - lastCurrentTimeCommitRef.current >= CURRENT_TIME_COMMIT_INTERVAL_MS) {
      lastCurrentTimeCommitRef.current = now;
      setCurrentTime(t);
    }

    // Auto-close logic
    const pendingStartValue = pendingStartRef.current;
    if (useFixedDuration && pendingStartValue !== null && (t - pendingStartValue >= defaultDuration)) {
      addSegment(pendingStartValue, pendingStartValue + defaultDuration);
    }
  }, [addSegment, defaultDuration, useFixedDuration]);

  const deleteSegment = useCallback((videoId: string, segmentId: string) => {
    if (videoId === activeVideoId) {
      setActiveSegments((prev) => prev.filter((segment) => segment.id !== segmentId));
      return;
    }

    setVideoQueue((prevQueue) => prevQueue.map((item) => (
      item.id === videoId
        ? { ...item, segments: item.segments.filter((segment) => segment.id !== segmentId) }
        : item
    )));
  }, [activeVideoId, setActiveSegments]);

  const handleSeek = useCallback((t: number) => {
    videoPlayerRef.current?.seekTo(t);
    currentTimeRef.current = t;
    lastCurrentTimeCommitRef.current = Date.now();
    setCurrentTime(t);
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleDecodeIssue = useCallback((issue: { type: 'decode-error' | 'src-not-supported'; code?: number }) => {
    if (usingCompatiblePreview || isPreparingPreview || !filePath) {
      return;
    }

    if (hasAutoFallbackTriedRef.current) {
      return;
    }
    hasAutoFallbackTriedRef.current = true;

    console.warn('Detected preview decode issue, switching to compatible preview...', issue);
    switchToCompatiblePreview();
  }, [filePath, isPreparingPreview, switchToCompatiblePreview, usingCompatiblePreview]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleImportLut = useCallback(async () => {
    try {
      const selectedLutPath = await window.ipcRenderer.showOpenLutDialog();
      if (!selectedLutPath) {
        return;
      }

      setLutFilePath(selectedLutPath);
      setEnableLutPreview(true);
    } catch (error) {
      console.error('Failed to import LUT file:', error);
    }
  }, [setEnableLutPreview, setLutFilePath]);

  const applyLutIntensity = useCallback(() => {
    if (!hasLutFile || isPreparingPreview) {
      return;
    }

    setLutIntensity(normalizedLutIntensityDraft);
  }, [hasLutFile, isPreparingPreview, normalizedLutIntensityDraft, setLutIntensity]);

  const clearLutFile = useCallback(() => {
    setEnableLutPreview(false);
    setLutFilePath('');
    setLutIntensityDraft(normalizedLutIntensity);
  }, [normalizedLutIntensity, setEnableLutPreview, setLutFilePath, setLutIntensityDraft]);

  const handleFiles = (files: FileList) => {
    enqueueVideos(files);
  };

  const exportAllQueuedClips = async () => {
    try {
      const outputDir = await window.ipcRenderer.showOpenDialog();
      if (!outputDir) return;

      clearExportProgressTimer();
      activeExportJobIdRef.current = null;
      activeExportContextRef.current = null;
      setExportMode('clips');
      setExportProgressPercent(0);
      setExportProgressClip({ current: 0, total: totalQueueClipCount });
      setIsExporting(true);
      let exportedClipCount = 0;
      let anyExportFailed = false;
      let clipOffset = 0;
      const queueToExport = videoQueue.filter((item) => item.segments.length > 0);

      try {
        for (const queueItem of queueToExport) {
          if (!queueItem.filePath) {
            anyExportFailed = true;
            clipOffset += queueItem.segments.length;
            continue;
          }

          const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          activeExportJobIdRef.current = jobId;
          activeExportContextRef.current = {
            clipOffset,
            clipCount: queueItem.segments.length,
            totalClips: totalQueueClipCount
          };

          const res = await window.ipcRenderer.processBatch({
            filePath: queueItem.filePath,
            outputDir,
            segments: queueItem.segments.map((segment) => ({
              id: segment.id,
              start: segment.start,
              end: segment.end,
              tags: Array.isArray(segment.tags) ? segment.tags : []
            })),
            lutPath: shouldApplyLutOnExport ? normalizedLutPath : undefined,
            lutIntensity: shouldApplyLutOnExport ? normalizedLutIntensity : undefined,
            jobId
          });

          if (!res.success) {
            anyExportFailed = true;
          }

          const successCount = res.results.filter((result) => result.success).length;
          exportedClipCount += successCount;
          if (successCount !== res.results.length) {
            anyExportFailed = true;
          }

          clipOffset += queueItem.segments.length;
          setExportProgressPercent((clipOffset / Math.max(totalQueueClipCount, 1)) * 100);
          setExportProgressClip({ current: clipOffset, total: totalQueueClipCount });
        }

        if (anyExportFailed) {
          alert(t('exportFailed'));
        } else {
          alert(t('exportSuccess', { count: exportedClipCount }));
        }
      } finally {
        setIsExporting(false);
        const finalJobId = activeExportJobIdRef.current;
        activeExportJobIdRef.current = null;
        activeExportContextRef.current = null;
        setExportProgressPercent(100);
        clearExportProgressTimer();
        exportProgressHideTimerRef.current = window.setTimeout(() => {
          if (!finalJobId || activeExportJobIdRef.current === null) {
            setExportProgressPercent(null);
            setExportProgressClip(null);
          }
          exportProgressHideTimerRef.current = null;
        }, 400);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setIsExporting(false);
      activeExportJobIdRef.current = null;
      activeExportContextRef.current = null;
      clearExportProgressTimer();
      setExportProgressPercent(null);
      setExportProgressClip(null);
      console.error('Export error:', error);
      alert(t('exportError') + errorMessage);
    }
  };

  const exportAllQueuedVideosWithLut = async () => {
    try {
      if (!shouldApplyLutOnExport || !hasLutFile) {
        alert(t('lutFileMissing'));
        return;
      }

      const queueToExport = videoQueue.filter((item) => item.filePath);
      if (queueToExport.length === 0) {
        alert(t('pathError'));
        return;
      }

      const outputDir = await window.ipcRenderer.showOpenDialog();
      if (!outputDir) return;

      clearExportProgressTimer();
      const jobId = `export-full-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeExportJobIdRef.current = jobId;
      activeExportContextRef.current = null;
      setExportMode('full');
      setExportProgressPercent(0);
      setExportProgressClip({ current: 0, total: queueToExport.length });
      setIsExporting(true);
      let exportCompleted = false;

      try {
        const res = await window.ipcRenderer.processLutFullBatch({
          videos: queueToExport.map((item) => ({
            id: item.id,
            filePath: item.filePath
          })),
          outputDir,
          lutPath: normalizedLutPath,
          lutIntensity: normalizedLutIntensity,
          jobId
        });

        const successCount = res.results.filter((result) => result.success).length;
        exportCompleted = true;
        if (!res.success || successCount !== res.results.length) {
          alert(t('exportFailed'));
        } else {
          alert(t('exportSuccess', { count: successCount }));
        }
      } finally {
        setIsExporting(false);
        if (activeExportJobIdRef.current === jobId) {
          activeExportJobIdRef.current = null;
          activeExportContextRef.current = null;
          if (exportCompleted) {
            setExportProgressPercent(100);
            clearExportProgressTimer();
            exportProgressHideTimerRef.current = window.setTimeout(() => {
              if (activeExportJobIdRef.current === null) {
                setExportProgressPercent(null);
                setExportProgressClip(null);
              }
              exportProgressHideTimerRef.current = null;
            }, 400);
          } else {
            setExportProgressPercent(null);
            setExportProgressClip(null);
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setIsExporting(false);
      activeExportJobIdRef.current = null;
      activeExportContextRef.current = null;
      clearExportProgressTimer();
      setExportProgressPercent(null);
      setExportProgressClip(null);
      console.error('LUT full export error:', error);
      alert(t('exportError') + errorMessage);
    }
  };

  const clipLabel = t('clip');
  const noClipsLabel = t('noClips');
  const tagsLabel = t('tags');
  const noTagLibraryLabel = t('noTagLibrary');
  const noSegmentTagsLabel = t('noSegmentTags');
  const editTagsLabel = t('editTags');
  const tagsNameHintLabel = t('tagsNameHint');
  const lutFileName = hasLutFile ? getFileNameFromPath(normalizedLutPath) : t('lutNotSelected');
  const previewLoadingText = t('preparingPreview');
  const queueVideoCountLabel = t('queueVideoCount', { count: videoQueue.length });
  const quickSplitSourceDisplayName = quickSplitSourceName || t('quickSplitNoSource');
  const quickSplitSourceSizeLabel = quickSplitSourceSizeBytes !== null
    ? formatFileSize(quickSplitSourceSizeBytes)
    : '--';
  const quickLutBatchVideoCountLabel = t('quickLutBatchVideoCount', { count: quickLutBatchVideos.length });
  const quickLutBatchTotalSizeBytes = quickLutBatchVideos.reduce((sum, item) => sum + item.sizeBytes, 0);
  const quickLutBatchTotalSizeLabel = formatFileSize(quickLutBatchTotalSizeBytes);
  const quickLutBatchLutFileName = quickLutBatchLutPath ? getFileNameFromPath(quickLutBatchLutPath) : t('lutNotSelected');
  const quickConvertVideoCountLabel = t('quickConvertVideoCount', { count: quickConvertBatchVideos.length });
  const quickConvertTotalSizeBytes = quickConvertBatchVideos.reduce((sum, item) => sum + item.sizeBytes, 0);
  const quickConvertTotalSizeLabel = formatFileSize(quickConvertTotalSizeBytes);
  const quickLutPreviewActiveVideo = quickLutPreviewVideoId
    ? quickLutBatchVideos.find((video) => video.id === quickLutPreviewVideoId) ?? null
    : null;
  const quickLutPreviewExternalLoadingText = quickLutPreviewPreparing
    ? `${t('preparingPreview')} ${Math.round(quickLutPreviewProgressPercent ?? 0)}%`
    : null;
  const exportProgressLabel = exportMode === 'full'
    ? t('exportingVideos')
    : exportMode === 'split'
      ? t('quickSplitting')
      : exportMode === 'convert'
        ? t('quickConverting')
      : t('exportingClips');

  return (
    <div
      className="h-screen bg-zinc-950 text-zinc-100 selection:bg-blue-500/30 flex flex-col overflow-hidden transition-colors duration-300"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif' }}
    >
      <AppHeader theme={resolvedTheme} />

      <SettingsModal
        visible={showSettings}
        t={t}
        onClose={() => setShowSettings(false)}
        defaultFixedDuration={DEFAULT_FIXED_DURATION}
        useFixedDuration={useFixedDuration}
        setUseFixedDuration={setUseFixedDuration}
        defaultDuration={defaultDuration}
        setDefaultDuration={setDefaultDuration}
        hasLutFile={hasLutFile}
        lutFileName={lutFileName}
        onImportLut={() => {
          void handleImportLut();
        }}
        onClearLut={clearLutFile}
        enableLutPreview={enableLutPreview}
        onToggleLutPreview={() => {
          if (!hasLutFile) {
            alert(t('lutFileMissing'));
            return;
          }
          setEnableLutPreview(!enableLutPreview);
        }}
      />

      <QueueModal
        visible={showQueue}
        t={t}
        onClose={() => setShowQueue(false)}
        videoFileAccept={VIDEO_FILE_ACCEPT}
        onFileChange={handleChange}
        queueVideoCountLabel={queueVideoCountLabel}
        videoQueue={videoQueue}
        activeVideoId={activeVideoId}
        draggingQueueVideoId={draggingQueueVideoId}
        dragOverQueueVideoId={dragOverQueueVideoId}
        onDragStart={handleQueueDragStart}
        onDragOver={handleQueueDragOver}
        onDrop={handleQueueDrop}
        onDragEnd={handleQueueDragEnd}
        onSwitchVideo={switchToQueueVideo}
        onRemoveVideo={removeQueueVideo}
      />

      <QuickLutPreviewVideoListModal
        isOpen={showQuickLutPreviewVideoList && isQuickLutBatchPanelOpen}
        t={t}
        videos={quickLutBatchVideos}
        activeVideoId={quickLutPreviewVideoId}
        onClose={() => setShowQuickLutPreviewVideoList(false)}
        onSwitchVideo={switchQuickLutPreviewVideo}
        formatFileSize={formatFileSize}
      />

      <LutFullExportConfirmModal
        visible={showLutFullExportConfirm}
        t={t}
        onCancel={() => setShowLutFullExportConfirm(false)}
        onConfirm={() => {
          setShowLutFullExportConfirm(false);
          void exportAllQueuedVideosWithLut();
        }}
      />

      <ProgressOverlays
        isPreparingPreview={isPreparingPreview}
        previewProgressPercent={previewProgressPercent}
        previewLoadingText={previewLoadingText}
        isExporting={isExporting}
        exportProgressPercent={exportProgressPercent}
        exportProgressLabel={exportProgressLabel}
        exportProgressClip={exportProgressClip}
      />


      {/* Main Content */}
      <main className="pt-14 flex-1 flex overflow-hidden">
        {!activeQueueItem ? (
          <MainLandingWorkspace
            t={t}
            dragActive={dragActive}
            isQuickSplitPanelOpen={isQuickSplitPanelOpen}
            isQuickLutBatchPanelOpen={isQuickLutBatchPanelOpen}
            videoFileAccept={VIDEO_FILE_ACCEPT}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onSourceVideosChange={handleChange}
            quickLutPreviewActiveVideoDisplayName={quickLutPreviewActiveVideo?.displayName ?? ''}
            quickLutBatchVideoCount={quickLutBatchVideos.length}
            onOpenQuickLutPreviewVideoList={() => setShowQuickLutPreviewVideoList(true)}
            quickLutPreviewPlayerRef={quickLutPreviewPlayerRef}
            quickLutRealtimePreviewEnabled={quickLutRealtimePreviewEnabled}
            quickLutPreviewSrc={quickLutPreviewSrc}
            quickLutPreviewPlaying={quickLutPreviewPlaying}
            onToggleQuickLutPreviewPlaying={toggleQuickLutPreviewPlaying}
            onQuickLutPreviewTimeUpdate={onQuickLutPreviewTimeUpdate}
            onQuickLutPreviewDurationChange={onQuickLutPreviewDurationChange}
            onQuickLutPreviewEnded={onQuickLutPreviewEnded}
            onQuickLutPreviewDecodeIssue={handleQuickLutPreviewDecodeIssue}
            quickLutPreviewExternalLoadingText={quickLutPreviewExternalLoadingText}
            quickLutPreviewLutEnabled={quickLutRealtimePreviewEnabled && Boolean(quickLutBatchLutPath)}
            quickLutPreviewLutPath={quickLutRealtimePreviewEnabled && quickLutBatchLutPath ? quickLutBatchLutPath : null}
            quickLutPreviewLutIntensity={clampLutIntensity(quickLutBatchLutIntensity)}
            quickLutPreviewCurrentTime={quickLutPreviewCurrentTime}
            quickLutPreviewDuration={quickLutPreviewDuration}
            quickLutPreviewCurrentTimeLabel={formatTime(quickLutPreviewCurrentTime)}
            quickLutPreviewDurationLabel={formatTime(quickLutPreviewDuration)}
            onQuickLutPreviewSeek={handleQuickLutPreviewSeek}
            quickLutPreviewUsingCompatible={quickLutPreviewUsingCompatible}
            quickLutPreviewCompatibleSuggested={quickLutPreviewCompatibleSuggested}
            onUseQuickLutCompatiblePreview={switchToQuickLutCompatiblePreview}
            quickLutPreviewPreparing={quickLutPreviewPreparing}
            onToggleQuickSplitPanel={() => {
              setActiveQuickAction((prev) => prev === 'split-by-size' ? null : 'split-by-size');
            }}
            quickSplitTargetSizeMb={quickSplitTargetSizeMb}
            setQuickSplitTargetSizeMb={setQuickSplitTargetSizeMb}
            defaultSplitTargetSizeMb={DEFAULT_SPLIT_TARGET_SIZE_MB}
            minSplitTargetSizeMb={MIN_SPLIT_TARGET_SIZE_MB}
            maxSplitTargetSizeMb={MAX_SPLIT_TARGET_SIZE_MB}
            quickSplitSourcePath={quickSplitSourcePath}
            quickSplitSourceDisplayName={quickSplitSourceDisplayName}
            quickSplitSourceSizeLabel={quickSplitSourceSizeLabel}
            onQuickSplitSourceChange={handleQuickSplitSourceChange}
            onRunQuickSplit={() => {
              void runQuickSplitBySize();
            }}
            onToggleQuickLutBatchPanel={() => {
              setActiveQuickAction((prev) => prev === 'lut-full-batch' ? null : 'lut-full-batch');
            }}
            onToggleQuickLutRealtimePreview={() => setQuickLutRealtimePreviewEnabled((prev) => !prev)}
            quickLutBatchVideoCountLabel={quickLutBatchVideoCountLabel}
            quickLutBatchTotalSizeLabel={quickLutBatchTotalSizeLabel}
            quickLutBatchVideos={quickLutBatchVideos}
            onQuickLutBatchVideosChange={handleQuickLutBatchVideosChange}
            onClearQuickLutBatchVideos={clearQuickLutBatchVideos}
            onRemoveQuickLutBatchVideo={removeQuickLutBatchVideo}
            quickLutBatchLutPath={quickLutBatchLutPath}
            quickLutBatchLutFileName={quickLutBatchLutFileName}
            onSelectQuickLutBatchLut={() => {
              void handleQuickLutBatchImportLut();
            }}
            onClearQuickLutBatchLut={() => setQuickLutBatchLutPath('')}
            quickLutBatchLutIntensity={quickLutBatchLutIntensity}
            onChangeQuickLutBatchLutIntensity={(value) => setQuickLutBatchLutIntensity(clampLutIntensity(value))}
            onRunQuickLutBatchExport={() => {
              void runQuickLutBatchExport();
            }}
            isQuickConvertPanelOpen={isQuickConvertPanelOpen}
            onToggleQuickConvertPanel={() => {
              setActiveQuickAction((prev) => prev === 'convert-batch' ? null : 'convert-batch');
            }}
            quickConvertVideoCountLabel={quickConvertVideoCountLabel}
            quickConvertTotalSizeLabel={quickConvertTotalSizeLabel}
            quickConvertBatchVideos={quickConvertBatchVideos}
            quickConvertCustomTemplates={quickConvertCustomTemplates}
            onQuickConvertBatchVideosChange={handleQuickConvertBatchVideosChange}
            onClearQuickConvertBatchVideos={clearQuickConvertBatchVideos}
            onRemoveQuickConvertBatchVideo={removeQuickConvertBatchVideo}
            quickConvertSettings={quickConvertSettings}
            activeQuickConvertTemplateId={activeQuickConvertTemplateId}
            canSaveQuickConvertTemplate={canSaveQuickConvertTemplate}
            onApplyQuickConvertTemplateById={applyQuickConvertTemplateById}
            showQuickConvertTemplateSaveModal={showQuickConvertTemplateSaveModal}
            quickConvertTemplateModalMode={quickConvertTemplateModalMode}
            quickConvertTemplateDraftTitle={quickConvertTemplateDraftTitle}
            quickConvertTemplateDraftDescription={quickConvertTemplateDraftDescription}
            onOpenQuickConvertTemplateSaveModal={openQuickConvertTemplateSaveModal}
            onOpenQuickConvertTemplateRenameModal={openQuickConvertTemplateRenameModal}
            onDeleteQuickConvertTemplate={deleteQuickConvertTemplate}
            onCloseQuickConvertTemplateSaveModal={closeQuickConvertTemplateSaveModal}
            onChangeQuickConvertTemplateDraftTitle={updateQuickConvertTemplateDraftTitle}
            onChangeQuickConvertTemplateDraftDescription={updateQuickConvertTemplateDraftDescription}
            onConfirmQuickConvertTemplateSave={confirmQuickConvertTemplateSave}
            onChangeQuickConvertFormat={updateQuickConvertFormat}
            onChangeQuickConvertVideoCodec={updateQuickConvertVideoCodec}
            onChangeQuickConvertAudioCodec={updateQuickConvertAudioCodec}
            onChangeQuickConvertCrf={updateQuickConvertCrf}
            onChangeQuickConvertPerformanceMode={updateQuickConvertPerformanceMode}
            showQuickConvertCodecGuide={showQuickConvertCodecGuide}
            onOpenQuickConvertCodecGuide={() => setShowQuickConvertCodecGuide(true)}
            onCloseQuickConvertCodecGuide={() => setShowQuickConvertCodecGuide(false)}
            onRunQuickConvertBatchExport={() => {
              void runQuickConvertBatchExport();
            }}
            isExporting={isExporting}
            exportMode={exportMode}
            exportProgressPercent={exportProgressPercent}
          />
        ) : (
          <MainEditorWorkspace
            t={t}
            videoPlayerRef={videoPlayerRef}
            videoSrc={videoSrc}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onVideoEnded={handleVideoEnded}
            onDecodeIssue={handleDecodeIssue}
            isPreparingPreview={isPreparingPreview}
            previewLoadingText={previewLoadingText}
            previewProgressPercent={previewProgressPercent}
            shouldApplyLutOnPreview={shouldApplyLutOnPreview}
            normalizedLutPath={normalizedLutPath}
            normalizedLutIntensity={normalizedLutIntensity}
            currentTime={currentTime}
            duration={duration}
            usingCompatiblePreview={usingCompatiblePreview}
            compatiblePreviewSuggested={compatiblePreviewSuggested}
            onUseCompatiblePreview={switchToCompatiblePreview}
            usingLutPreview={usingLutPreview}
            normalizedLutIntensityDraft={normalizedLutIntensityDraft}
            onChangeLutIntensityDraft={(value) => setLutIntensityDraft(clampLutIntensity(value))}
            hasPendingLutIntensity={hasPendingLutIntensity}
            onApplyLutIntensity={applyLutIntensity}
            pendingStart={pendingStart}
            segments={segments}
            onSeek={handleSeek}
            onMarkIn={() => setPendingStartState(currentTimeRef.current)}
            onMarkOut={closeSegment}
            totalQueueClipCount={totalQueueClipCount}
            onOpenQueue={() => setShowQueue(true)}
            onOpenSettings={() => setShowSettings(true)}
            onRemoveActiveVideo={() => {
              if (activeVideoId) {
                removeQueueVideo(activeVideoId);
              }
            }}
            tagsLabel={tagsLabel}
            tagLibrary={tagLibrary}
            newTagDraft={newTagDraft}
            maxTagLength={MAX_TAG_LENGTH}
            tagPlaceholder={t('tagPlaceholder')}
            onNewTagDraftChange={setNewTagDraft}
            onAddTag={commitTagDraft}
            noTagLibraryLabel={noTagLibraryLabel}
            onRemoveTagFromLibrary={removeTagFromLibrary}
            tagsNameHintLabel={tagsNameHintLabel}
            videoQueue={videoQueue}
            activeVideoId={activeVideoId}
            clipLabel={clipLabel}
            noClipsLabel={noClipsLabel}
            noSegmentTagsLabel={noSegmentTagsLabel}
            editTagsLabel={editTagsLabel}
            onSwitchVideo={switchToQueueVideo}
            onDeleteSegment={deleteSegment}
            onToggleSegmentTag={toggleSegmentTag}
            isExporting={isExporting}
            exportProgressPercent={exportProgressPercent}
            onExportAllClips={() => {
              void exportAllQueuedClips();
            }}
            shouldApplyLutOnExport={shouldApplyLutOnExport}
            onOpenLutFullExportConfirm={() => setShowLutFullExportConfirm(true)}
            formatTime={formatTime}
          />
        )}
      </main>

      <GlobalStatusBar
        t={t}
        language={language}
        onToggleLanguage={toggleLanguage}
        themePreference={themePreference}
        resolvedTheme={resolvedTheme}
        onChangeThemePreference={changeThemePreference}
        appVersion={APP_VERSION}
      />
    </div>
  );
}

export default App;
