import { useState, useRef, useEffect, useCallback, type ButtonHTMLAttributes } from 'react';
import { Upload, X, Zap, Download, Trash2, Scissors, Settings as SettingsIcon } from 'lucide-react';
import { cn } from './lib/utils';
import VideoPlayer, { VideoPlayerRef } from './components/VideoPlayer';
import Timeline from './components/Timeline';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_FIXED_DURATION = 3.9;

const toFileUrl = (absolutePath: string) => {
  const normalized = absolutePath.replace(/\\/g, '/');
  return encodeURI(normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`);
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
    preparingPreview: 'Preparing compatible preview...',
    compatiblePreviewMode: 'Compatible Preview Mode'
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
    preparingPreview: '正在生成兼容预览...',
    compatiblePreviewMode: '兼容预览模式'
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
  const [usingCompatiblePreview, setUsingCompatiblePreview] = useState(false);
  const previewProxyPathRef = useRef<string | null>(null);

  const cleanupPreviewProxy = useCallback(async (proxyPath: string | null) => {
    if (!proxyPath) return;

    try {
      await window.ipcRenderer.cleanupPreview({ proxyPath });
    } catch (error) {
      console.warn('Failed to cleanup preview proxy:', error);
    }
  }, []);

  // Cleanup preview proxy when component unmounts
  useEffect(() => {
    return () => {
      const stalePreviewPath = previewProxyPathRef.current;
      previewProxyPathRef.current = null;
      void cleanupPreviewProxy(stalePreviewPath);
    };
  }, [cleanupPreviewProxy]);

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
    setSegments([]);
    setPendingStart(null);
    setUsingCompatiblePreview(false);
    setIsPreparingPreview(false);

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
      setIsPreparingPreview(true);

      window.ipcRenderer.preparePreview({ filePath: electronPath })
        .then((result) => {
          if (cancelled) return;
          setIsPreparingPreview(false);

          if (!result.success) {
            console.warn('Preview preparation failed:', result.error);
            return;
          }

          if (result.useProxy && result.url && result.path) {
            previewProxyPathRef.current = result.path;
            setVideoSrc(result.url);
            setUsingCompatiblePreview(true);
          }
        })
        .catch((error) => {
          if (cancelled) return;
          setIsPreparingPreview(false);
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
  }, [videoFile, cleanupPreviewProxy]);


  const handleDurationChange = (d: number) => {
    if (!d || !isFinite(d)) return;
    setDuration(d);
  };

  const closeSegment = useCallback(() => {
    if (pendingStart === null) return;

    let end = currentTime;

    // Validate order
    if (end <= pendingStart) {
      return;
    }

    // Clamp max duration if fixed duration is enabled
    if (useFixedDuration && (end - pendingStart > defaultDuration)) {
      end = pendingStart + defaultDuration;
    }

    const newSegment: Segment = {
      id: uuidv4(),
      start: pendingStart,
      end: end
    };

    setSegments(prev => [...prev, newSegment].sort((a, b) => a.start - b.start));
    setPendingStart(null);
  }, [pendingStart, currentTime, useFixedDuration, defaultDuration]);

  // Keyboard Shortcuts (I/O)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoFile) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.toLowerCase() === 'i') {
        setPendingStart(currentTime);
      } else if (e.key.toLowerCase() === 'o') {
        closeSegment();
      } else if (e.code === 'Space') {
        e.preventDefault(); // Prevent scroll
        setIsPlaying(p => !p);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoFile, currentTime, closeSegment]);


  // Time Update Logic (Auto-close)
  const handleTimeUpdate = (t: number) => {
    setCurrentTime(t);

    // Auto-close logic
    if (useFixedDuration && pendingStart !== null && (t - pendingStart >= defaultDuration)) {
      // Force close at precise limit
      const autoEnd = pendingStart + defaultDuration;
      const newSegment: Segment = {
        id: uuidv4(),
        start: pendingStart,
        end: autoEnd
      };
      setSegments(prev => [...prev, newSegment].sort((a, b) => a.start - b.start));
      setPendingStart(null);
    }
  };

  const deleteSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

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
                  onPlayPause={() => setIsPlaying(!isPlaying)}
                  onTimeUpdate={handleTimeUpdate}
                  onDurationChange={handleDurationChange}
                  onEnded={() => setIsPlaying(false)}
                  externalLoadingText={isPreparingPreview ? t('preparingPreview') : null}
                />

              </div>

              {/* Timeline Controls */}
              <div className="h-48 bg-zinc-900 border border-white/5 rounded-lg p-4 flex flex-col gap-2 flex-shrink-0">

                <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
                  <span>{t('runningTime')}: {formatTime(currentTime)}</span>
                  <div className="flex items-center gap-3">
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
                    onSeek={(t) => {
                      videoPlayerRef.current?.seekTo(t);
                      setCurrentTime(t); // Optimistic update
                    }}
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
                      onClick={() => setPendingStart(currentTime)}
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
                {segments.length === 0 ? (
                  <div className="text-center text-zinc-500 py-10 text-sm">
                    {t('noClips')}
                  </div>
                ) : (
                  segments.map((seg, idx) => (
                    <div key={seg.id} className="bg-zinc-950 p-3 rounded border border-white/5 flex items-center gap-3 group">
                      <div className="w-6 h-6 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center text-xs font-mono">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-300">
                          {t('clip')} {idx + 1}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">
                          {formatTime(seg.start)} - {formatTime(seg.end)}
                        </div>
                      </div>
                      <button
                        className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                        onClick={() => deleteSegment(seg.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-white/5 bg-zinc-900">
                <Button
                  className="w-full"
                  disabled={segments.length === 0}
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

                      const btn = document.activeElement as HTMLButtonElement;
                      if (btn) btn.disabled = true;
                      const originalText = btn.innerText;
                      btn.innerText = t('exporting');

                      try {
                        const res = await window.ipcRenderer.processBatch({
                          filePath,
                          outputDir,
                          segments
                        });
                        if (res.success) {
                          alert(t('exportSuccess', { count: res.results.length }));
                        } else {
                          alert(t('exportFailed'));
                        }
                      } finally {
                        if (btn) {
                          btn.disabled = false;
                          btn.innerText = originalText;
                        }
                      }
                    } catch (error: unknown) {
                      const errorMessage = error instanceof Error ? error.message : String(error);
                      console.error("Export error:", error);
                      alert(t('exportError') + errorMessage);
                    }
                  }}

                >
                  <Download className="w-4 h-4" />
                  {t('exportAll')}
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
