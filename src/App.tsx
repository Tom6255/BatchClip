import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, Zap, Download, Trash2, Scissors } from 'lucide-react';
import { cn } from './lib/utils';
import VideoPlayer, { VideoPlayerRef } from './components/VideoPlayer';
import Timeline from './components/Timeline';
import { v4 as uuidv4 } from 'uuid';

const MAX_CLIP_DURATION = 3.9;

// Reusable Button Component
const Button = ({ className, variant = 'primary', ...props }: any) => {
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
}

// Main App Component
function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);


  // Video State
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Editor State
  const [segments, setSegments] = useState<Segment[]>([]);
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  const videoPlayerRef = useRef<VideoPlayerRef>(null);

  // Reset state when file changes
  const [videoSrc, setVideoSrc] = useState<string>("");

  // Create Object URL only when file changes
  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoSrc(url);

      setIsPlaying(false);
      setDuration(0);
      setCurrentTime(0);
      setSegments([]);
      setPendingStart(null);

      return () => {
        URL.revokeObjectURL(url);
        setVideoSrc("");
      };
    }
  }, [videoFile]);


  const handleDurationChange = (d: number) => {
    if (!d || !isFinite(d)) return;
    setDuration(d);
  };

  // Keyboard Shortcuts (I/O)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoFile) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.toLowerCase() === 'i') {
        setPendingStart(currentTime);
      } else if (e.key.toLowerCase() === 'o') {
        closeSegment();
      } else if (e.code === 'Space') {
        e.preventDefault(); // Prevent scroll
        setIsPlaying(p => !p);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoFile, currentTime, pendingStart]);

  const closeSegment = useCallback(() => {
    if (pendingStart === null) return;

    let end = currentTime;

    // Validate order
    if (end <= pendingStart) {
      // Assuming user wants to reset or something, but usually O > I.
      // If simply behind, ignore or clamp?
      // Let's reset pending if invalid
      // setPendingStart(null); 
      return;
    }

    // Clamp max duration
    if (end - pendingStart > MAX_CLIP_DURATION) {
      end = pendingStart + MAX_CLIP_DURATION;
    }

    const newSegment: Segment = {
      id: uuidv4(),
      start: pendingStart,
      end: end
    };

    setSegments(prev => [...prev, newSegment].sort((a, b) => a.start - b.start));
    setPendingStart(null);
  }, [pendingStart, currentTime]);


  // Time Update Logic (Auto-close)
  const handleTimeUpdate = (t: number) => {
    setCurrentTime(t);

    // Auto-close logic
    if (pendingStart !== null && (t - pendingStart >= MAX_CLIP_DURATION)) {
      // Force close at precise limit
      const autoEnd = pendingStart + MAX_CLIP_DURATION;
      const newSegment: Segment = {
        id: uuidv4(),
        start: pendingStart,
        end: autoEnd
      };
      setSegments(prev => [...prev, newSegment].sort((a, b) => a.start - b.start));
      setPendingStart(null);

      // Optional: Pause? Or Keep playing? User request implies "auto add O point"
      // Let's keep playing but maybe flash UI?
    }
  };

  const deleteSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (files: FileList) => {
    const file = files[0];
    if (file.type.startsWith('video/')) {
      setVideoFile(file);
    } else {
      alert("Please upload a video file.");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30 flex flex-col overflow-hidden">

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


      {/* Main Content */}
      <main className="pt-14 flex-1 flex overflow-hidden">
        {!videoFile ? (
          <div
            className={cn(
              "flex-1 m-6 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl transition-all duration-300 gap-6 bg-zinc-900/30",
              dragActive ? "border-blue-500 bg-blue-500/10" : "border-zinc-800 hover:border-zinc-700"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <Upload className="w-12 h-12 mx-auto text-zinc-600" />
              <h2 className="text-2xl font-semibold text-white">Drop video to start</h2>
              <input type="file" className="hidden" id="file-upload" accept="video/*" onChange={handleChange} />
              <Button onClick={() => document.getElementById('file-upload')?.click()}>Select Video</Button>
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
                  onPlayPause={() => setIsPlaying(!isPlaying)}
                  onTimeUpdate={handleTimeUpdate}
                  onDurationChange={handleDurationChange}
                  onEnded={() => setIsPlaying(false)}
                />

              </div>

              {/* Timeline Controls */}
              <div className="h-48 bg-zinc-900 border border-white/5 rounded-lg p-4 flex flex-col gap-2 flex-shrink-0">

                <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
                  <span>Running Time: {formatTime(currentTime)}</span>
                  <span>Total: {formatTime(duration)}</span>
                </div>
                <div className="flex-1 min-h-0">
                  <Timeline
                    duration={duration}
                    currentTime={currentTime}
                    segments={segments}
                    pendingStart={pendingStart}
                    onSeek={(t) => {
                      videoPlayerRef.current?.seekTo(t);
                      setCurrentTime(t); // Optimistic update
                    }}
                  />
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 text-xs font-mono">I</kbd>
                    <span className="text-sm text-zinc-400">Set In</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 text-xs font-mono">O</kbd>
                    <span className="text-sm text-zinc-400">Set Out</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 text-xs font-mono">Space</kbd>
                    <span className="text-sm text-zinc-400">Play/Pause</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => setPendingStart(currentTime)}
                      disabled={pendingStart !== null}
                    >
                      Mark In (I)
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={closeSegment}
                      disabled={pendingStart === null}
                    >
                      Mark Out (O)
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
                  Clips ({segments.length})
                </h3>
                <Button variant="ghost" className="h-8 w-8 p-0 no-drag" onClick={() => setVideoFile(null)}>
                  <X className="w-4 h-4" />
                </Button>

              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {segments.length === 0 ? (
                  <div className="text-center text-zinc-500 py-10 text-sm">
                    No clips created.<br />Use <b>I</b> and <b>O</b> to snip.
                  </div>
                ) : (
                  segments.map((seg, idx) => (
                    <div key={seg.id} className="bg-zinc-950 p-3 rounded border border-white/5 flex items-center gap-3 group">
                      <div className="w-6 h-6 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center text-xs font-mono">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-300">
                          Clip {idx + 1}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">
                          {formatTime(seg.start)} - {formatTime(seg.end)}
                        </div>
                      </div>
                      <button
                        className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                        onClick={() => deleteSegment(seg.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-white/5 bg-zinc-900">
                <Button
                  className="w-full"
                  disabled={segments.length === 0}
                  onClick={async () => {
                    console.log("Export button clicked");
                    try {
                      if (!videoFile) {
                        console.error("No video file");
                        return;
                      }

                      console.log("Getting file path...");
                      // In Electron, dropped files have a 'path' property
                      const filePath = (videoFile as any).path as string;
                      console.log("File path resolved:", filePath);
                      if (!filePath) {
                        alert("Could not determine source file path. Please try dropping the file again.");
                        return;
                      }

                      console.log("Requesting output directory...");
                      const outputDir = await window.ipcRenderer.showOpenDialog();
                      console.log("Output directory:", outputDir);

                      if (!outputDir) return;

                      const btn = document.activeElement as HTMLButtonElement;
                      if (btn) btn.disabled = true;
                      const originalText = btn.innerText;
                      btn.innerText = "Exporting...";

                      try {
                        const res = await window.ipcRenderer.processBatch({
                          filePath,
                          outputDir,
                          segments
                        });
                        if (res.success) {
                          alert(`Exported ${res.results.length} clips successfully!`);
                        } else {
                          alert("Some exports failed. Check console for details.");
                        }
                      } finally {
                        if (btn) {
                          btn.disabled = false;
                          btn.innerText = originalText;
                        }
                      }
                    } catch (e: any) {
                      console.error("Export error:", e);
                      alert("Export failed: " + e.message);
                    }
                  }}

                >
                  <Download className="w-4 h-4" />
                  Export All Clips
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
