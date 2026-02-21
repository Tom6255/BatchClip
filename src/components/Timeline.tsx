import { memo, useEffect, useMemo, useRef, useState } from 'react';

interface TimelineProps {
  duration: number;
  currentTime: number;
  segments: { start: number; end: number; id: string }[];
  pendingStart: number | null;
  onSeek: (time: number) => void;
}

const MIN_ZOOM_LEVEL = 1;
const MAX_ZOOM_LEVEL = 20;

function getTickStep(duration: number): number {
  if (duration <= 30) return 1;
  if (duration <= 120) return 5;
  if (duration <= 600) return 10;
  if (duration <= 1800) return 30;
  if (duration <= 3600) return 60;
  return 300;
}

function formatTickLabel(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const Timeline = memo(function Timeline({
  duration,
  currentTime,
  segments,
  pendingStart,
  onSeek
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoomLevel(prev => Math.max(MIN_ZOOM_LEVEL, Math.min(prev * (1 - e.deltaY * 0.001), MAX_ZOOM_LEVEL)));
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => container?.removeEventListener('wheel', handleWheel);
  }, []);

  const timeToPercent = (time: number) => {
    if (duration <= 0) return 0;
    const clamped = Math.min(duration, Math.max(0, time));
    return (clamped / duration) * 100;
  };

  const spanToPercent = (span: number) => {
    if (duration <= 0) return 0;
    return (Math.max(0, span) / duration) * 100;
  };

  const ticks = useMemo(() => {
    if (duration <= 0) return [];

    const step = getTickStep(duration);
    const generatedTicks: number[] = [];

    for (let tick = 0; tick <= duration; tick += step) {
      generatedTicks.push(tick);
    }

    const lastTick = generatedTicks[generatedTicks.length - 1];
    if (lastTick !== duration) {
      generatedTicks.push(duration);
    }

    return generatedTicks;
  }, [duration]);

  return (
    <div className="w-full h-full flex flex-col select-none">
      <div
        ref={containerRef}
        className="flex-1 w-full overflow-x-auto overflow-y-hidden custom-scrollbar relative bg-zinc-950/30 rounded-lg"
        title="Ctrl+Scroll to Zoom"
      >
        <div
          className="h-full relative"
          style={{ width: `${zoomLevel * 100}%`, minWidth: '100%' }}
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const t = (x / rect.width) * duration;
            onSeek(Math.max(0, Math.min(duration, t)));
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-4 border-b border-white/5 pointer-events-none">
            {ticks.map((tick, idx) => (
              <div
                key={`${tick}-${idx}`}
                className="absolute top-0 bottom-0 border-l border-white/20 text-[9px] text-zinc-500 pl-1 pt-0.5"
                style={{ left: `${timeToPercent(tick)}%` }}
              >
                {formatTickLabel(tick)}
              </div>
            ))}
          </div>

          {segments.map((seg, idx) => (
            <div
              key={seg.id}
              className="absolute top-4 bottom-0 bg-blue-500/20 border-l border-r border-blue-500/60 backdrop-blur-[1px]"
              style={{
                left: `${timeToPercent(seg.start)}%`,
                width: `${spanToPercent(seg.end - seg.start)}%`
              }}
            >
              <div className="absolute top-1 left-1 text-[9px] text-blue-200 font-mono bg-blue-900/50 px-1 rounded">
                #{idx + 1}
              </div>
            </div>
          ))}

          {pendingStart !== null && (
            <div
              className="absolute top-4 bottom-0 bg-amber-500/10 border-l border-amber-500/60 border-dashed border-r-0"
              style={{
                left: `${timeToPercent(pendingStart)}%`,
                width: `${spanToPercent(currentTime - pendingStart)}%`
              }}
            >
              <div className="absolute top-1 left-1 text-[9px] text-amber-500 font-mono">
                Recording... (I)
              </div>
            </div>
          )}

          <div
            className="absolute top-0 bottom-0 w-[1px] bg-red-500 pointer-events-none z-20"
            style={{ left: `${timeToPercent(currentTime)}%` }}
          >
            <div className="absolute top-0 -translate-x-1/2 text-red-500">|</div>
          </div>
        </div>
      </div>
    </div>
  );
});

Timeline.displayName = 'Timeline';

export default Timeline;
