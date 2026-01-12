import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { cn } from '../lib/utils';
import { Play, Pause } from 'lucide-react';

interface VideoPlayerProps {
    src: string;
    isPlaying: boolean;
    onTimeUpdate: (time: number) => void;
    onDurationChange: (duration: number) => void;
    onEnded: () => void;
    onPlayPause: () => void;
    volume?: number;
}

export interface VideoPlayerRef {
    seekTo: (time: number) => void;
    element: HTMLVideoElement | null;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({
    src,
    isPlaying,
    onTimeUpdate,
    onDurationChange,
    onEnded,
    onPlayPause,
    volume = 1
}, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(ref, () => ({
        seekTo: (time: number) => {
            if (videoRef.current) {
                videoRef.current.currentTime = time;
            }
        },
        element: videoRef.current
    }));

    useEffect(() => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.play().catch(console.error);
            } else {
                videoRef.current.pause();
            }
        }
    }, [isPlaying]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.volume = volume;
        }
    }, [volume])

    return (
        <div
            className="relative w-full h-full bg-zinc-950 flex items-center justify-center group cursor-pointer"
            onClick={onPlayPause}
        >
            <video
                ref={videoRef}
                src={src}
                className="w-full h-full object-contain shadow-2xl pointer-events-none"
                onTimeUpdate={() => videoRef.current && onTimeUpdate(videoRef.current.currentTime)}
                onLoadedMetadata={() => videoRef.current && onDurationChange(videoRef.current.duration)}
                onEnded={onEnded}
            />


            {/* Center Play Button Overlay */}
            <div className={cn(
                "absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-300",
                isPlaying ? "opacity-0 group-hover:opacity-100 scale-150" : "opacity-100 scale-100"
            )}>
                <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10 shadow-xl">
                    {isPlaying ? (
                        <Pause className="w-6 h-6 text-white fill-white" />
                    ) : (
                        <Play className="w-6 h-6 text-white ml-1 fill-white" />
                    )}
                </div>
            </div>
        </div>
    );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
