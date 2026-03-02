import type { ChangeEvent } from 'react';
import { Camera, ChevronDown, ChevronRight, Images, Trash2, Upload, Video, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import Button from '../ui/Button';
import type { QuickLivePhotoBatchSettings, QuickLivePhotoBatchVideoItem } from '../../features/quick-actions/types';

type QuickLivePhotoTextKey =
  | 'quickLivePhotoButtonLabel'
  | 'quickLivePhotoDesc'
  | 'quickLivePhotoVideosLabel'
  | 'quickLivePhotoVideoCount'
  | 'quickLivePhotoTotalSize'
  | 'quickLivePhotoSelectVideos'
  | 'quickLivePhotoClearVideos'
  | 'quickLivePhotoNoVideos'
  | 'quickLivePhotoCoverPosition'
  | 'quickLivePhotoCoverPositionHint'
  | 'quickLivePhotoMotionDuration'
  | 'quickLivePhotoMotionDurationHint'
  | 'quickLivePhotoRun'
  | 'quickLivePhotoConverting';

interface QuickLivePhotoBatchFeatureProps {
  isOpen: boolean;
  onToggle: () => void;
  t: (key: QuickLivePhotoTextKey, params?: Record<string, string | number>) => string;
  quickLivePhotoBatchVideos: QuickLivePhotoBatchVideoItem[];
  quickLivePhotoVideoCountLabel: string;
  quickLivePhotoTotalSizeLabel: string;
  videoFileAccept: string;
  onVideosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearVideos: () => void;
  onRemoveVideo: (videoId: string) => void;
  quickLivePhotoSettings: QuickLivePhotoBatchSettings;
  onChangeCoverPositionPercent: (value: number) => void;
  onChangeMotionDurationSec: (value: number) => void;
  onRun: () => void;
  isExporting: boolean;
  exportMode: 'clips' | 'full' | 'split' | 'convert' | 'livephoto';
  exportProgressPercent: number | null;
}

const QuickLivePhotoBatchFeature = ({
  isOpen,
  onToggle,
  t,
  quickLivePhotoBatchVideos,
  quickLivePhotoVideoCountLabel,
  quickLivePhotoTotalSizeLabel,
  videoFileAccept,
  onVideosChange,
  onClearVideos,
  onRemoveVideo,
  quickLivePhotoSettings,
  onChangeCoverPositionPercent,
  onChangeMotionDurationSec,
  onRun,
  isExporting,
  exportMode,
  exportProgressPercent
}: QuickLivePhotoBatchFeatureProps) => {
  return (
    <>
      <div className="mt-3">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'group w-full rounded-xl border px-3 py-3 flex items-center gap-3 text-left transition-all',
            isOpen
              ? 'border-rose-400/50 bg-rose-500/10 shadow-[0_0_0_1px_rgba(251,113,133,0.16)]'
              : 'border-white/10 bg-zinc-950/45 hover:border-rose-500/40 hover:bg-rose-500/5'
          )}
        >
          <span
            className={cn(
              'h-6 min-w-6 px-1 rounded-md flex items-center justify-center text-xs font-semibold font-mono',
              isOpen ? 'bg-rose-300 text-zinc-900' : 'bg-zinc-800 text-zinc-300'
            )}
          >
            4
          </span>
          <span className="flex-1 text-sm font-medium text-zinc-100">
            {t('quickLivePhotoButtonLabel')}
          </span>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-rose-300" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-rose-300 transition-colors" />
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
          <div className="rounded-xl border border-rose-500/20 bg-zinc-950/65 p-4 space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">{t('quickLivePhotoDesc')}</p>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">{t('quickLivePhotoVideosLabel')}</span>
                <span className="text-[11px] font-mono text-zinc-200">{quickLivePhotoVideoCountLabel}</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">{t('quickLivePhotoTotalSize')}</span>
                <span className="text-[11px] font-mono text-zinc-200">{quickLivePhotoTotalSizeLabel}</span>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="file"
                className="hidden"
                id="quick-live-photo-batch-upload"
                multiple
                accept={videoFileAccept}
                onChange={onVideosChange}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  onClick={() => document.getElementById('quick-live-photo-batch-upload')?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {t('quickLivePhotoSelectVideos')}
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 px-3 text-xs text-zinc-500 hover:text-red-400"
                  onClick={onClearVideos}
                  disabled={quickLivePhotoBatchVideos.length === 0}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('quickLivePhotoClearVideos')}
                </Button>
              </div>

              {quickLivePhotoBatchVideos.length === 0 ? (
                <p className="text-[11px] text-zinc-500">{t('quickLivePhotoNoVideos')}</p>
              ) : (
                <div className="max-h-24 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                  {quickLivePhotoBatchVideos.map((videoItem) => (
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

            <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] text-zinc-300">{t('quickLivePhotoCoverPosition')}</label>
                <span className="text-[11px] font-mono text-zinc-200">{quickLivePhotoSettings.coverPositionPercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={quickLivePhotoSettings.coverPositionPercent}
                onChange={(event) => onChangeCoverPositionPercent(Number(event.target.value))}
                className="w-full accent-rose-400"
              />
              <p className="text-[11px] text-zinc-500">{t('quickLivePhotoCoverPositionHint')}</p>
            </div>

            <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] text-zinc-300">{t('quickLivePhotoMotionDuration')}</label>
                <span className="text-[11px] font-mono text-zinc-200">{quickLivePhotoSettings.motionDurationSec.toFixed(1)}s</span>
              </div>
              <input
                type="number"
                min={1.5}
                max={6}
                step={0.1}
                value={quickLivePhotoSettings.motionDurationSec}
                onChange={(event) => onChangeMotionDurationSec(Number(event.target.value))}
                className="w-full h-9 rounded-lg bg-zinc-800 border border-white/10 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500/40 font-mono"
              />
              <p className="text-[11px] text-zinc-500">{t('quickLivePhotoMotionDurationHint')}</p>
            </div>

            <Button
              className="w-full h-9 text-sm"
              disabled={isExporting || quickLivePhotoBatchVideos.length === 0}
              onClick={onRun}
            >
              <Camera className="w-4 h-4" />
              <Images className="w-4 h-4" />
              <Video className="w-4 h-4" />
              {isExporting && exportMode === 'livephoto'
                ? `${t('quickLivePhotoConverting')} ${Math.round(exportProgressPercent ?? 0)}%`
                : t('quickLivePhotoRun')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default QuickLivePhotoBatchFeature;
