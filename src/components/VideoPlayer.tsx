import { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import { cn } from '../lib/utils';
import { Play, Pause, AlertTriangle } from 'lucide-react';

interface VideoPlayerProps {
    src: string;
    isPlaying: boolean;
    onTimeUpdate: (time: number) => void;
    onDurationChange: (duration: number) => void;
    onEnded: () => void;
    onPlayPause: () => void;
    volume?: number;
    externalLoadingText?: string | null;
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
    volume = 1,
    externalLoadingText = null
}, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoadedData, setHasLoadedData] = useState(false);

    useImperativeHandle(ref, () => ({
        seekTo: (time: number) => {
            if (videoRef.current) {
                videoRef.current.currentTime = time;
            }
        },
        element: videoRef.current
    }));

    useEffect(() => {
        // Reset loading state when src changes
        setIsLoading(true);
        setHasLoadedData(false);
        setError(null);
    }, [src]);

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

    const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        console.error('Video error event:', e);

        if (video.error) {
            const errorCode = video.error.code;
            const errorMessage = video.error.message;
            console.error('Video error details:', {
                code: errorCode,
                message: errorMessage,
                src: video.src
            });

            switch (errorCode) {
                case MediaError.MEDIA_ERR_DECODE:
                    setError('视频解码错误，格式可能不受支持');
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    setError('视频文件格式不支持或路径无效');
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    setError('视频加载过程中出现网络错误');
                    break;
                case MediaError.MEDIA_ERR_ABORTED:
                    setError('视频加载已中止');
                    break;
                default:
                    setError(`视频加载失败：${errorMessage || '未知错误'}`);
            }
            setIsLoading(false);
        }
    };

    const handleLoadedMetadata = () => {
        console.log('Video metadata loaded:', {
            duration: videoRef.current?.duration,
            width: videoRef.current?.videoWidth,
            height: videoRef.current?.videoHeight
        });
        setIsLoading(false);
        setHasLoadedData(true);
        setError(null);
        if (videoRef.current) {
            onDurationChange(videoRef.current.duration);
        }
    };

    const handleLoadedData = () => {
        console.log('Video data loaded, readyState:', videoRef.current?.readyState);
        setHasLoadedData(true);
        setIsLoading(false);
    };

    // Handle the case where video is playing but hasn't loaded yet
    useEffect(() => {
        if (hasLoadedData && videoRef.current) {
            const checkPlaying = () => {
                if (videoRef.current?.paused && isPlaying) {
                    videoRef.current.play().catch(err => {
                        console.error('Auto-play failed:', err);
                    });
                }
            };
            const timer = setTimeout(checkPlaying, 100);
            return () => clearTimeout(timer);
        }
    }, [hasLoadedData, isPlaying]);

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
                onLoadedMetadata={handleLoadedMetadata}
                onLoadedData={handleLoadedData}
                onEnded={onEnded}
                onError={handleVideoError}
                preload="metadata"
                playsInline
            />

            {/* Loading Indicator */}
            {(isLoading || externalLoadingText) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        <span className="text-white text-sm">{externalLoadingText || '加载视频中...'}</span>
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/60 backdrop-blur-sm p-8">
                    <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                    <p className="text-white text-lg font-medium mb-2">视频加载失败</p>
                    <p className="text-zinc-400 text-sm text-center">{error}</p>
                    <p className="text-zinc-500 text-xs text-center mt-4">
                        如果是在 macOS 上，某些视频格式可能需要转码
                    </p>
                </div>
            )}

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
