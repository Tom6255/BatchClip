import type { ChangeEvent, RefObject } from 'react';
import { ChevronDown, ChevronRight, Download, List, Trash2, Upload, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import VideoPlayer, { type VideoPlayerRef } from '../VideoPlayer';
import Button from '../ui/Button';
import type { QuickLutBatchVideoItem } from '../../features/quick-actions/types';

type QuickLutBatchTextKey =
  | 'quickLutBatchButtonLabel'
  | 'quickLutBatchDesc'
  | 'quickLutPreviewRealtime'
  | 'quickLutPreviewRealtimeDesc'
  | 'quickLutBatchVideosLabel'
  | 'quickLutBatchTotalSize'
  | 'quickLutBatchSelectVideos'
  | 'quickLutBatchClearVideos'
  | 'quickLutBatchNoVideos'
  | 'quickLutBatchLutFile'
  | 'quickLutBatchSelectLut'
  | 'quickLutBatchClearLut'
  | 'quickLutBatchIntensity'
  | 'applyLutIntensity'
  | 'quickLutBatchAccelHint'
  | 'quickLutBatchRun'
  | 'exportingVideos'
  | 'quickLutPreviewTitle'
  | 'quickLutPreviewNoVideo'
  | 'quickLutPreviewVideoList'
  | 'quickLutPreviewOff'
  | 'quickLutPreviewUseCompatible'
  | 'quickLutPreviewCompatibleMode'
  | 'quickLutPreviewListTitle'
  | 'currentVideo'
  | 'switchVideo';

interface QuickLutBatchFeatureProps {
  isOpen: boolean;
  onToggle: () => void;
  t: (key: QuickLutBatchTextKey, params?: Record<string, string | number>) => string;
  quickLutRealtimePreviewEnabled: boolean;
  onToggleRealtimePreview: () => void;
  quickLutBatchVideoCountLabel: string;
  quickLutBatchTotalSizeLabel: string;
  quickLutBatchVideos: QuickLutBatchVideoItem[];
  videoFileAccept: string;
  onVideosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearVideos: () => void;
  onRemoveVideo: (videoId: string) => void;
  quickLutBatchLutPath: string;
  quickLutBatchLutFileName: string;
  onSelectLut: () => void;
  onClearLut: () => void;
  quickLutBatchLutIntensity: number;
  quickLutBatchHasPendingLutIntensity: boolean;
  onChangeLutIntensity: (value: number) => void;
  onApplyLutIntensity: () => void;
  onRun: () => void;
  isExporting: boolean;
  exportMode: 'clips' | 'full' | 'split' | 'convert' | 'livephoto';
  exportProgressPercent: number | null;
}

interface QuickLutPreviewOverlayProps {
  isOpen: boolean;
  t: (key: QuickLutBatchTextKey, params?: Record<string, string | number>) => string;
  activeVideoDisplayName: string;
  hasVideos: boolean;
  onOpenVideoList: () => void;
  previewPlayerRef: RefObject<VideoPlayerRef>;
  quickLutRealtimePreviewEnabled: boolean;
  quickLutPreviewSrc: string;
  quickLutPreviewPlaying: boolean;
  onTogglePlaying: () => void;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
  onDecodeIssue: (issue: { type: 'decode-error' | 'src-not-supported'; code?: number }) => void;
  quickLutPreviewExternalLoadingText: string | null;
  lutEnabled: boolean;
  lutPath: string | null;
  lutIntensity: number;
  quickLutPreviewCurrentTime: number;
  quickLutPreviewDuration: number;
  quickLutPreviewCurrentTimeLabel: string;
  quickLutPreviewDurationLabel: string;
  onSeek: (time: number) => void;
  quickLutPreviewUsingCompatible: boolean;
  quickLutPreviewCompatibleSuggested: boolean;
  onUseCompatiblePreview: () => void;
  quickLutPreviewPreparing: boolean;
}

interface QuickLutPreviewVideoListModalProps {
  isOpen: boolean;
  t: (key: QuickLutBatchTextKey, params?: Record<string, string | number>) => string;
  videos: QuickLutBatchVideoItem[];
  activeVideoId: string | null;
  onClose: () => void;
  onSwitchVideo: (videoId: string) => void;
  formatFileSize: (bytes: number) => string;
}

export const QuickLutPreviewOverlay = ({
  isOpen,
  t,
  activeVideoDisplayName,
  hasVideos,
  onOpenVideoList,
  previewPlayerRef,
  quickLutRealtimePreviewEnabled,
  quickLutPreviewSrc,
  quickLutPreviewPlaying,
  onTogglePlaying,
  onTimeUpdate,
  onDurationChange,
  onEnded,
  onDecodeIssue,
  quickLutPreviewExternalLoadingText,
  lutEnabled,
  lutPath,
  lutIntensity,
  quickLutPreviewCurrentTime,
  quickLutPreviewDuration,
  quickLutPreviewCurrentTimeLabel,
  quickLutPreviewDurationLabel,
  onSeek,
  quickLutPreviewUsingCompatible,
  quickLutPreviewCompatibleSuggested,
  onUseCompatiblePreview,
  quickLutPreviewPreparing
}: QuickLutPreviewOverlayProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-10 rounded-2xl border border-emerald-500/30 bg-zinc-950/92 p-3 sm:p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{t('quickLutPreviewTitle')}</p>
          <p
            className="text-[11px] text-zinc-500 truncate mt-0.5"
            title={activeVideoDisplayName}
          >
            {activeVideoDisplayName || t('quickLutPreviewNoVideo')}
          </p>
        </div>
        <Button
          variant="secondary"
          className="h-8 px-3 text-xs shrink-0"
          onClick={onOpenVideoList}
          disabled={!hasVideos}
        >
          <List className="w-3.5 h-3.5" />
          {t('quickLutPreviewVideoList')}
        </Button>
      </div>

      <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-black/70 overflow-hidden relative">
        {quickLutRealtimePreviewEnabled ? (
          quickLutPreviewSrc ? (
            <VideoPlayer
              ref={previewPlayerRef}
              src={quickLutPreviewSrc}
              isPlaying={quickLutPreviewPlaying}
              onPlayPause={onTogglePlaying}
              onTimeUpdate={onTimeUpdate}
              onDurationChange={onDurationChange}
              onEnded={onEnded}
              onDecodeIssue={onDecodeIssue}
              externalLoadingText={quickLutPreviewExternalLoadingText}
              lutEnabled={lutEnabled}
              lutPath={lutPath}
              lutIntensity={lutIntensity}
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
        onChange={(event) => onSeek(Number(event.target.value))}
        disabled={!quickLutRealtimePreviewEnabled || !quickLutPreviewSrc || quickLutPreviewDuration <= 0}
        className="w-full accent-emerald-400 disabled:opacity-40"
        aria-label="Quick LUT preview progress"
      />

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2 text-zinc-400 font-mono">
          <span>{quickLutPreviewCurrentTimeLabel}</span>
          <span>/</span>
          <span>{quickLutPreviewDurationLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {!quickLutPreviewUsingCompatible && quickLutPreviewCompatibleSuggested && quickLutRealtimePreviewEnabled && (
            <Button
              variant="ghost"
              className="h-6 px-2 text-[11px] text-amber-400 hover:text-amber-300"
              onClick={onUseCompatiblePreview}
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
  );
};

const QuickLutBatchFeature = ({
  isOpen,
  onToggle,
  t,
  quickLutRealtimePreviewEnabled,
  onToggleRealtimePreview,
  quickLutBatchVideoCountLabel,
  quickLutBatchTotalSizeLabel,
  quickLutBatchVideos,
  videoFileAccept,
  onVideosChange,
  onClearVideos,
  onRemoveVideo,
  quickLutBatchLutPath,
  quickLutBatchLutFileName,
  onSelectLut,
  onClearLut,
  quickLutBatchLutIntensity,
  quickLutBatchHasPendingLutIntensity,
  onChangeLutIntensity,
  onApplyLutIntensity,
  onRun,
  isExporting,
  exportMode,
  exportProgressPercent
}: QuickLutBatchFeatureProps) => {
  return (
    <>
      <div className="mt-3">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'group w-full rounded-xl border px-3 py-3 flex items-center gap-3 text-left transition-all',
            isOpen
              ? 'border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.16)]'
              : 'border-white/10 bg-zinc-950/45 hover:border-emerald-500/40 hover:bg-emerald-500/5'
          )}
        >
          <span
            className={cn(
              'h-6 min-w-6 px-1 rounded-md flex items-center justify-center text-xs font-semibold font-mono',
              isOpen ? 'bg-emerald-300 text-zinc-900' : 'bg-zinc-800 text-zinc-300'
            )}
          >
            2
          </span>
          <span className="flex-1 text-sm font-medium text-zinc-100">
            {t('quickLutBatchButtonLabel')}
          </span>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-emerald-300" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-300 transition-colors" />
          )}
        </button>
      </div>

      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          isOpen ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
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
                onClick={onToggleRealtimePreview}
                className={cn(
                  'w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0',
                  quickLutRealtimePreviewEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full bg-white transition-transform duration-200 mx-1',
                    quickLutRealtimePreviewEnabled ? 'translate-x-5' : 'translate-x-0'
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
                accept={videoFileAccept}
                onChange={onVideosChange}
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
                  onClick={onClearVideos}
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
                        onClick={() => onRemoveVideo(videoItem.id)}
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
                  'max-w-[60%] truncate text-[11px] font-mono text-right',
                  quickLutBatchLutPath ? 'text-zinc-300' : 'text-zinc-500'
                )} title={quickLutBatchLutFileName}>
                  {quickLutBatchLutFileName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="h-8 px-3 text-xs"
                  onClick={onSelectLut}
                >
                  {t('quickLutBatchSelectLut')}
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 px-2 text-xs text-zinc-500 hover:text-red-400"
                  onClick={onClearLut}
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
                  onChange={(event) => onChangeLutIntensity(Number(event.target.value))}
                  className="flex-1 accent-emerald-400"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={quickLutBatchLutIntensity}
                  onChange={(event) => onChangeLutIntensity(Number(event.target.value))}
                  className="w-16 bg-zinc-800 border border-white/10 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono"
                />
                <span className="text-[11px] text-zinc-400">%</span>
                <Button
                  variant={quickLutBatchHasPendingLutIntensity ? 'secondary' : 'ghost'}
                  className="h-8 px-2 text-[11px] shrink-0"
                  onClick={onApplyLutIntensity}
                  disabled={!quickLutBatchHasPendingLutIntensity}
                >
                  {t('applyLutIntensity')}
                </Button>
              </div>
              <p className="text-[11px] text-zinc-500">{t('quickLutBatchAccelHint')}</p>
            </div>

            <Button
              className="w-full h-9 text-sm"
              disabled={isExporting || quickLutBatchVideos.length === 0 || !quickLutBatchLutPath}
              onClick={onRun}
            >
              <Download className="w-4 h-4" />
              {isExporting && exportMode === 'full'
                ? `${t('exportingVideos')} ${Math.round(exportProgressPercent ?? 0)}%`
                : t('quickLutBatchRun')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export const QuickLutPreviewVideoListModal = ({
  isOpen,
  t,
  videos,
  activeVideoId,
  onClose,
  onSwitchVideo,
  formatFileSize
}: QuickLutPreviewVideoListModalProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <List className="w-5 h-5 text-emerald-400" />
            {t('quickLutPreviewListTitle')}
          </h3>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2 custom-scrollbar">
          {videos.length === 0 ? (
            <div className="text-center text-zinc-500 py-8 text-sm">
              {t('quickLutBatchNoVideos')}
            </div>
          ) : (
            videos.map((videoItem) => {
              const isActive = videoItem.id === activeVideoId;
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
                    <span className="lut-preview-current-badge text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {t('currentVideo')}
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => onSwitchVideo(videoItem.id)}
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
  );
};

export default QuickLutBatchFeature;
