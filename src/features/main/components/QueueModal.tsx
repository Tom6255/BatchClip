import type { ChangeEvent, DragEvent } from 'react';
import { List, Plus, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import Button from '../../../components/ui/Button';
import type { TranslationKey } from '../../../i18n/translations';

interface QueueModalItem {
  id: string;
  displayName: string;
  segments: unknown[];
}

interface QueueModalProps {
  visible: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onClose: () => void;
  videoFileAccept: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  queueVideoCountLabel: string;
  videoQueue: QueueModalItem[];
  activeVideoId: string | null;
  draggingQueueVideoId: string | null;
  dragOverQueueVideoId: string | null;
  onDragStart: (event: DragEvent<HTMLDivElement>, videoId: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, videoId: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, videoId: string) => void;
  onDragEnd: () => void;
  onSwitchVideo: (videoId: string) => void;
  onRemoveVideo: (videoId: string) => void;
}

// EN: Queue manager modal for main editor workflow.
// ZH: 主功能工作流中的队列管理弹窗。
const QueueModal = ({
  visible,
  t,
  onClose,
  videoFileAccept,
  onFileChange,
  queueVideoCountLabel,
  videoQueue,
  activeVideoId,
  draggingQueueVideoId,
  dragOverQueueVideoId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onSwitchVideo,
  onRemoveVideo
}: QueueModalProps) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
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
              accept={videoFileAccept}
              onChange={onFileChange}
            />
            <Button
              variant="secondary"
              className="h-8 px-3 text-xs"
              onClick={() => document.getElementById('queue-file-upload')?.click()}
            >
              <Plus className="w-3.5 h-3.5" />
              {t('addVideos')}
            </Button>
            <Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
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
                onDragStart={(event) => onDragStart(event, item.id)}
                onDragOver={(event) => onDragOver(event, item.id)}
                onDrop={(event) => onDrop(event, item.id)}
                onDragEnd={onDragEnd}
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
                    <span className="queue-current-badge text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {t('currentVideo')}
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => onSwitchVideo(item.id)}
                    >
                      {t('switchVideo')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-zinc-500 hover:text-red-400"
                    onClick={() => onRemoveVideo(item.id)}
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
  );
};

export default QueueModal;
