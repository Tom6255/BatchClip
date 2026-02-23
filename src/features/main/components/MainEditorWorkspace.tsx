import type { RefObject } from 'react';
import { Download, List, Plus, Scissors, Settings as SettingsIcon, Tag, X } from 'lucide-react';
import VideoPlayer, { type VideoPlayerRef } from '../../../components/VideoPlayer';
import Timeline from '../../../components/Timeline';
import Button from '../../../components/ui/Button';
import type { TranslationKey } from '../../../i18n/translations';
import type { QueueVideoItem, Segment } from '../types';
import SegmentList from './SegmentList';

interface MainEditorWorkspaceProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  videoPlayerRef: RefObject<VideoPlayerRef>;
  videoSrc: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onVideoEnded: () => void;
  onDecodeIssue: (issue: { type: 'decode-error' | 'src-not-supported'; code?: number }) => void;
  isPreparingPreview: boolean;
  previewLoadingText: string;
  previewProgressPercent: number | null;
  shouldApplyLutOnPreview: boolean;
  normalizedLutPath: string;
  normalizedLutIntensity: number;
  currentTime: number;
  duration: number;
  usingCompatiblePreview: boolean;
  compatiblePreviewSuggested: boolean;
  onUseCompatiblePreview: () => void;
  usingLutPreview: boolean;
  normalizedLutIntensityDraft: number;
  onChangeLutIntensityDraft: (value: number) => void;
  hasPendingLutIntensity: boolean;
  onApplyLutIntensity: () => void;
  pendingStart: number | null;
  segments: Segment[];
  onSeek: (time: number) => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  totalQueueClipCount: number;
  onOpenQueue: () => void;
  onOpenSettings: () => void;
  onRemoveActiveVideo: () => void;
  tagsLabel: string;
  tagLibrary: string[];
  newTagDraft: string;
  maxTagLength: number;
  tagPlaceholder: string;
  onNewTagDraftChange: (value: string) => void;
  onAddTag: () => void;
  noTagLibraryLabel: string;
  onRemoveTagFromLibrary: (tagName: string) => void;
  tagsNameHintLabel: string;
  videoQueue: QueueVideoItem[];
  activeVideoId: string | null;
  clipLabel: string;
  noClipsLabel: string;
  noSegmentTagsLabel: string;
  editTagsLabel: string;
  onSwitchVideo: (videoId: string) => void;
  onDeleteSegment: (videoId: string, segmentId: string) => void;
  onToggleSegmentTag: (videoId: string, segmentId: string, tagName: string) => void;
  isExporting: boolean;
  exportProgressPercent: number | null;
  onExportAllClips: () => void;
  shouldApplyLutOnExport: boolean;
  onOpenLutFullExportConfirm: () => void;
  formatTime: (seconds: number) => string;
}

// EN: Main editor workspace extracted from App.tsx to keep app shell focused on orchestration.
// ZH: 主编辑工作区从 App.tsx 抽离，App 仅负责状态编排与功能调度。
const MainEditorWorkspace = ({
  t,
  videoPlayerRef,
  videoSrc,
  isPlaying,
  onPlayPause,
  onTimeUpdate,
  onDurationChange,
  onVideoEnded,
  onDecodeIssue,
  isPreparingPreview,
  previewLoadingText,
  previewProgressPercent,
  shouldApplyLutOnPreview,
  normalizedLutPath,
  normalizedLutIntensity,
  currentTime,
  duration,
  usingCompatiblePreview,
  compatiblePreviewSuggested,
  onUseCompatiblePreview,
  usingLutPreview,
  normalizedLutIntensityDraft,
  onChangeLutIntensityDraft,
  hasPendingLutIntensity,
  onApplyLutIntensity,
  pendingStart,
  segments,
  onSeek,
  onMarkIn,
  onMarkOut,
  totalQueueClipCount,
  onOpenQueue,
  onOpenSettings,
  onRemoveActiveVideo,
  tagsLabel,
  tagLibrary,
  newTagDraft,
  maxTagLength,
  tagPlaceholder,
  onNewTagDraftChange,
  onAddTag,
  noTagLibraryLabel,
  onRemoveTagFromLibrary,
  tagsNameHintLabel,
  videoQueue,
  activeVideoId,
  clipLabel,
  noClipsLabel,
  noSegmentTagsLabel,
  editTagsLabel,
  onSwitchVideo,
  onDeleteSegment,
  onToggleSegmentTag,
  isExporting,
  exportProgressPercent,
  onExportAllClips,
  shouldApplyLutOnExport,
  onOpenLutFullExportConfirm,
  formatTime
}: MainEditorWorkspaceProps) => {
  return (
    <div className="flex-1 flex gap-4 p-4 w-full max-w-full overflow-hidden">
      <div className="flex-[3] flex flex-col gap-4 min-w-0 h-full overflow-hidden">
        <div className="flex-1 bg-black rounded-lg overflow-hidden relative shadow-2xl flex items-center justify-center min-h-0">
          <VideoPlayer
            ref={videoPlayerRef}
            src={videoSrc}
            isPlaying={isPlaying}
            onPlayPause={onPlayPause}
            onTimeUpdate={onTimeUpdate}
            onDurationChange={onDurationChange}
            onEnded={onVideoEnded}
            onDecodeIssue={onDecodeIssue}
            externalLoadingText={isPreparingPreview ? `${previewLoadingText} ${Math.round(previewProgressPercent ?? 0)}%` : null}
            lutEnabled={shouldApplyLutOnPreview}
            lutPath={shouldApplyLutOnPreview ? normalizedLutPath : null}
            lutIntensity={normalizedLutIntensity}
          />
        </div>

        <div className="h-48 bg-zinc-900 border border-white/5 rounded-lg p-4 flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>{t('runningTime')}: {formatTime(currentTime)}</span>
            <div className="flex items-center gap-3">
              {!usingCompatiblePreview && compatiblePreviewSuggested && (
                <Button
                  variant="ghost"
                  className="h-6 px-2 text-[11px] text-amber-400 hover:text-amber-300"
                  onClick={onUseCompatiblePreview}
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
                    onChange={(event) => {
                      onChangeLutIntensityDraft(Number(event.target.value));
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
                    onChange={(event) => {
                      onChangeLutIntensityDraft(Number(event.target.value));
                    }}
                    className="w-14 bg-zinc-800 border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 font-mono"
                  />
                  <span className="text-cyan-200">%</span>
                  <Button
                    variant={hasPendingLutIntensity ? 'primary' : 'secondary'}
                    className="h-6 px-2 text-[11px]"
                    onClick={onApplyLutIntensity}
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
              onSeek={onSeek}
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
                onClick={onMarkIn}
                disabled={pendingStart !== null}
              >
                {t('markIn')} (I)
              </Button>
              <Button
                variant="secondary"
                className="h-8 text-xs font-normal"
                onClick={onMarkOut}
                disabled={pendingStart === null}
              >
                {t('markOut')} (O)
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-zinc-900 border border-white/5 rounded-lg flex flex-col min-w-[300px]">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2">
            <Scissors className="w-4 h-4 text-blue-500" />
            {t('clips')} ({totalQueueClipCount})
          </h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" className="h-8 w-8 p-0" onClick={onOpenQueue}>
              <List className="w-4 h-4" />
            </Button>
            <Button variant="ghost" className="h-8 w-8 p-0" onClick={onOpenSettings}>
              <SettingsIcon className="w-4 h-4" />
            </Button>
            <Button variant="ghost" className="h-8 w-8 p-0 no-drag" onClick={onRemoveActiveVideo}>
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
              maxLength={maxTagLength}
              placeholder={tagPlaceholder}
              onChange={(event) => onNewTagDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onAddTag();
                }
              }}
              className="flex-1 h-8 bg-zinc-800 border border-white/10 rounded-md px-2.5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            <Button
              variant="secondary"
              className="h-8 px-2.5 text-xs"
              onClick={onAddTag}
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
                    onClick={() => onRemoveTagFromLibrary(tagName)}
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
            onSwitchVideo={onSwitchVideo}
            switchLabel={t('switchVideo')}
            currentLabel={t('currentVideo')}
            onDeleteSegment={onDeleteSegment}
            onToggleSegmentTag={onToggleSegmentTag}
            formatTime={formatTime}
          />
        </div>

        <div className="p-4 border-t border-white/5 bg-zinc-900">
          <Button
            className="w-full"
            disabled={totalQueueClipCount === 0 || isExporting}
            onClick={onExportAllClips}
          >
            <Download className="w-4 h-4" />
            {isExporting ? `${t('exporting')} ${Math.round(exportProgressPercent ?? 0)}%` : t('exportAll')}
          </Button>
          {shouldApplyLutOnExport && (
            <Button
              variant="secondary"
              className="w-full mt-2"
              disabled={videoQueue.length === 0 || isExporting}
              onClick={onOpenLutFullExportConfirm}
            >
              <Download className="w-4 h-4" />
              {t('exportAllVideosWithLut')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainEditorWorkspace;
