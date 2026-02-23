import { memo, useState, useRef, useEffect, useCallback, type ButtonHTMLAttributes } from 'react';
import { Upload, X, Zap, Download, Trash2, Scissors, Settings as SettingsIcon, List, Plus, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from './lib/utils';
import VideoPlayer, { VideoPlayerRef } from './components/VideoPlayer';
import Timeline from './components/Timeline';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_FIXED_DURATION = 3.9;
const DEFAULT_LUT_INTENSITY = 100;
const CURRENT_TIME_COMMIT_INTERVAL_MS = 80;
const TAG_LIBRARY_STORAGE_KEY = 'clipTagLibrary';
const MAX_TAG_LENGTH = 24;
const VIDEO_FILE_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.ts', '.m4s'];
const VIDEO_FILE_ACCEPT = ['video/*', ...VIDEO_FILE_EXTENSIONS].join(',');
const DEFAULT_SPLIT_TARGET_SIZE_MB = 800;
const MIN_SPLIT_TARGET_SIZE_MB = 1;
const MAX_SPLIT_TARGET_SIZE_MB = 1024 * 100;

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

const isSupportedVideoFile = (file: File) => {
  const fileName = file.name.toLowerCase();
  const hasVideoExtension = VIDEO_FILE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  return file.type.startsWith('video/') || hasVideoExtension;
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
    applyLutIntensity: 'Apply',
    queue: 'Queue',
    queueManager: 'Video Queue',
    queueEmpty: 'No videos in queue yet.',
    addVideos: 'Add Videos',
    currentVideo: 'Current',
    switchVideo: 'Switch',
    removeVideo: 'Remove',
    queueVideoCount: '{count} videos',
    tags: 'Tags',
    tagPlaceholder: 'Type tag and press Enter',
    addTag: 'Add Tag',
    noTagLibrary: 'Create tags to assign on clips.',
    noSegmentTags: 'No tags',
    editTags: 'Edit Tags',
    tagsNameHint: 'Export names prepend tags in this order.',
    exportAllVideosWithLut: 'Export All Videos With LUT',
    lutFullExportTitle: 'LUT Full Export',
    lutFullExportDesc: 'This will export all videos in the queue with current LUT and intensity, without clipping.',
    lutFullExportDesc2: 'Output keeps source resolution and bitrate targets.',
    confirmExport: 'Confirm Export',
    cancel: 'Cancel',
    exportingVideos: 'Exporting videos...',
    quickActions: 'Quick Actions',
    quickActionsDesc: 'Pick a feature button to open its parameter panel.',
    quickActionSelect: 'Choose a quick function below.',
    quickSplitBySize: 'Auto Split by Size',
    quickSplitButtonLabel: 'Auto split clips by target file size',
    quickSplitBySizeDesc: 'Split one source video into sequential parts by target size (MB) without changing resolution or bitrate.',
    quickSplitTargetSize: 'Target Size (MB)',
    quickSplitTargetHint: 'Each output clip will be close to this size. The final clip can be smaller.',
    quickSplitSourceFile: 'Source Video',
    quickSplitSourceSize: 'Source Size',
    quickSplitNoSource: 'No source selected',
    quickSplitChooseSource: 'Choose Video',
    quickSplitRun: 'Start Auto Split',
    quickSplitInvalidTarget: 'Please set a valid target size (MB).',
    quickSplitNeedSource: 'Please choose a source video first.',
    quickSplitSuccess: 'Size split complete. Exported {count} clips.',
    quickSplitFailed: 'Size split failed: ',
    quickSplitting: 'Splitting by size...',
    quickLutBatchButtonLabel: 'Batch apply LUT and export videos',
    quickLutBatchDesc: 'Batch export selected videos with one LUT preset. Encoder acceleration uses platform GPU first and falls back to CPU automatically.',
    quickLutBatchSelectVideos: 'Select Videos',
    quickLutBatchClearVideos: 'Clear',
    quickLutBatchVideosLabel: 'Videos',
    quickLutBatchNoVideos: 'No videos selected yet.',
    quickLutBatchVideoCount: '{count} videos',
    quickLutBatchTotalSize: 'Total Size',
    quickLutBatchLutFile: 'LUT File',
    quickLutBatchSelectLut: 'Select LUT',
    quickLutBatchClearLut: 'Clear LUT',
    quickLutBatchIntensity: 'LUT Intensity',
    quickLutBatchRun: 'Start Batch LUT Export',
    quickLutBatchNeedVideos: 'Please select at least one video first.',
    quickLutBatchNeedLut: 'Please select a LUT file first.',
    quickLutBatchSuccess: 'Batch LUT export complete. Exported {count} videos.',
    quickLutBatchFailed: 'Batch LUT export failed: ',
    quickLutBatchAccelHint: 'Windows: NVENC/QSV/AMF -> CPU fallback. macOS: VideoToolbox -> CPU fallback.',
    quickLutPreviewTitle: 'LUT Live Preview',
    quickLutPreviewVideoList: 'Video List',
    quickLutPreviewRealtime: 'Realtime Preview',
    quickLutPreviewRealtimeDesc: 'Enable GPU-accelerated LUT preview in the left panel.',
    quickLutPreviewOff: 'Realtime preview is currently disabled.',
    quickLutPreviewNoVideo: 'Select videos on the right to start preview.',
    quickLutPreviewUseCompatible: 'Use Compatible Preview',
    quickLutPreviewCompatibleMode: 'Compatible Preview',
    quickLutPreviewListTitle: 'Preview Video List'
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
    noClips: '暂无片段。使用 I 和 O 键快速剪辑。',
    clip: '片段',
    exportAll: '批量导出所有片段',
    dropVideo: '拖入视频文件开始处理',
    selectVideo: '选择本地视频',
    settings: '偏好设置',
    fixedDuration: '固定时长模式',
    fixedDurationDesc: '达到预设时长后自动结束当前片段',
    defaultDurationLabel: '默认裁剪时长 (秒)',
    disabledDesc: '固定时长模式关闭时不可用',
    done: '确定',
    language: '界面语言',
    uploadVideoAlert: '请上传视频文件。',
    pathError: '未能识别文件路径，请重新导入文件。',
    exporting: '正在导出...',
    exportSuccess: '成功导出 {count} 个视频片段！',
    exportFailed: '部分导出任务失败，请检查控制台输出。',
    exportError: '导出过程出错: ',
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
    lutFileMissing: '请先导入 LUT(.cube) 文件。',
    lutIntensity: 'LUT 强度',
    lutIntensityDesc: '0% 保持原片，100% 完全套用 LUT',
    applyLutIntensity: '应用',
    queue: '队列',
    queueManager: '视频队列',
    queueEmpty: '暂无视频',
    addVideos: '添加视频',
    currentVideo: '当前',
    switchVideo: '切换',
    removeVideo: '移除',
    queueVideoCount: '{count} 个视频',
    tags: '标签',
    tagPlaceholder: '输入标签并回车',
    addTag: '新建标签',
    noTagLibrary: '先新建标签，再给片段添加标签。',
    noSegmentTags: '未添加标签',
    editTags: '编辑标签',
    tagsNameHint: '导出文件名前缀会按标签顺序拼接。',
    exportAllVideosWithLut: '批量导出全部视频(LUT)',
    lutFullExportTitle: 'LUT 全量导出',
    lutFullExportDesc: '将对队列中的全部视频套用当前 LUT 与强度进行导出，不做切片。',
    lutFullExportDesc2: '导出保持原视频分辨率与目标码率设置。',
    confirmExport: '确认导出',
    cancel: '取消',
    exportingVideos: '正在导出视频...',
    quickActions: '快捷功能',
    quickActionsDesc: '点击功能按钮后展开二级参数面板。',
    quickActionSelect: '请选择下方快捷功能。',
    quickSplitBySize: '按体积自动分割',
    quickSplitButtonLabel: '按照视频体积大小进行自动片段裁剪',
    quickSplitBySizeDesc: '按目标大小(MB)将单个视频顺序分段，保持原分辨率与码率，不重新编码。',
    quickSplitTargetSize: '目标体积 (MB)',
    quickSplitTargetHint: '每段将尽量接近该大小，最后一段可能更小。',
    quickSplitSourceFile: '源视频',
    quickSplitSourceSize: '原视频体积',
    quickSplitNoSource: '未选择源视频',
    quickSplitChooseSource: '选择源视频',
    quickSplitRun: '开始自动分割',
    quickSplitInvalidTarget: '请输入有效的目标体积(MB)。',
    quickSplitNeedSource: '请先选择一个源视频。',
    quickSplitSuccess: '自动分割完成，已导出 {count} 段视频。',
    quickSplitFailed: '自动分割失败: ',
    quickSplitting: '正在按体积分割...',
    quickLutBatchButtonLabel: '批量套用 LUT 并导出视频',
    quickLutBatchDesc: '对所选视频批量套用同一个 LUT 进行导出。优先使用平台 GPU 加速，失败自动无感回退 CPU。',
    quickLutBatchSelectVideos: '选择视频',
    quickLutBatchClearVideos: '清空',
    quickLutBatchVideosLabel: '视频数量',
    quickLutBatchNoVideos: '还没有选择视频。',
    quickLutBatchVideoCount: '{count} 个视频',
    quickLutBatchTotalSize: '总大小',
    quickLutBatchLutFile: 'LUT 文件',
    quickLutBatchSelectLut: '选择 LUT',
    quickLutBatchClearLut: '清除 LUT',
    quickLutBatchIntensity: 'LUT 强度',
    quickLutBatchRun: '开始批量 LUT 导出',
    quickLutBatchNeedVideos: '请至少先选择一个视频。',
    quickLutBatchNeedLut: '请先选择 LUT 文件。',
    quickLutBatchSuccess: '批量 LUT 导出完成，已导出 {count} 个视频。',
    quickLutBatchFailed: '批量 LUT 导出失败: ',
    quickLutBatchAccelHint: 'Windows: NVENC/QSV/AMF，失败回退 CPU；macOS: VideoToolbox，失败回退 CPU。',
    quickLutPreviewTitle: 'LUT 实时预览',
    quickLutPreviewVideoList: '视频列表',
    quickLutPreviewRealtime: '实时预览',
    quickLutPreviewRealtimeDesc: '在左侧面板启用 GPU 加速 LUT 实时预览。',
    quickLutPreviewOff: '实时预览当前已关闭。',
    quickLutPreviewNoVideo: '请先在右侧选择视频后开始预览。',
    quickLutPreviewUseCompatible: '启用兼容预览',
    quickLutPreviewCompatibleMode: '兼容预览模式',
    quickLutPreviewListTitle: '预览视频列表'
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
  tags: string[];
}

interface QueueVideoItem {
  id: string;
  file: File;
  filePath: string;
  displayName: string;
  segments: Segment[];
  uniqueKey: string;
}

interface QuickLutBatchVideoItem {
  id: string;
  filePath: string;
  displayName: string;
  sizeBytes: number;
}

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

interface SegmentListProps {
  queueItems: QueueVideoItem[];
  activeVideoId: string | null;
  tagLibrary: string[];
  clipLabel: string;
  emptyLabel: string;
  noTagLibraryLabel: string;
  noSegmentTagsLabel: string;
  editTagsLabel: string;
  onDeleteSegment: (videoId: string, segmentId: string) => void;
  onToggleSegmentTag: (videoId: string, segmentId: string, tag: string) => void;
  onSwitchVideo: (videoId: string) => void;
  switchLabel: string;
  currentLabel: string;
}

const SegmentList = memo(function SegmentList({
  queueItems,
  activeVideoId,
  tagLibrary,
  clipLabel,
  emptyLabel,
  noTagLibraryLabel,
  noSegmentTagsLabel,
  editTagsLabel,
  onDeleteSegment,
  onToggleSegmentTag,
  onSwitchVideo,
  switchLabel,
  currentLabel
}: SegmentListProps) {
  const [activeTagEditorKey, setActiveTagEditorKey] = useState<string | null>(null);
  const hasAnySegment = queueItems.some((item) => item.segments.length > 0);
  if (!hasAnySegment) {
    return (
      <div className="text-center text-zinc-500 py-10 text-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <>
      {queueItems.map((videoItem) => {
        if (videoItem.segments.length === 0) {
          return null;
        }

        const isActiveVideo = videoItem.id === activeVideoId;
        return (
          <div key={videoItem.id} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className={cn('text-xs truncate', isActiveVideo ? 'text-cyan-300' : 'text-zinc-400')}>
                {videoItem.displayName}
              </p>
              {isActiveVideo ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {currentLabel}
                </span>
              ) : (
                <Button
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => onSwitchVideo(videoItem.id)}
                >
                  {switchLabel}
                </Button>
              )}
            </div>

            {videoItem.segments.map((seg, idx) => {
              const segmentTags = Array.isArray(seg.tags) ? seg.tags : [];
              const segmentEditorKey = `${videoItem.id}:${seg.id}`;
              const isTagEditorOpen = activeTagEditorKey === segmentEditorKey;

              return (
                <div key={seg.id} className="bg-zinc-950 p-3 rounded border border-white/5 group space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center text-xs font-mono">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-300 truncate">
                        {videoItem.displayName} · {clipLabel} {idx + 1}
                      </div>
                      <div className="text-xs text-zinc-500 font-mono">
                        {formatTime(seg.start)} - {formatTime(seg.end)}
                      </div>
                    </div>
                    <button
                      className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                      onClick={() => onDeleteSegment(videoItem.id, seg.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="pl-9 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5 min-h-5">
                        {segmentTags.length > 0 ? (
                          segmentTags.map((tagName) => (
                            <button
                              key={tagName}
                              type="button"
                              className="px-2 py-0.5 rounded-md border border-cyan-500/20 bg-cyan-500/10 text-[11px] text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                              onClick={() => onToggleSegmentTag(videoItem.id, seg.id, tagName)}
                            >
                              {tagName}
                            </button>
                          ))
                        ) : (
                          <span className="text-[11px] text-zinc-500">{noSegmentTagsLabel}</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        className="h-6 px-2 text-[11px] shrink-0"
                        onClick={() => setActiveTagEditorKey(isTagEditorOpen ? null : segmentEditorKey)}
                      >
                        <Tag className="w-3 h-3" />
                        {editTagsLabel}
                      </Button>
                    </div>

                    {isTagEditorOpen && (
                      <div className="rounded-md border border-white/10 bg-zinc-900/60 p-2">
                        {tagLibrary.length === 0 ? (
                          <p className="text-[11px] text-zinc-500">{noTagLibraryLabel}</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {tagLibrary.map((tagName) => {
                              const isSelected = segmentTags.includes(tagName);
                              return (
                                <button
                                  key={tagName}
                                  type="button"
                                  onClick={() => onToggleSegmentTag(videoItem.id, seg.id, tagName)}
                                  className={cn(
                                    "px-2 py-0.5 rounded-md border text-[11px] transition-colors",
                                    isSelected
                                      ? "border-blue-500/50 bg-blue-500/20 text-blue-200"
                                      : "border-white/10 bg-zinc-800/70 text-zinc-300 hover:border-blue-400/40 hover:text-zinc-100"
                                  )}
                                >
                                  {tagName}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
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
  const [quickSplitTargetSizeMb, setQuickSplitTargetSizeMb] = useState(DEFAULT_SPLIT_TARGET_SIZE_MB);
  const [quickSplitSourcePath, setQuickSplitSourcePath] = useState('');
  const [quickSplitSourceName, setQuickSplitSourceName] = useState('');
  const [quickSplitSourceSizeBytes, setQuickSplitSourceSizeBytes] = useState<number | null>(null);
  const [quickLutBatchVideos, setQuickLutBatchVideos] = useState<QuickLutBatchVideoItem[]>([]);
  const [quickLutBatchLutPath, setQuickLutBatchLutPath] = useState('');
  const [quickLutBatchLutIntensity, setQuickLutBatchLutIntensity] = useState(DEFAULT_LUT_INTENSITY);
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
  const [activeQuickAction, setActiveQuickAction] = useState<'split-by-size' | 'lut-full-batch' | null>(null);

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
  const t = useCallback((key: keyof typeof translations.en, params?: Record<string, string | number>) => {
    let text = translations[language][key] || translations.en[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v.toString());
      });
    }
    return text;
  }, [language]);

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
  const quickLutPreviewPlayerRef = useRef<VideoPlayerRef>(null);

  // Reset state when file changes
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [filePath, setFilePath] = useState<string>("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [previewProgressPercent, setPreviewProgressPercent] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'clips' | 'full' | 'split'>('clips');
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
  const quickLutPreviewProxyPathRef = useRef<string | null>(null);
  const quickLutPreviewJobIdRef = useRef<string | null>(null);
  const quickLutPreviewPreparingRef = useRef(false);
  const quickLutPreviewProgressHideTimerRef = useRef<number | null>(null);
  const quickLutPreviewAutoFallbackTriedRef = useRef(false);
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
  }, [normalizedLutIntensity]);

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

  const clearQuickLutPreviewProgressTimer = useCallback(() => {
    if (quickLutPreviewProgressHideTimerRef.current !== null) {
      window.clearTimeout(quickLutPreviewProgressHideTimerRef.current);
      quickLutPreviewProgressHideTimerRef.current = null;
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

      if (payload.jobId === activePreviewJobIdRef.current) {
        setPreviewProgressPercent(Math.min(100, Math.max(0, payload.percent)));
        return;
      }

      if (payload.jobId === quickLutPreviewJobIdRef.current) {
        setQuickLutPreviewProgressPercent(Math.min(100, Math.max(0, payload.percent)));
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

  const handleQuickLutPreviewSeek = useCallback((nextTime: number) => {
    const maxDuration = Number.isFinite(quickLutPreviewDuration) ? Math.max(0, quickLutPreviewDuration) : 0;
    const safeTime = Math.min(maxDuration, Math.max(0, Number.isFinite(nextTime) ? nextTime : 0));
    quickLutPreviewPlayerRef.current?.seekTo(safeTime);
    setQuickLutPreviewCurrentTime(safeTime);
  }, [quickLutPreviewDuration]);

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

  const handleQuickSplitSourceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    e.target.value = '';

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

      clearExportProgressTimer();
      const jobId = `split-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeExportJobIdRef.current = jobId;
      activeExportContextRef.current = null;
      setExportMode('split');
      setExportProgressPercent(0);
      setExportProgressClip({ current: 0, total: 0 });
      setIsExporting(true);
      let splitCompleted = false;

      try {
        const res = await window.ipcRenderer.processSizeSplit({
          filePath: quickSplitSourcePath,
          outputDir,
          targetSizeMb: normalizedTargetSizeMb,
          jobId
        });

        splitCompleted = true;
        const successCount = res.results.filter((result) => result.success).length;
        if (!res.success || successCount === 0 || successCount !== res.results.length) {
          if (res.error) {
            alert(t('quickSplitFailed') + res.error);
          } else {
            alert(t('exportFailed'));
          }
        } else {
          alert(t('quickSplitSuccess', { count: successCount }));
        }
      } finally {
        setIsExporting(false);
        if (activeExportJobIdRef.current === jobId) {
          activeExportJobIdRef.current = null;
          activeExportContextRef.current = null;
          if (splitCompleted) {
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
      console.error('Size split export error:', error);
      alert(t('quickSplitFailed') + errorMessage);
    }
  }, [clearExportProgressTimer, quickSplitSourcePath, quickSplitTargetSizeMb, t]);

  const handleQuickLutBatchVideosChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';

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

      clearExportProgressTimer();
      const jobId = `quick-lut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeExportJobIdRef.current = jobId;
      activeExportContextRef.current = null;
      setExportMode('full');
      setExportProgressPercent(0);
      setExportProgressClip({ current: 0, total: quickLutBatchVideos.length });
      setIsExporting(true);
      let exportCompleted = false;

      try {
        const res = await window.ipcRenderer.processLutFullBatch({
          videos: quickLutBatchVideos.map((video) => ({
            id: video.id,
            filePath: video.filePath
          })),
          outputDir,
          lutPath: normalizedLutPath,
          lutIntensity: clampLutIntensity(quickLutBatchLutIntensity),
          jobId
        });

        const successCount = res.results.filter((result) => result.success).length;
        exportCompleted = true;
        if (!res.success || successCount === 0 || successCount !== res.results.length) {
          if ('error' in res && typeof res.error === 'string' && res.error.length > 0) {
            alert(t('quickLutBatchFailed') + res.error);
          } else {
            alert(t('exportFailed'));
          }
        } else {
          alert(t('quickLutBatchSuccess', { count: successCount }));
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
      console.error('Quick LUT batch export error:', error);
      alert(t('quickLutBatchFailed') + errorMessage);
    }
  }, [clearExportProgressTimer, quickLutBatchLutIntensity, quickLutBatchLutPath, quickLutBatchVideos, t]);

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

  useEffect(() => {
    let cancelled = false;
    const quickLutPanelOpen = activeQuickAction === 'lut-full-batch';
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
    if (!quickLutPanelOpen || !quickLutRealtimePreviewEnabled) {
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
    activeQuickAction,
    cleanupPreviewProxy,
    clearQuickLutPreviewProgressTimer,
    quickLutBatchVideos,
    quickLutPreviewVideoId,
    quickLutRealtimePreviewEnabled
  ]);

  useEffect(() => {
    if (activeQuickAction !== 'lut-full-batch') {
      setShowQuickLutPreviewVideoList(false);
    }
  }, [activeQuickAction]);

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
  const quickLutPreviewActiveVideo = quickLutPreviewVideoId
    ? quickLutBatchVideos.find((video) => video.id === quickLutPreviewVideoId) ?? null
    : null;
  const quickLutPreviewExternalLoadingText = quickLutPreviewPreparing
    ? `${t('preparingPreview')} ${Math.round(quickLutPreviewProgressPercent ?? 0)}%`
    : null;
  const isQuickSplitPanelOpen = activeQuickAction === 'split-by-size';
  const isQuickLutBatchPanelOpen = activeQuickAction === 'lut-full-batch';
  const exportProgressLabel = exportMode === 'full'
    ? t('exportingVideos')
    : exportMode === 'split'
      ? t('quickSplitting')
      : t('exportingClips');

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
                      中文
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

      {showQueue && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowQueue(false)} />
          <div className="relative w-full max-w-xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <List className="w-5 h-5 text-blue-500" />
                {t('queueManager')}
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id="queue-file-upload"
                  className="hidden"
                  multiple
                  accept={VIDEO_FILE_ACCEPT}
                  onChange={handleChange}
                />
                <Button
                  variant="secondary"
                  className="h-8 px-3 text-xs"
                  onClick={() => document.getElementById('queue-file-upload')?.click()}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('addVideos')}
                </Button>
                <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowQueue(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto space-y-2 custom-scrollbar">
              <p className="text-xs text-zinc-500 px-1">{queueVideoCountLabel}</p>
              {videoQueue.length === 0 && (
                <div className="text-center text-zinc-500 py-10 text-sm">
                  {t('queueEmpty')}
                </div>
              )}
              {videoQueue.map((item) => {
                const isActive = item.id === activeVideoId;
                const isDragging = item.id === draggingQueueVideoId;
                const isDragOver = item.id === dragOverQueueVideoId;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(event) => handleQueueDragStart(event, item.id)}
                    onDragOver={(event) => handleQueueDragOver(event, item.id)}
                    onDrop={(event) => handleQueueDrop(event, item.id)}
                    onDragEnd={handleQueueDragEnd}
                    className={cn(
                      'rounded-lg border p-3 flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing transition-colors',
                      isActive ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/10 bg-zinc-950/40',
                      isDragOver && !isDragging && 'border-blue-400/60 bg-blue-500/10',
                      isDragging && 'opacity-60'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{item.displayName}</p>
                      <p className="text-xs text-zinc-500 mt-1">{item.segments.length} {t('clips')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          {t('currentVideo')}
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => switchToQueueVideo(item.id)}
                        >
                          {t('switchVideo')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-[11px] text-zinc-500 hover:text-red-400"
                        onClick={() => removeQueueVideo(item.id)}
                      >
                        {t('removeVideo')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showQuickLutPreviewVideoList && isQuickLutBatchPanelOpen && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowQuickLutPreviewVideoList(false)} />
          <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <List className="w-5 h-5 text-emerald-400" />
                {t('quickLutPreviewListTitle')}
              </h3>
              <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowQuickLutPreviewVideoList(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2 custom-scrollbar">
              {quickLutBatchVideos.length === 0 ? (
                <div className="text-center text-zinc-500 py-8 text-sm">
                  {t('quickLutBatchNoVideos')}
                </div>
              ) : (
                quickLutBatchVideos.map((videoItem) => {
                  const isActive = videoItem.id === quickLutPreviewVideoId;
                  return (
                    <div
                      key={videoItem.id}
                      className={cn(
                        'rounded-lg border p-3 flex items-center justify-between gap-3 transition-colors',
                        isActive ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-zinc-950/40'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-200 truncate" title={videoItem.displayName}>{videoItem.displayName}</p>
                        <p className="text-[11px] text-zinc-500 mt-1 font-mono">{formatFileSize(videoItem.sizeBytes)}</p>
                      </div>
                      {isActive ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {t('currentVideo')}
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => switchQuickLutPreviewVideo(videoItem.id)}
                        >
                          {t('switchVideo')}
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showLutFullExportConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLutFullExportConfirm(false)} />
          <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('lutFullExportTitle')}</h3>
              <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowLutFullExportConfirm(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-zinc-200">{t('lutFullExportDesc')}</p>
              <p className="text-xs text-zinc-500">{t('lutFullExportDesc2')}</p>
            </div>
            <div className="p-4 border-t border-white/5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                className="h-9 px-4"
                onClick={() => setShowLutFullExportConfirm(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                className="h-9 px-4"
                onClick={() => {
                  setShowLutFullExportConfirm(false);
                  void exportAllQueuedVideosWithLut();
                }}
              >
                {t('confirmExport')}
              </Button>
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
              <span className="text-zinc-200">{exportProgressLabel}</span>
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
        {!activeQueueItem ? (
          <div className="flex-1 m-6 rounded-3xl border border-white/10 bg-zinc-900/20 p-4 sm:p-5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 min-h-0">
            <div
              className={cn(
                "relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-all duration-300 gap-6 bg-zinc-900/30 min-h-[360px] overflow-hidden",
                dragActive ? "border-blue-500/90 bg-blue-500/10" : "border-zinc-700 hover:border-zinc-600",
                isQuickLutBatchPanelOpen && "border-emerald-500/40"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div
                className={cn(
                  "flex flex-col items-center text-center space-y-4 transition-opacity duration-200",
                  isQuickLutBatchPanelOpen && "opacity-15 pointer-events-none select-none"
                )}
              >
                <Upload className="w-12 h-12 mx-auto text-zinc-600" />
                <h2 className="text-2xl font-semibold text-white">{t('dropVideo')}</h2>
                <input type="file" className="hidden" id="file-upload" multiple accept={VIDEO_FILE_ACCEPT} onChange={handleChange} />
                <Button onClick={() => document.getElementById('file-upload')?.click()}>{t('selectVideo')}</Button>
              </div>

              {isQuickLutBatchPanelOpen && (
                <div className="absolute inset-0 z-10 rounded-2xl border border-emerald-500/30 bg-zinc-950/92 p-3 sm:p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">{t('quickLutPreviewTitle')}</p>
                      <p
                        className="text-[11px] text-zinc-500 truncate mt-0.5"
                        title={quickLutPreviewActiveVideo ? quickLutPreviewActiveVideo.displayName : ''}
                      >
                        {quickLutPreviewActiveVideo ? quickLutPreviewActiveVideo.displayName : t('quickLutPreviewNoVideo')}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="h-8 px-3 text-xs shrink-0"
                      onClick={() => setShowQuickLutPreviewVideoList(true)}
                      disabled={quickLutBatchVideos.length === 0}
                    >
                      <List className="w-3.5 h-3.5" />
                      {t('quickLutPreviewVideoList')}
                    </Button>
                  </div>

                  <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-black/70 overflow-hidden relative">
                    {quickLutRealtimePreviewEnabled ? (
                      quickLutPreviewSrc ? (
                        <VideoPlayer
                          ref={quickLutPreviewPlayerRef}
                          src={quickLutPreviewSrc}
                          isPlaying={quickLutPreviewPlaying}
                          onPlayPause={() => setQuickLutPreviewPlaying((prev) => !prev)}
                          onTimeUpdate={(time) => setQuickLutPreviewCurrentTime(time)}
                          onDurationChange={(nextDuration) => setQuickLutPreviewDuration(nextDuration)}
                          onEnded={() => setQuickLutPreviewPlaying(false)}
                          onDecodeIssue={handleQuickLutPreviewDecodeIssue}
                          externalLoadingText={quickLutPreviewExternalLoadingText}
                          lutEnabled={quickLutRealtimePreviewEnabled && Boolean(quickLutBatchLutPath)}
                          lutPath={quickLutRealtimePreviewEnabled && quickLutBatchLutPath ? quickLutBatchLutPath : null}
                          lutIntensity={clampLutIntensity(quickLutBatchLutIntensity)}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-center px-4">
                          <p className="text-sm text-zinc-500">{t('quickLutPreviewNoVideo')}</p>
                        </div>
                      )
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-center px-4">
                        <p className="text-sm text-zinc-500">{t('quickLutPreviewOff')}</p>
                      </div>
                    )}
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={Math.max(quickLutPreviewDuration, 0)}
                    step={0.01}
                    value={Math.min(quickLutPreviewCurrentTime, Math.max(quickLutPreviewDuration, 0))}
                    onChange={(event) => handleQuickLutPreviewSeek(Number(event.target.value))}
                    disabled={!quickLutRealtimePreviewEnabled || !quickLutPreviewSrc || quickLutPreviewDuration <= 0}
                    className="w-full accent-emerald-400 disabled:opacity-40"
                    aria-label="Quick LUT preview progress"
                  />

                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2 text-zinc-400 font-mono">
                      <span>{formatTime(quickLutPreviewCurrentTime)}</span>
                      <span>/</span>
                      <span>{formatTime(quickLutPreviewDuration)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!quickLutPreviewUsingCompatible && quickLutPreviewCompatibleSuggested && quickLutRealtimePreviewEnabled && (
                        <Button
                          variant="ghost"
                          className="h-6 px-2 text-[11px] text-amber-400 hover:text-amber-300"
                          onClick={switchToQuickLutCompatiblePreview}
                          disabled={quickLutPreviewPreparing}
                        >
                          {t('quickLutPreviewUseCompatible')}
                        </Button>
                      )}
                      {quickLutPreviewUsingCompatible && (
                        <span className="text-amber-400">{t('quickLutPreviewCompatibleMode')}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-4 sm:p-5 flex flex-col min-h-[360px] max-h-full overflow-hidden">
              <div className="pb-3 border-b border-white/10 space-y-1.5">
                <p className="text-lg font-semibold text-zinc-100">{t('quickActions')}</p>
                <p className="text-xs text-zinc-400 leading-relaxed">{t('quickActionsDesc')}</p>
              </div>

              <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                <div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveQuickAction((prev) => prev === 'split-by-size' ? null : 'split-by-size');
                  }}
                  className={cn(
                    "group w-full rounded-xl border px-3 py-3 flex items-center gap-3 text-left transition-all",
                    isQuickSplitPanelOpen
                      ? "border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.16)]"
                      : "border-white/10 bg-zinc-950/45 hover:border-cyan-500/40 hover:bg-cyan-500/5"
                  )}
                >
                  <span
                    className={cn(
                      "h-6 min-w-6 px-1 rounded-md flex items-center justify-center text-xs font-semibold font-mono",
                      isQuickSplitPanelOpen ? "bg-cyan-300 text-zinc-900" : "bg-zinc-800 text-zinc-300"
                    )}
                  >
                    1
                  </span>
                  <span className="flex-1 text-sm font-medium text-zinc-100">
                    {t('quickSplitButtonLabel')}
                  </span>
                  {isQuickSplitPanelOpen ? (
                    <ChevronDown className="w-4 h-4 text-cyan-300" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-cyan-300 transition-colors" />
                  )}
                </button>
              </div>

              <div
                className={cn(
                  "grid transition-all duration-300 ease-out",
                  isQuickSplitPanelOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"
                )}
              >
                <div className="overflow-hidden">
                  <div className="rounded-xl border border-cyan-500/20 bg-zinc-950/65 p-4 space-y-4">
                    <p className="text-xs text-zinc-400 leading-relaxed">{t('quickSplitBySizeDesc')}</p>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-200">{t('quickSplitTargetSize')}</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={MIN_SPLIT_TARGET_SIZE_MB}
                          max={MAX_SPLIT_TARGET_SIZE_MB}
                          step={1}
                          value={quickSplitTargetSizeMb}
                          onChange={(event) => {
                            const nextValue = Number(event.target.value);
                            if (!Number.isFinite(nextValue)) {
                              setQuickSplitTargetSizeMb(MIN_SPLIT_TARGET_SIZE_MB);
                              return;
                            }
                            setQuickSplitTargetSizeMb(nextValue);
                          }}
                          onBlur={(event) => {
                            const nextValue = Number(event.target.value);
                            if (!Number.isFinite(nextValue) || nextValue < MIN_SPLIT_TARGET_SIZE_MB) {
                              setQuickSplitTargetSizeMb(DEFAULT_SPLIT_TARGET_SIZE_MB);
                              return;
                            }
                            setQuickSplitTargetSizeMb(Math.min(MAX_SPLIT_TARGET_SIZE_MB, Math.round(nextValue)));
                          }}
                          className="w-full h-9 rounded-lg bg-zinc-800 border border-white/10 pl-3 pr-10 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">MB</span>
                      </div>
                      <p className="text-[11px] text-zinc-500">{t('quickSplitTargetHint')}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-zinc-200">{t('quickSplitSourceFile')}</label>
                        <span
                          className={cn(
                            "max-w-[60%] truncate text-[11px] font-mono text-right",
                            quickSplitSourcePath ? "text-zinc-300" : "text-zinc-500"
                          )}
                          title={quickSplitSourceDisplayName}
                        >
                          {quickSplitSourceDisplayName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1.5">
                        <span className="text-[11px] text-zinc-400">{t('quickSplitSourceSize')}</span>
                        <span className="text-[11px] font-mono text-zinc-200">{quickSplitSourceSizeLabel}</span>
                      </div>

                      <input
                        type="file"
                        className="hidden"
                        id="quick-split-file-upload"
                        accept={VIDEO_FILE_ACCEPT}
                        onChange={handleQuickSplitSourceChange}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="h-9 px-3 text-xs shrink-0"
                          onClick={() => document.getElementById('quick-split-file-upload')?.click()}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {t('quickSplitChooseSource')}
                        </Button>
                        <Button
                          className="h-9 flex-1 text-sm"
                          disabled={isExporting || !quickSplitSourcePath}
                          onClick={() => {
                            void runQuickSplitBySize();
                          }}
                        >
                          <Scissors className="w-4 h-4" />
                          {isExporting && exportMode === 'split'
                            ? `${t('quickSplitting')} ${Math.round(exportProgressPercent ?? 0)}%`
                            : t('quickSplitRun')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveQuickAction((prev) => prev === 'lut-full-batch' ? null : 'lut-full-batch');
                  }}
                  className={cn(
                    "group w-full rounded-xl border px-3 py-3 flex items-center gap-3 text-left transition-all",
                    isQuickLutBatchPanelOpen
                      ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.16)]"
                      : "border-white/10 bg-zinc-950/45 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  )}
                >
                  <span
                    className={cn(
                      "h-6 min-w-6 px-1 rounded-md flex items-center justify-center text-xs font-semibold font-mono",
                      isQuickLutBatchPanelOpen ? "bg-emerald-300 text-zinc-900" : "bg-zinc-800 text-zinc-300"
                    )}
                  >
                    2
                  </span>
                  <span className="flex-1 text-sm font-medium text-zinc-100">
                    {t('quickLutBatchButtonLabel')}
                  </span>
                  {isQuickLutBatchPanelOpen ? (
                    <ChevronDown className="w-4 h-4 text-emerald-300" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-300 transition-colors" />
                  )}
                </button>
              </div>

              <div
                className={cn(
                  "grid transition-all duration-300 ease-out",
                  isQuickLutBatchPanelOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"
                )}
              >
                <div className="overflow-hidden">
                  <div className="rounded-xl border border-emerald-500/20 bg-zinc-950/65 p-4 space-y-4">
                    <p className="text-xs text-zinc-400 leading-relaxed">{t('quickLutBatchDesc')}</p>

                    <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2.5 flex items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-100">{t('quickLutPreviewRealtime')}</p>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">{t('quickLutPreviewRealtimeDesc')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQuickLutRealtimePreviewEnabled((prev) => !prev)}
                        className={cn(
                          "w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0",
                          quickLutRealtimePreviewEnabled ? "bg-emerald-500" : "bg-zinc-700"
                        )}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded-full bg-white transition-transform duration-200 mx-1",
                            quickLutRealtimePreviewEnabled ? "translate-x-5" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400">{t('quickLutBatchVideosLabel')}</span>
                        <span className="text-[11px] font-mono text-zinc-200">{quickLutBatchVideoCountLabel}</span>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400">{t('quickLutBatchTotalSize')}</span>
                        <span className="text-[11px] font-mono text-zinc-200">{quickLutBatchTotalSizeLabel}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="file"
                        className="hidden"
                        id="quick-lut-batch-videos-upload"
                        multiple
                        accept={VIDEO_FILE_ACCEPT}
                        onChange={handleQuickLutBatchVideosChange}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="h-9 px-3 text-xs"
                          onClick={() => document.getElementById('quick-lut-batch-videos-upload')?.click()}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {t('quickLutBatchSelectVideos')}
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-9 px-3 text-xs text-zinc-500 hover:text-red-400"
                          onClick={clearQuickLutBatchVideos}
                          disabled={quickLutBatchVideos.length === 0}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('quickLutBatchClearVideos')}
                        </Button>
                      </div>

                      {quickLutBatchVideos.length === 0 ? (
                        <p className="text-[11px] text-zinc-500">{t('quickLutBatchNoVideos')}</p>
                      ) : (
                        <div className="max-h-24 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                          {quickLutBatchVideos.map((videoItem) => (
                            <div
                              key={videoItem.id}
                              className="rounded-md border border-white/10 bg-zinc-900/70 px-2 py-1.5 flex items-center justify-between gap-2"
                            >
                              <span className="text-[11px] text-zinc-200 truncate" title={videoItem.displayName}>
                                {videoItem.displayName}
                              </span>
                              <button
                                type="button"
                                className="text-zinc-500 hover:text-red-400 transition-colors"
                                onClick={() => removeQuickLutBatchVideo(videoItem.id)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-zinc-200">{t('quickLutBatchLutFile')}</label>
                        <span className={cn(
                          "max-w-[60%] truncate text-[11px] font-mono text-right",
                          quickLutBatchLutPath ? "text-zinc-300" : "text-zinc-500"
                        )} title={quickLutBatchLutFileName}>
                          {quickLutBatchLutFileName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="h-8 px-3 text-xs"
                          onClick={() => {
                            void handleQuickLutBatchImportLut();
                          }}
                        >
                          {t('quickLutBatchSelectLut')}
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs text-zinc-500 hover:text-red-400"
                          onClick={() => setQuickLutBatchLutPath('')}
                          disabled={!quickLutBatchLutPath}
                        >
                          {t('quickLutBatchClearLut')}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-200">{t('quickLutBatchIntensity')}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={quickLutBatchLutIntensity}
                          onChange={(event) => setQuickLutBatchLutIntensity(clampLutIntensity(Number(event.target.value)))}
                          className="flex-1 accent-emerald-400"
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={quickLutBatchLutIntensity}
                          onChange={(event) => setQuickLutBatchLutIntensity(clampLutIntensity(Number(event.target.value)))}
                          className="w-16 bg-zinc-800 border border-white/10 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono"
                        />
                        <span className="text-[11px] text-zinc-400">%</span>
                      </div>
                      <p className="text-[11px] text-zinc-500">{t('quickLutBatchAccelHint')}</p>
                    </div>

                    <Button
                      className="w-full h-9 text-sm"
                      disabled={isExporting || quickLutBatchVideos.length === 0 || !quickLutBatchLutPath}
                      onClick={() => {
                        void runQuickLutBatchExport();
                      }}
                    >
                      <Download className="w-4 h-4" />
                      {isExporting && exportMode === 'full'
                        ? `${t('exportingVideos')} ${Math.round(exportProgressPercent ?? 0)}%`
                        : t('quickLutBatchRun')}
                    </Button>
                  </div>
                </div>
              </div>

              {!isQuickSplitPanelOpen && !isQuickLutBatchPanelOpen && (
                <p className="mt-3 text-[11px] text-zinc-500">{t('quickActionSelect')}</p>
              )}

              </div>
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
                  {t('clips')} ({totalQueueClipCount})
                </h3>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowQueue(true)}>
                    <List className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowSettings(true)}>
                    <SettingsIcon className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 no-drag"
                    onClick={() => {
                      if (activeVideoId) {
                        removeQueueVideo(activeVideoId);
                      }
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

              </div>

              <div className="px-3 py-3 border-b border-white/5 bg-zinc-950/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                    <Tag className="w-3.5 h-3.5 text-cyan-300" />
                    <span>{tagsLabel}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">{tagLibrary.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTagDraft}
                    maxLength={MAX_TAG_LENGTH}
                    placeholder={t('tagPlaceholder')}
                    onChange={(event) => setNewTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitTagDraft();
                      }
                    }}
                    className="flex-1 h-8 bg-zinc-800 border border-white/10 rounded-md px-2.5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <Button
                    variant="secondary"
                    className="h-8 px-2.5 text-xs"
                    onClick={commitTagDraft}
                  >
                    <Plus className="w-3 h-3" />
                    {t('addTag')}
                  </Button>
                </div>

                {tagLibrary.length === 0 ? (
                  <p className="text-[11px] text-zinc-500">{noTagLibraryLabel}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tagLibrary.map((tagName) => (
                      <div
                        key={tagName}
                        className="inline-flex items-center rounded-md border border-white/10 bg-zinc-800/70 text-[11px] text-zinc-200 pl-2 pr-1 py-0.5"
                      >
                        <span>{tagName}</span>
                        <button
                          type="button"
                          className="ml-1 p-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                          onClick={() => removeTagFromLibrary(tagName)}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-zinc-500">{tagsNameHintLabel}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                <SegmentList
                  queueItems={videoQueue}
                  activeVideoId={activeVideoId}
                  tagLibrary={tagLibrary}
                  clipLabel={clipLabel}
                  emptyLabel={noClipsLabel}
                  noTagLibraryLabel={noTagLibraryLabel}
                  noSegmentTagsLabel={noSegmentTagsLabel}
                  editTagsLabel={editTagsLabel}
                  onSwitchVideo={switchToQueueVideo}
                  switchLabel={t('switchVideo')}
                  currentLabel={t('currentVideo')}
                  onDeleteSegment={deleteSegment}
                  onToggleSegmentTag={toggleSegmentTag}
                />
              </div>

              <div className="p-4 border-t border-white/5 bg-zinc-900">
                <Button
                  className="w-full"
                  disabled={totalQueueClipCount === 0 || isExporting}
                  onClick={() => {
                    void exportAllQueuedClips();
                  }}

                >
                  <Download className="w-4 h-4" />
                  {isExporting ? `${t('exporting')} ${Math.round(exportProgressPercent ?? 0)}%` : t('exportAll')}
                </Button>
                {shouldApplyLutOnExport && (
                  <Button
                    variant="secondary"
                    className="w-full mt-2"
                    disabled={videoQueue.length === 0 || isExporting}
                    onClick={() => setShowLutFullExportConfirm(true)}
                  >
                    <Download className="w-4 h-4" />
                    {t('exportAllVideosWithLut')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
