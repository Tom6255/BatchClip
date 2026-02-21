import { memo, useState, useRef, useEffect, useCallback, type ButtonHTMLAttributes } from 'react';
import { Upload, X, Zap, Download, Trash2, Scissors, Settings as SettingsIcon } from 'lucide-react';
import { cn } from './lib/utils';
import VideoPlayer, { VideoPlayerRef } from './components/VideoPlayer';
import Timeline from './components/Timeline';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_FIXED_DURATION = 3.9;
const DEFAULT_LUT_INTENSITY = 100;
const CURRENT_TIME_COMMIT_INTERVAL_MS = 80;

const toFileUrl = (absolutePath: string) => {
  const normalized = absolutePath.replace(/\\/g, '/');
  return encodeURI(normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`);
};

const getFileNameFromPath = (absolutePath: string) => {
  const parts = absolutePath.split(/[\\/]/);
  const fileName = parts[parts.length - 1];
  return fileName || absolutePath;
};

const clampLutIntensity = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_LUT_INTENSITY;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const translations = {
  en: {
    runningTime: 'Running Time',
    total: 'Total',
    setIn: 'Set In',
    setOut: 'Set Out',
    playPause: 'Play/Pause',
    markIn: 'Mark In',
    markOut: 'Mark Out',
    clips: 'Clips',
    noClips: 'No clips created. Use I and O to snip.',
    clip: 'Clip',
    exportAll: 'Export All Clips',
    dropVideo: 'Drop video to start',
    selectVideo: 'Select Video',
    settings: 'Settings',
    fixedDuration: 'Fixed Duration',
    fixedDurationDesc: 'Auto-close clip at default duration',
    defaultDurationLabel: 'Default Duration (seconds)',
    disabledDesc: 'Disabled when fixed duration is off',
    done: 'Done',
    language: 'Language',
    uploadVideoAlert: 'Please upload a video file.',
    pathError: 'Could not determine source file path. Please try dropping the file again.',
    exporting: 'Exporting...',
    exportSuccess: 'Exported {count} clips successfully!',
    exportFailed: 'Some exports failed. Check console for details.',
    exportError: 'Export failed: ',
    exportingClips: 'Exporting clips...',
    preparingPreview: 'Preparing compatible preview...',
    compatiblePreviewMode: 'Compatible Preview Mode',
    useCompatiblePreview: 'Use Compatible Preview',
    preparingLutPreview: 'Preparing LUT preview...',
    lutPreviewMode: 'LUT Preview Mode',
    lutSettings: 'LUT Restore',
    lutFile: 'LUT File',
    importLut: 'Import .cube',
    clearLut: 'Clear LUT',
    lutNotSelected: 'No LUT selected',
    enableLutPreview: 'Enable LUT Preview',
    enableLutPreviewDesc: 'Apply LUT in preview and export',
    lutFileMissing: 'Please import a LUT (.cube) file first.',
    lutIntensity: 'LUT Intensity',
    lutIntensityDesc: '0% keeps original, 100% uses full LUT',
    applyLutIntensity: 'Apply'
  },
  zh: {
    runningTime: '当前进度',
    total: '总时长',
    setIn: '入点',
    setOut: '出点',
    playPause: '播放/暂停',
    markIn: '设置入点',
    markOut: '设置出点',
    clips: '片段列表',
    noClips: '暂无片段。使用 I 和 O 键进行快速剪辑。',
    clip: '片段',
    exportAll: '批量导出所有片段',
    dropVideo: '拖入视频文件开始处理',
    selectVideo: '选择本地视频',
    settings: '偏好设置',
    fixedDuration: '固定时长模式',
    fixedDurationDesc: '达到预设值后自动结束当前片段',
    defaultDurationLabel: '默认裁剪时长 (秒)',
    disabledDesc: '非固定时长模式下已禁用',
    done: '确定',
    language: '界面语言',
    uploadVideoAlert: '请上传视频文件。',
    pathError: '未能识别文件路径，请重新尝试拖入文件。',
    exporting: '正在导出...',
    exportSuccess: '成功导出 {count} 个视频片段！',
    exportFailed: '部分导出任务失败，请检查控制台输出。',
    exportError: '导出过程中出错: ',
    exportingClips: '正在导出片段...',
    preparingPreview: '正在生成兼容预览...',
    compatiblePreviewMode: '兼容预览模式',
    useCompatiblePreview: '启用兼容预览',
    preparingLutPreview: '正在生成 LUT 预览...',
    lutPreviewMode: 'LUT 预览模式',
    lutSettings: 'LUT 还原',
    lutFile: 'LUT 文件',
    importLut: '导入 .cube',
    clearLut: '清除 LUT',
    lutNotSelected: '未选择 LUT 文件',
    enableLutPreview: '启用 LUT 预览',
    enableLutPreviewDesc: '预览与导出均套用当前 LUT',
    lutFileMissing: '请先导入 LUT（.cube）文件。',
    lutIntensity: 'LUT 强度',
    lutIntensityDesc: '0% 保持原片，100% 完全套用 LUT',
    applyLutIntensity: '应用'
  }
};

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

// Reusable Button Component
const Button = ({ className, variant = 'primary', ...props }: ButtonProps) => {
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300",
    ghost: "bg-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-white",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
  };
  return (
    <button
      className={cn(
        "px-4 py-2 rounded-lg font-medium transition-all duration-200 active:scale-95 flex items-center justify-center gap-2",
        variants[variant as keyof typeof variants],
        className
      )}
      {...props}
    />
  );
};

// Types
interface Segment {
  id: string;
  start: number;
  end: number;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

interface SegmentListProps {
  segments: Segment[];
  clipLabel: string;
  emptyLabel: string;
  onDeleteSegment: (id: string) => void;
}

const SegmentList = memo(function SegmentList({ segments, clipLabel, emptyLabel, onDeleteSegment }: SegmentListProps) {
  if (segments.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-10 text-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <>
      {segments.map((seg, idx) => (
        <div key={seg.id} className="bg-zinc-950 p-3 rounded border border-white/5 flex items-center gap-3 group">
          <div className="w-6 h-6 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center text-xs font-mono">
            {idx + 1}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-zinc-300">
              {clipLabel} {idx + 1}
            </div>
            <div className="text-xs text-zinc-500 font-mono">
              {formatTime(seg.start)} - {formatTime(seg.end)}
            </div>
          </div>
          <button
            className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
            onClick={() => onDeleteSegment(seg.id)}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </>
  );
});

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
  const [dragActive, setDragActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings State
  const [useFixedDuration, setUseFixedDuration] = useState(() => {
    const saved = localStorage.getItem('useFixedDuration');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [defaultDuration, setDefaultDuration] = useState(() => {
    const saved = localStorage.getItem('defaultDuration');
    return saved !== null ? JSON.parse(saved) : DEFAULT_FIXED_DURATION;
  });
  const [language, setLanguage] = useState<'en' | 'zh'>(() => {
    const saved = localStorage.getItem('language');
    return (saved === 'en' || saved === 'zh') ? saved : 'zh';
  });
  const [lutFilePath, setLutFilePath] = useState(() => {
    return localStorage.getItem('lutFilePath') ?? '';
  });
  const [enableLutPreview, setEnableLutPreview] = useState(false);
  const [lutIntensity, setLutIntensity] = useState(() => {
    const saved = localStorage.getItem('lutIntensity');
    if (saved === null) {
      return DEFAULT_LUT_INTENSITY;
    }

    return clampLutIntensity(Number(saved));
  });
  const [lutIntensityDraft, setLutIntensityDraft] = useState(() => {
    const saved = localStorage.getItem('lutIntensity');
    if (saved === null) {
      return DEFAULT_LUT_INTENSITY;
    }

    return clampLutIntensity(Number(saved));
  });

  // i18n helper
  const t = (key: keyof typeof translations.en, params?: Record<string, string | number>) => {
    let text = translations[language][key] || translations.en[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v.toString());
      });
    }
    return text;
  };

  // Save settings when they change
  useEffect(() => {
    localStorage.setItem('useFixedDuration', JSON.stringify(useFixedDuration));
  }, [useFixedDuration]);

  useEffect(() => {
    localStorage.setItem('defaultDuration', JSON.stringify(defaultDuration));
  }, [defaultDuration]);

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('lutFilePath', lutFilePath);
  }, [lutFilePath]);

  useEffect(() => {
    localStorage.setItem('lutIntensity', String(lutIntensity));
  }, [lutIntensity]);


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
  const [exportProgressPercent, setExportProgressPercent] = useState<number | null>(null);
  const [exportProgressClip, setExportProgressClip] = useState<{ current: number; total: number } | null>(null);
  const [usingCompatiblePreview, setUsingCompatiblePreview] = useState(false);
  const [compatiblePreviewSuggested, setCompatiblePreviewSuggested] = useState(false);
  const previewProxyPathRef = useRef<string | null>(null);
  const activePreviewJobIdRef = useRef<string | null>(null);
  const activeExportJobIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    setLutIntensityDraft(normalizedLutIntensity);
  }, [normalizedLutIntensity]);

  const setPendingStartState = useCallback((value: number | null) => {
    pendingStartRef.current = value;
    setPendingStart(value);
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
      end: normalizedEnd
    };

    setSegments((prev) => {
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
  }, [defaultDuration, setPendingStartState, useFixedDuration]);

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

  useEffect(() => {
    isPreparingPreviewRef.current = isPreparingPreview;
  }, [isPreparingPreview]);

  useEffect(() => {
    const handlePreviewProgress = (_event: unknown, payload: unknown) => {
      if (!isPreviewPrepareProgressPayload(payload)) {
        return;
      }

      if (payload.jobId !== activePreviewJobIdRef.current) {
        return;
      }

      setPreviewProgressPercent(Math.min(100, Math.max(0, payload.percent)));
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

      setExportProgressPercent(Math.min(100, Math.max(0, payload.percent)));
      setExportProgressClip({
        current: payload.currentClip,
        total: payload.totalClips
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
    setSegments([]);
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
      if (!videoFile) return;
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
  }, [videoFile, closeSegment, setPendingStartState]);


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

  const deleteSegment = useCallback((id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  }, []);

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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
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
  }, []);

  const applyLutIntensity = useCallback(() => {
    if (!hasLutFile || isPreparingPreview) {
      return;
    }

    setLutIntensity(normalizedLutIntensityDraft);
  }, [hasLutFile, isPreparingPreview, normalizedLutIntensityDraft]);

  const clearLutFile = useCallback(() => {
    setEnableLutPreview(false);
    setLutFilePath('');
    setLutIntensityDraft(normalizedLutIntensity);
  }, [normalizedLutIntensity]);

  const handleFiles = (files: FileList) => {
    const file = files[0];
    const fileName = file.name.toLowerCase();
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.ts', '.m4s'];
    const hasVideoExtension = videoExtensions.some(ext => fileName.endsWith(ext));

    if (file.type.startsWith('video/') || hasVideoExtension) {
      setVideoFile(file);
    } else {
      alert(t('uploadVideoAlert'));
    }
  };

  const clipLabel = t('clip');
  const noClipsLabel = t('noClips');
  const lutFileName = hasLutFile ? getFileNameFromPath(normalizedLutPath) : t('lutNotSelected');
  const previewLoadingText = t('preparingPreview');

  return (
    <div
      className="h-screen bg-zinc-950 text-zinc-100 selection:bg-blue-500/30 flex flex-col overflow-hidden"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif' }}
    >

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-zinc-950/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-50 titlebar-drag-region">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
            Batch<span className="font-light text-zinc-600">Clip</span>
          </span>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-blue-500" />
                {t('settings')}
              </h3>
              <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowSettings(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-zinc-200">{t('fixedDuration')}</label>
                    <p className="text-xs text-zinc-500">{t('fixedDurationDesc')}</p>
                  </div>
                  <button
                    onClick={() => setUseFixedDuration(!useFixedDuration)}
                    className={cn(
                      "w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none",
                      useFixedDuration ? "bg-blue-600" : "bg-zinc-700"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full bg-white transition-transform duration-200 mx-1",
                      useFixedDuration ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className={cn("space-y-3 transition-opacity duration-200", !useFixedDuration && "opacity-50")}>
                  <label className="text-sm font-medium text-zinc-200 block">
                    {t('defaultDurationLabel')}
                  </label>
                  <div className="relative group">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={defaultDuration}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) setDefaultDuration(val);
                      }}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (isNaN(val) || val <= 0) setDefaultDuration(DEFAULT_FIXED_DURATION);
                      }}
                      disabled={!useFixedDuration}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 pointer-events-none">
                      sec
                    </div>
                  </div>
                  {!useFixedDuration && (
                    <p className="text-[10px] text-zinc-500">{t('disabledDesc')}</p>
                  )}
                </div>

                <div className="pt-4 border-t border-white/5 space-y-3">
                  <label className="text-sm font-medium text-zinc-200 block">
                    {t('lutSettings')}
                  </label>

                  <div className="space-y-3 rounded-lg border border-white/10 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] text-zinc-500">{t('lutFile')}</p>
                        <p className={cn(
                          "text-xs font-mono truncate mt-1",
                          hasLutFile ? "text-zinc-200" : "text-zinc-500"
                        )}>
                          {lutFileName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="secondary"
                          className="h-8 px-3 text-xs"
                          onClick={() => {
                            void handleImportLut();
                          }}
                        >
                          {t('importLut')}
                        </Button>
                        {hasLutFile && (
                          <Button
                            variant="ghost"
                            className="h-8 px-2 text-xs text-zinc-500 hover:text-red-400"
                            onClick={clearLutFile}
                          >
                            {t('clearLut')}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium text-zinc-200">{t('enableLutPreview')}</label>
                        <p className="text-xs text-zinc-500">{t('enableLutPreviewDesc')}</p>
                      </div>
                      <button
                        onClick={() => {
                          if (!hasLutFile) {
                            alert(t('lutFileMissing'));
                            return;
                          }
                          setEnableLutPreview(!enableLutPreview);
                        }}
                        disabled={!hasLutFile}
                        className={cn(
                          "w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none",
                          enableLutPreview ? "bg-blue-600" : "bg-zinc-700",
                          !hasLutFile && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-full bg-white transition-transform duration-200 mx-1",
                          enableLutPreview ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-3">
                  <label className="text-sm font-medium text-zinc-200 block">
                    {t('language')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setLanguage('en')}
                      className={cn(
                        "px-3 py-2 rounded-lg text-sm transition-all border",
                        language === 'en'
                          ? "bg-blue-600/10 border-blue-500 text-blue-500"
                          : "bg-zinc-800/50 border-white/5 text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      English
                    </button>
                    <button
                      onClick={() => setLanguage('zh')}
                      className={cn(
                        "px-3 py-2 rounded-lg text-sm transition-all border",
                        language === 'zh'
                          ? "bg-blue-600/10 border-blue-500 text-blue-500"
                          : "bg-zinc-800/50 border-white/5 text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      简体中文
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-zinc-900/50 border-t border-white/5">
              <Button className="w-full" onClick={() => setShowSettings(false)}>{t('done')}</Button>
            </div>
          </div>
        </div>
      )}

      {isPreparingPreview && previewProgressPercent !== null && (
        <div className="fixed top-16 right-5 z-[95] pointer-events-none">
          <div className="w-72 rounded-xl border border-white/10 bg-zinc-900/85 backdrop-blur-xl shadow-2xl p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-zinc-200">{previewLoadingText}</span>
              <span className="font-mono text-cyan-300">{Math.round(previewProgressPercent)}%</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-[width] duration-200"
                style={{ width: `${Math.min(100, Math.max(0, previewProgressPercent))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {isExporting && exportProgressPercent !== null && (
        <div className={cn(
          "fixed right-5 z-[95] pointer-events-none",
          isPreparingPreview && previewProgressPercent !== null ? "top-36" : "top-16"
        )}>
          <div className="w-72 rounded-xl border border-white/10 bg-zinc-900/85 backdrop-blur-xl shadow-2xl p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-zinc-200">{t('exportingClips')}</span>
              <div className="flex items-center gap-2">
                {exportProgressClip && exportProgressClip.total > 0 && (
                  <span className="font-mono text-zinc-400">
                    {Math.min(exportProgressClip.current, exportProgressClip.total)}/{exportProgressClip.total}
                  </span>
                )}
                <span className="font-mono text-emerald-300">{Math.round(exportProgressPercent)}%</span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-[width] duration-200"
                style={{ width: `${Math.min(100, Math.max(0, exportProgressPercent))}%` }}
              />
            </div>
          </div>
        </div>
      )}


      {/* Main Content */}
      <main className="pt-14 flex-1 flex overflow-hidden">
        {!videoFile ? (
          <div
            className={cn(
              "flex-1 m-6 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl transition-all duration-300 gap-6 bg-zinc-900/30",
              dragActive ? "border-blue-500 bg-blue-500/10" : "border-zinc-800 hover:border-zinc-700"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <Upload className="w-12 h-12 mx-auto text-zinc-600" />
              <h2 className="text-2xl font-semibold text-white">{t('dropVideo')}</h2>
              <input type="file" className="hidden" id="file-upload" accept="video/*,.mp4,.mov,.avi,.mkv,.flv,.wmv,.webm,.ts,.m4s" onChange={handleChange} />
              <Button onClick={() => document.getElementById('file-upload')?.click()}>{t('selectVideo')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex gap-4 p-4 w-full max-w-full overflow-hidden">

            {/* Left Column: Player & Timeline */}
            <div className="flex-[3] flex flex-col gap-4 min-w-0 h-full overflow-hidden">

              {/* Player */}
              <div className="flex-1 bg-black rounded-lg overflow-hidden relative shadow-2xl flex items-center justify-center min-h-0">

                <VideoPlayer
                  ref={videoPlayerRef}
                  src={videoSrc}
                  isPlaying={isPlaying}
                  onPlayPause={handlePlayPause}
                  onTimeUpdate={handleTimeUpdate}
                  onDurationChange={handleDurationChange}
                  onEnded={handleVideoEnded}
                  onDecodeIssue={handleDecodeIssue}
                  externalLoadingText={isPreparingPreview ? `${previewLoadingText} ${Math.round(previewProgressPercent ?? 0)}%` : null}
                  lutEnabled={shouldApplyLutOnPreview}
                  lutPath={shouldApplyLutOnPreview ? normalizedLutPath : null}
                  lutIntensity={normalizedLutIntensity}
                />

              </div>

              {/* Timeline Controls */}
              <div className="h-48 bg-zinc-900 border border-white/5 rounded-lg p-4 flex flex-col gap-2 flex-shrink-0">

                <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
                  <span>{t('runningTime')}: {formatTime(currentTime)}</span>
                  <div className="flex items-center gap-3">
                    {!usingCompatiblePreview && compatiblePreviewSuggested && (
                      <Button
                        variant="ghost"
                        className="h-6 px-2 text-[11px] text-amber-400 hover:text-amber-300"
                        onClick={switchToCompatiblePreview}
                        disabled={isPreparingPreview}
                      >
                        {t('useCompatiblePreview')}
                      </Button>
                    )}
                    {usingLutPreview && (
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-300">{t('lutPreviewMode')}</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={normalizedLutIntensityDraft}
                          disabled={isPreparingPreview}
                          onChange={(e) => {
                            setLutIntensityDraft(clampLutIntensity(Number(e.target.value)));
                          }}
                          aria-label={t('lutIntensity')}
                          className="w-24 accent-cyan-400 disabled:opacity-50"
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={normalizedLutIntensityDraft}
                          disabled={isPreparingPreview}
                          onChange={(e) => {
                            setLutIntensityDraft(clampLutIntensity(Number(e.target.value)));
                          }}
                          className="w-14 bg-zinc-800 border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 font-mono"
                        />
                        <span className="text-cyan-200">%</span>
                        <Button
                          variant={hasPendingLutIntensity ? 'primary' : 'secondary'}
                          className="h-6 px-2 text-[11px]"
                          onClick={applyLutIntensity}
                          disabled={isPreparingPreview || !hasPendingLutIntensity}
                        >
                          {t('applyLutIntensity')}
                        </Button>
                      </div>
                    )}
                    {usingCompatiblePreview && (
                      <span className="text-amber-400">{t('compatiblePreviewMode')}</span>
                    )}
                    <span>{t('total')}: {formatTime(duration)}</span>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <Timeline
                    duration={duration}
                    currentTime={currentTime}
                    segments={segments}
                    pendingStart={pendingStart}
                    onSeek={handleSeek}
                  />
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 text-xs font-mono">I</kbd>
                    <span className="text-sm text-zinc-400">{t('setIn')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 text-xs font-mono">O</kbd>
                    <span className="text-sm text-zinc-400">{t('setOut')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 text-xs font-mono">Space</kbd>
                    <span className="text-sm text-zinc-400">{t('playPause')}</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="h-8 text-xs font-normal"
                      onClick={() => setPendingStartState(currentTimeRef.current)}
                      disabled={pendingStart !== null}
                    >
                      {t('markIn')} (I)
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-8 text-xs font-normal"
                      onClick={closeSegment}
                      disabled={pendingStart === null}
                    >
                      {t('markOut')} (O)
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Segment List */}
            <div className="flex-1 bg-zinc-900 border border-white/5 rounded-lg flex flex-col min-w-[300px]">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-blue-500" />
                  {t('clips')} ({segments.length})
                </h3>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowSettings(true)}>
                    <SettingsIcon className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" className="h-8 w-8 p-0 no-drag" onClick={() => setVideoFile(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>

              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                <SegmentList
                  segments={segments}
                  clipLabel={clipLabel}
                  emptyLabel={noClipsLabel}
                  onDeleteSegment={deleteSegment}
                />
              </div>

              <div className="p-4 border-t border-white/5 bg-zinc-900">
                <Button
                  className="w-full"
                  disabled={segments.length === 0 || isExporting}
                  onClick={async () => {
                    console.log("Export button clicked");
                    try {
                      if (!filePath) {
                        console.error("No file path");
                        alert(t('pathError'));
                        return;
                      }

                      console.log("Requesting output directory...");
                      const outputDir = await window.ipcRenderer.showOpenDialog();
                      console.log("Output directory:", outputDir);

                      if (!outputDir) return;

                      const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                      clearExportProgressTimer();
                      activeExportJobIdRef.current = jobId;
                      setExportProgressPercent(0);
                      setExportProgressClip({ current: 0, total: segments.length });
                      setIsExporting(true);
                      let exportCompleted = false;

                      try {
                        const res = await window.ipcRenderer.processBatch({
                          filePath,
                          outputDir,
                          segments,
                          lutPath: shouldApplyLutOnExport ? normalizedLutPath : undefined,
                          lutIntensity: shouldApplyLutOnExport ? normalizedLutIntensity : undefined,
                          jobId
                        });
                        if (res.success) {
                          exportCompleted = true;
                          alert(t('exportSuccess', { count: res.results.length }));
                        } else {
                          alert(t('exportFailed'));
                        }
                      } finally {
                        setIsExporting(false);
                        if (activeExportJobIdRef.current === jobId) {
                          if (exportCompleted) {
                            setExportProgressPercent(100);
                            clearExportProgressTimer();
                            exportProgressHideTimerRef.current = window.setTimeout(() => {
                              if (activeExportJobIdRef.current === jobId) {
                                activeExportJobIdRef.current = null;
                                setExportProgressPercent(null);
                                setExportProgressClip(null);
                              }
                              exportProgressHideTimerRef.current = null;
                            }, 400);
                          } else {
                            activeExportJobIdRef.current = null;
                            setExportProgressPercent(null);
                            setExportProgressClip(null);
                          }
                        }
                      }
                    } catch (error: unknown) {
                      const errorMessage = error instanceof Error ? error.message : String(error);
                      setIsExporting(false);
                      activeExportJobIdRef.current = null;
                      clearExportProgressTimer();
                      setExportProgressPercent(null);
                      setExportProgressClip(null);
                      console.error("Export error:", error);
                      alert(t('exportError') + errorMessage);
                    }
                  }}

                >
                  <Download className="w-4 h-4" />
                  {isExporting ? `${t('exporting')} ${Math.round(exportProgressPercent ?? 0)}%` : t('exportAll')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
