import { memo, useState } from 'react';
import { Tag, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import Button from '../../../components/ui/Button';
import type { QueueVideoItem } from '../types';

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
  formatTime: (seconds: number) => string;
}

// EN: Segment rendering is isolated so clip/tag UX can evolve without inflating App.tsx.
// ZH: 将片段列表抽离，便于后续扩展标签与片段交互，同时减轻 App.tsx 复杂度。
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
  currentLabel,
  formatTime
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
                                    'px-2 py-0.5 rounded-md border text-[11px] transition-colors',
                                    isSelected
                                      ? 'border-blue-500/50 bg-blue-500/20 text-blue-200'
                                      : 'border-white/10 bg-zinc-800/70 text-zinc-300 hover:border-blue-400/40 hover:text-zinc-100'
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

export default SegmentList;
