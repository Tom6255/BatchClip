import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { cn } from '../lib/utils';
import { Play, Pause, AlertTriangle } from 'lucide-react';
import { parseCubeLut, packCubeLutToTexture } from '../lib/lut';

interface VideoPlayerProps {
  src: string;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
  onPlayPause: () => void;
  onDecodeIssue?: (issue: { type: 'decode-error' | 'src-not-supported'; code?: number }) => void;
  volume?: number;
  externalLoadingText?: string | null;
  lutEnabled?: boolean;
  lutPath?: string | null;
  lutIntensity?: number;
}

export interface VideoPlayerRef {
  seekTo: (time: number) => void;
  element: HTMLVideoElement | null;
}

type VideoFrameScheduler = 'raf' | 'video-frame';

type VideoFrameCallbackVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: unknown) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

type PackedLutTexture = ReturnType<typeof packCubeLutToTexture>;

type RendererResources = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  vertexBuffer: WebGLBuffer;
  videoTexture: WebGLTexture;
  lutTexture: WebGLTexture;
  positionLocation: number;
  uvLocation: number;
  videoSamplerLocation: WebGLUniformLocation | null;
  lutSamplerLocation: WebGLUniformLocation | null;
  lutSizeLocation: WebGLUniformLocation | null;
  intensityLocation: WebGLUniformLocation | null;
  domainMinLocation: WebGLUniformLocation | null;
  domainMaxLocation: WebGLUniformLocation | null;
};

const DEFAULT_LUT_INTENSITY = 100;
const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_video;
uniform sampler2D u_lut;
uniform float u_lutSize;
uniform float u_intensity;
uniform vec3 u_domainMin;
uniform vec3 u_domainMax;

vec3 normalizeDomain(vec3 color) {
  vec3 domainRange = max(u_domainMax - u_domainMin, vec3(0.000001));
  return clamp((color - u_domainMin) / domainRange, 0.0, 1.0);
}

vec3 sampleLut(vec3 color) {
  float size = u_lutSize;
  float maxIndex = size - 1.0;
  float blueIndex = color.b * maxIndex;
  float blueIndex0 = floor(blueIndex);
  float blueIndex1 = min(blueIndex0 + 1.0, maxIndex);
  float blueMix = blueIndex - blueIndex0;

  float lutWidth = size * size;
  vec2 uv0 = vec2(
    (blueIndex0 * size + color.r * maxIndex + 0.5) / lutWidth,
    (color.g * maxIndex + 0.5) / size
  );
  vec2 uv1 = vec2(
    (blueIndex1 * size + color.r * maxIndex + 0.5) / lutWidth,
    (color.g * maxIndex + 0.5) / size
  );

  vec3 color0 = texture2D(u_lut, uv0).rgb;
  vec3 color1 = texture2D(u_lut, uv1).rgb;
  return mix(color0, color1, blueMix);
}

void main() {
  vec3 sourceColor = texture2D(u_video, v_uv).rgb;
  vec3 mapped = sampleLut(normalizeDomain(sourceColor));
  float amount = clamp(u_intensity, 0.0, 1.0);
  gl_FragColor = vec4(mix(sourceColor, mapped, amount), 1.0);
}
`;

const clampLutIntensity = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_LUT_INTENSITY;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const createShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[BatchClip] Failed to compile shader:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createRendererResources = (canvas: HTMLCanvasElement): RendererResources | null => {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  });

  if (!gl) {
    return null;
  }

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  if (!vertexShader || !fragmentShader) {
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[BatchClip] Failed to link shader program:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  const vertexBuffer = gl.createBuffer();
  const videoTexture = gl.createTexture();
  const lutTexture = gl.createTexture();
  if (!vertexBuffer || !videoTexture || !lutTexture) {
    if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
    if (videoTexture) gl.deleteTexture(videoTexture);
    if (lutTexture) gl.deleteTexture(lutTexture);
    gl.deleteProgram(program);
    return null;
  }

  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const uvLocation = gl.getAttribLocation(program, 'a_uv');

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 1,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      1, 1, 1, 0
    ]),
    gl.STATIC_DRAW
  );

  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.bindTexture(gl.TEXTURE_2D, lutTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return {
    gl,
    program,
    vertexBuffer,
    videoTexture,
    lutTexture,
    positionLocation,
    uvLocation,
    videoSamplerLocation: gl.getUniformLocation(program, 'u_video'),
    lutSamplerLocation: gl.getUniformLocation(program, 'u_lut'),
    lutSizeLocation: gl.getUniformLocation(program, 'u_lutSize'),
    intensityLocation: gl.getUniformLocation(program, 'u_intensity'),
    domainMinLocation: gl.getUniformLocation(program, 'u_domainMin'),
    domainMaxLocation: gl.getUniformLocation(program, 'u_domainMax')
  };
};

const destroyRendererResources = (resources: RendererResources | null) => {
  if (!resources) {
    return;
  }

  const { gl, program, vertexBuffer, videoTexture, lutTexture } = resources;
  gl.deleteTexture(videoTexture);
  gl.deleteTexture(lutTexture);
  gl.deleteBuffer(vertexBuffer);
  gl.deleteProgram(program);
};

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({
  src,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onEnded,
  onPlayPause,
  onDecodeIssue,
  volume = 1,
  externalLoadingText = null,
  lutEnabled = false,
  lutPath = null,
  lutIntensity = DEFAULT_LUT_INTENSITY
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lutCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererResourcesRef = useRef<RendererResources | null>(null);
  const packedLutRef = useRef<PackedLutTexture | null>(null);
  const lutIntensityRef = useRef<number>(clampLutIntensity(lutIntensity));
  const shouldRunRendererRef = useRef(false);
  const frameSchedulerRef = useRef<VideoFrameScheduler | null>(null);
  const frameHandleRef = useRef<number | null>(null);
  const hasReportedDecodeIssue = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [packedLut, setPackedLut] = useState<PackedLutTexture | null>(null);
  const [lutLoadError, setLutLoadError] = useState<string | null>(null);
  const normalizedLutIntensity = clampLutIntensity(lutIntensity);
  const shouldApplyLut = Boolean(lutEnabled && lutPath && normalizedLutIntensity > 0 && packedLut && !lutLoadError);
  const lutRenderingActive = shouldApplyLut && hasLoadedData;
  const lutLoading = Boolean(lutEnabled && lutPath && !packedLut && !lutLoadError);

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    element: videoRef.current
  }));

  const cancelFrameLoop = useCallback(() => {
    if (frameHandleRef.current === null) {
      return;
    }

    const video = videoRef.current as VideoFrameCallbackVideoElement | null;
    if (frameSchedulerRef.current === 'video-frame' && video?.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(frameHandleRef.current);
    } else if (frameSchedulerRef.current === 'raf') {
      window.cancelAnimationFrame(frameHandleRef.current);
    }

    frameHandleRef.current = null;
    frameSchedulerRef.current = null;
  }, []);

  const drawLutFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = lutCanvasRef.current;
    const resources = rendererResourcesRef.current;
    const lutTextureData = packedLutRef.current;
    if (!video || !canvas || !resources || !lutTextureData) {
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const { gl } = resources;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(resources.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, resources.vertexBuffer);
    gl.enableVertexAttribArray(resources.positionLocation);
    gl.vertexAttribPointer(resources.positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(resources.uvLocation);
    gl.vertexAttribPointer(resources.uvLocation, 2, gl.FLOAT, false, 16, 8);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.videoTexture);
    // Avoid driver-specific orientation issues with UNPACK_FLIP_Y on video textures.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch (error) {
      console.warn('[BatchClip] Failed to upload video frame to GPU:', error);
      return;
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.lutTexture);

    gl.uniform1i(resources.videoSamplerLocation, 0);
    gl.uniform1i(resources.lutSamplerLocation, 1);
    gl.uniform1f(resources.lutSizeLocation, lutTextureData.size);
    gl.uniform1f(resources.intensityLocation, lutIntensityRef.current / 100);
    gl.uniform3f(
      resources.domainMinLocation,
      lutTextureData.domainMin[0],
      lutTextureData.domainMin[1],
      lutTextureData.domainMin[2]
    );
    gl.uniform3f(
      resources.domainMaxLocation,
      lutTextureData.domainMax[0],
      lutTextureData.domainMax[1],
      lutTextureData.domainMax[2]
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, []);

  const scheduleFrameLoop = useCallback(() => {
    const video = videoRef.current as VideoFrameCallbackVideoElement | null;
    if (!video || !shouldRunRendererRef.current) {
      return;
    }

    cancelFrameLoop();

    if (typeof video.requestVideoFrameCallback === 'function') {
      frameSchedulerRef.current = 'video-frame';
      frameHandleRef.current = video.requestVideoFrameCallback(() => {
        drawLutFrame();
        scheduleFrameLoop();
      });
      return;
    }

    frameSchedulerRef.current = 'raf';
    frameHandleRef.current = window.requestAnimationFrame(() => {
      drawLutFrame();
      scheduleFrameLoop();
    });
  }, [cancelFrameLoop, drawLutFrame]);

  useEffect(() => {
    setIsLoading(true);
    setHasLoadedData(false);
    setError(null);
    hasReportedDecodeIssue.current = false;
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
  }, [volume]);

  useEffect(() => {
    lutIntensityRef.current = normalizedLutIntensity;
    if (lutRenderingActive) {
      drawLutFrame();
    }
  }, [drawLutFrame, lutRenderingActive, normalizedLutIntensity]);

  useEffect(() => {
    let cancelled = false;

    if (!lutEnabled || !lutPath) {
      setPackedLut(null);
      setLutLoadError(null);
      return;
    }

    const loadLut = async () => {
      try {
        const result = await window.ipcRenderer.readLutFile({ lutPath });
        if (cancelled) {
          return;
        }

        if (!result.success || !result.content) {
          throw new Error(result.error || 'Failed to read LUT file.');
        }

        const parsed = parseCubeLut(result.content);
        setPackedLut(packCubeLutToTexture(parsed));
        setLutLoadError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.warn('[BatchClip] Failed to load LUT file:', error);
        setPackedLut(null);
        setLutLoadError('Failed to load LUT file');
      }
    };

    void loadLut();
    return () => {
      cancelled = true;
    };
  }, [lutEnabled, lutPath]);

  useEffect(() => {
    packedLutRef.current = packedLut;
  }, [packedLut]);

  useEffect(() => {
    const canvas = lutCanvasRef.current;
    const lutTextureData = packedLutRef.current;

    destroyRendererResources(rendererResourcesRef.current);
    rendererResourcesRef.current = null;

    if (!canvas || !lutTextureData) {
      return;
    }

    const resources = createRendererResources(canvas);
    if (!resources) {
      setLutLoadError('WebGL is not available for LUT preview');
      return;
    }

    const { gl } = resources;
    gl.useProgram(resources.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.lutTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      lutTextureData.width,
      lutTextureData.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      lutTextureData.data
    );
    rendererResourcesRef.current = resources;

    return () => {
      destroyRendererResources(rendererResourcesRef.current);
      rendererResourcesRef.current = null;
    };
  }, [packedLut]);

  useEffect(() => {
    shouldRunRendererRef.current = lutRenderingActive;
    cancelFrameLoop();

    if (!lutRenderingActive) {
      return;
    }

    drawLutFrame();
    scheduleFrameLoop();
    return () => {
      shouldRunRendererRef.current = false;
      cancelFrameLoop();
    };
  }, [cancelFrameLoop, drawLutFrame, lutRenderingActive, scheduleFrameLoop]);

  useEffect(() => {
    if (hasLoadedData && videoRef.current) {
      const checkPlaying = () => {
        if (videoRef.current?.paused && isPlaying) {
          videoRef.current.play().catch((err) => {
            console.error('Auto-play failed:', err);
          });
        }
      };
      const timer = setTimeout(checkPlaying, 100);
      return () => clearTimeout(timer);
    }
  }, [hasLoadedData, isPlaying]);

  useEffect(() => {
    return () => {
      shouldRunRendererRef.current = false;
      cancelFrameLoop();
      destroyRendererResources(rendererResourcesRef.current);
      rendererResourcesRef.current = null;
      packedLutRef.current = null;
    };
  }, [cancelFrameLoop]);

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
          setError('Video decode error. The format may not be supported.');
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          setError('Video format is not supported or file path is invalid.');
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          setError('Network error while loading video.');
          break;
        case MediaError.MEDIA_ERR_ABORTED:
          setError('Video loading aborted.');
          break;
        default:
          setError(`Video failed to load: ${errorMessage || 'Unknown error'}`);
      }
      setIsLoading(false);

      if (!hasReportedDecodeIssue.current && onDecodeIssue) {
        if (errorCode === MediaError.MEDIA_ERR_DECODE) {
          hasReportedDecodeIssue.current = true;
          onDecodeIssue({ type: 'decode-error', code: errorCode });
        } else if (errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
          hasReportedDecodeIssue.current = true;
          onDecodeIssue({ type: 'src-not-supported', code: errorCode });
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    setIsLoading(false);
    setHasLoadedData(true);
    setError(null);
    if (videoRef.current) {
      onDurationChange(videoRef.current.duration);
      drawLutFrame();
    }
  };

  const handleLoadedData = () => {
    setHasLoadedData(true);
    setIsLoading(false);
    drawLutFrame();
  };

  return (
    <div
      className="relative w-full h-full bg-zinc-950 flex items-center justify-center group cursor-pointer"
      onClick={onPlayPause}
    >
      <video
        ref={videoRef}
        src={src}
        className={cn(
          'w-full h-full object-contain shadow-2xl pointer-events-none',
          lutRenderingActive && !lutLoadError ? 'opacity-0' : 'opacity-100'
        )}
        onTimeUpdate={() => videoRef.current && onTimeUpdate(videoRef.current.currentTime)}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleLoadedData}
        onEnded={onEnded}
        onError={handleVideoError}
        preload="metadata"
        playsInline
      />

      <canvas
        ref={lutCanvasRef}
        className={cn(
          'absolute inset-0 w-full h-full object-contain shadow-2xl pointer-events-none',
          lutRenderingActive && !lutLoadError ? 'opacity-100' : 'opacity-0'
        )}
      />

      {(isLoading || externalLoadingText || lutLoading) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-white text-sm">{externalLoadingText || (lutLoading ? 'Applying LUT...' : 'Loading video...')}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/60 backdrop-blur-sm p-8">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-white text-lg font-medium mb-2">Failed to load video</p>
          <p className="text-zinc-400 text-sm text-center">{error}</p>
        </div>
      )}

      {!error && lutLoadError && (
        <div className="absolute top-3 left-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200 pointer-events-none">
          LUT preview unavailable
        </div>
      )}

      <div className={cn(
        'absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-300',
        isPlaying ? 'opacity-0 group-hover:opacity-100 scale-150' : 'opacity-100 scale-100'
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

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
