import { useRef, useEffect, useState, useMemo } from 'react';


interface TimelineProps {
    duration: number;
    currentTime: number;
    segments: { start: number, end: number, id: string }[];
    pendingStart: number | null;
    onSeek: (time: number) => void;
    // onRangeChange removed/modified as it's now internal or different logic
}




export default function Timeline({
    duration,
    currentTime,
    segments,
    pendingStart,
    onSeek,
}: TimelineProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    // Remove complex drag logic for now as we are switching to keyboard I/O primarily
    // or simple click-to-seek.


    // Handle Zoom (Ctrl + Wheel)
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                setZoomLevel(prev => Math.max(1, Math.min(prev * (1 - e.deltaY * 0.001), 20))); // Max 20x zoom
            }
        };
        const container = containerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => container?.removeEventListener('wheel', handleWheel);
    }, []);

    // Helpers to convert Time <-> Pixels
    // If zoomLevel is 1, 100% width = duration.
    // If zoomLevel > 1, width = zoomLevel * 100%.

    const timeToPercent = (time: number) => {
        if (!duration || duration <= 0) return 0;
        return (time / duration) * 100;
    };

    /*
  const percentToTime = (percent: number) => {
     return (percent / 100) * duration;
  };
  */

    // Generate some ruler ticks
    const ticks = useMemo(() => {
        if (duration <= 0) return [];
        const tickCount = Math.floor(duration) + 1;
        return Array.from({ length: tickCount }).map((_, i) => i);
    }, [duration]);

    return (
        <div
            className="w-full h-full flex flex-col select-none"
        >
            <div
                ref={containerRef}
                className="flex-1 w-full overflow-x-auto overflow-y-hidden custom-scrollbar relative bg-zinc-950/30 rounded-lg"
                title="Ctrl+Scroll to Zoom"
            >
                {/* The Track */}
                <div
                    className="h-full relative"
                    style={{ width: `${zoomLevel * 100}%`, minWidth: '100%' }}
                    onMouseDown={(e) => {
                        // Simple seek functionality
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const t = (x / rect.width) * duration;
                        onSeek(t);
                    }}
                >
                    {/* Ticks / Ruler */}
                    <div className="absolute top-0 left-0 right-0 h-4 border-b border-white/5 pointer-events-none">
                        {ticks.map((t) => (
                            <div
                                key={t}
                                className="absolute top-0 bottom-0 border-l border-white/20 text-[9px] text-zinc-500 pl-1 pt-0.5"
                                style={{ left: `${timeToPercent(t)}%` }}
                            >
                                {t}s
                            </div>
                        ))}
                    </div>

                    {/* Render Segments */}
                    {segments.map((seg, idx) => (
                        <div
                            key={seg.id}
                            className="absolute top-4 bottom-0 bg-blue-500/20 border-l border-r border-blue-500/60 backdrop-blur-[1px]"
                            style={{
                                left: `${timeToPercent(seg.start)}%`,
                                width: `${timeToPercent(seg.end - seg.start)}%`
                            }}
                        >
                            <div className="absolute top-1 left-1 text-[9px] text-blue-200 font-mono bg-blue-900/50 px-1 rounded">
                                #{idx + 1}
                            </div>
                        </div>
                    ))}

                    {/* Render Pending Segment (Ghost) */}
                    {pendingStart !== null && (
                        <div
                            className="absolute top-4 bottom-0 bg-amber-500/10 border-l border-amber-500/60 border-dashed border-r-0"
                            style={{
                                left: `${timeToPercent(pendingStart)}%`,
                                width: `${timeToPercent(currentTime - pendingStart)}%`
                            }}
                        >
                            <div className="absolute top-1 left-1 text-[9px] text-amber-500 font-mono">
                                Recording... (I)
                            </div>
                        </div>
                    )}

                    {/* Current Time Playhead */}
                    <div
                        className="absolute top-0 bottom-0 w-[1px] bg-red-500 pointer-events-none z-20"
                        style={{ left: `${timeToPercent(currentTime)}%` }}
                    >
                        <div className="absolute top-0 -translate-x-1/2 text-red-500">▼</div>
                    </div>

                </div>
            </div>
        </div>
    );
}
