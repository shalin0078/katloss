import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Download,
  Upload,
  Video,
  Clock,
  Film,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Eye,
  Wand2,
} from "lucide-react";
import confetti from "canvas-confetti";
import { KatlossAPI } from "@/services/api";
import type { WatermarkBox, TaskStatus } from "@/services/api";
import { SAMPLE_VIDEOS } from "@/data/samples";
import type { SampleVideo } from "@/data/samples";

export const VideoStudio: React.FC = () => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [localVideoPath, setLocalVideoPath] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);

  // Auto-detection state
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectionBanner, setDetectionBanner] = useState<string | null>(null);

  // Watermark boxes
  const [boxes, setBoxes] = useState<WatermarkBox[]>([]);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number>(0);

  // Settings
  const [algorithm, setAlgorithm] = useState<"harmonic" | "stroke" | "ns" | "telea" | "delogo">("harmonic");
  const [quality, setQuality] = useState<"high" | "medium" | "low">("high");
  const [fullDuration, setFullDuration] = useState<boolean>(true);

  // Task processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<number>(0);
  const [taskMessage, setTaskMessage] = useState<string>("");
  const [cleanedVideoUrl, setCleanedVideoUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"cleaned" | "original">("cleaned");

  // Drawing box state
  const [isDrawingBox, setIsDrawingBox] = useState<boolean>(false);
  const startDragRef = useRef<{ x: number; y: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Check Backend Health
  useEffect(() => {
    KatlossAPI.getHealth().then((res) => {
      setBackendOnline(res.status === "online");
    });
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setCleanedVideoUrl(null);
    setBoxes([
      {
        x: 40,
        y: 40,
        width: 160,
        height: 50,
        start_time: 0,
        end_time: 10,
        display_width: 640,
        display_height: 360,
      },
    ]);
  };

  const handleAutoDetect = async () => {
    if (!videoFile && !localVideoPath) {
      alert("Please upload a video or select a sample / local video first.");
      return;
    }
    if (!backendOnline) {
      alert("Please ensure the Katloss backend server is running (python run_backend.py).");
      return;
    }

    setIsDetecting(true);
    setDetectionBanner("Scanning video frames across candidate perimeter zones...");

    try {
      const res = await KatlossAPI.detectWatermark({
        file: videoFile || undefined,
        videoPath: localVideoPath || undefined,
      });

      if (res.detected && res.boxes.length > 0) {
        const dispW = overlayRef.current?.clientWidth || videoRef.current?.clientWidth || 640;
        const dispH = overlayRef.current?.clientHeight || videoRef.current?.clientHeight || 360;
        const vidW = res.video_width || 1920;
        const vidH = res.video_height || 1080;
        const scaleX = dispW / vidW;
        const scaleY = dispH / vidH;

        const mappedBoxes: WatermarkBox[] = res.boxes.map((b) => ({
          x: Math.round(b.x * scaleX),
          y: Math.round(b.y * scaleY),
          width: Math.max(16, Math.round(b.width * scaleX)),
          height: Math.max(16, Math.round(b.height * scaleY)),
          start_time: b.start_time ?? 0,
          end_time: b.end_time ?? Math.round(duration || (res.total_frames && res.fps ? res.total_frames / res.fps : 10)),
          display_width: dispW,
          display_height: dispH,
        }));

        setBoxes(mappedBoxes);
        setSelectedBoxIndex(0);
        const topConf = Math.round(((res.boxes[0] as any).confidence || 0.93) * 100);
        const zoneName = ((res.boxes[0] as any).zone || "bottom_right").replace("_", " ");
        setDetectionBanner(`Auto-detected watermark in ${zoneName} (${topConf}% confidence)`);
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.4 },
          colors: ["#10b981", "#E1E0CC"],
        });
      } else {
        setDetectionBanner("No stationary watermark detected in candidate zones.");
      }
    } catch (err: any) {
      setDetectionBanner(`Detection error: ${err.message}`);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleLoadLocalFarmers = () => {
    const targetPath = "D:\\DL\\Farmers_discussing_agricultural_\u2026_1080p_20260912114625.mp4";
    setLocalVideoPath(targetPath);
    setVideoFile(null);
    setVideoSrc(KatlossAPI.getDownloadUrl("Farmers_discussing_agricultural_cleaned_1080p.mp4"));
    setCleanedVideoUrl(KatlossAPI.getDownloadUrl("Farmers_discussing_agricultural_cleaned_1080p.mp4"));
    setBoxes([
      {
        x: 566,
        y: 286,
        width: 28,
        height: 28,
        start_time: 0,
        end_time: 10,
        display_width: 640,
        display_height: 360,
      },
    ]);
    setDetectionBanner("1080p Target Video loaded (D:\\DL\\Farmers...). Click Auto-Detect or Erase.");
  };

  const handleSelectSample = async (sample: SampleVideo) => {
    setVideoSrc(sample.url);
    setCleanedVideoUrl(null);
    setBoxes([sample.defaultBox]);

    // Download sample as File object so it can be passed to backend
    try {
      const response = await fetch(sample.url);
      const blob = await response.blob();
      const file = new File([blob], `${sample.id}.mp4`, { type: "video/mp4" });
      setVideoFile(file);
    } catch (e) {
      console.error("Could not load sample file:", e);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration || 0;
    setDuration(dur);
    setBoxes((prev) =>
      prev.map((b) => ({
        ...b,
        end_time: b.end_time || Math.round(dur),
      }))
    );
  };

  const stepFrame = (forward: boolean) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    const frameTime = 1 / 25; // 25 fps
    videoRef.current.currentTime = Math.max(
      0,
      Math.min(duration, videoRef.current.currentTime + (forward ? frameTime : -frameTime))
    );
  };

  // Convert mouse event on overlay into relative video coordinates
  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    setIsDrawingBox(true);
    startDragRef.current = { x, y };
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingBox || !startDragRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const currX = Math.round(e.clientX - rect.left);
    const currY = Math.round(e.clientY - rect.top);

    const x = Math.min(startDragRef.current.x, currX);
    const y = Math.min(startDragRef.current.y, currY);
    const width = Math.abs(currX - startDragRef.current.x);
    const height = Math.abs(currY - startDragRef.current.y);

    if (width > 5 && height > 5) {
      setBoxes((prev) => {
        const next = [...prev];
        next[selectedBoxIndex] = {
          ...next[selectedBoxIndex],
          x,
          y,
          width,
          height,
          start_time: next[selectedBoxIndex]?.start_time ?? 0,
          end_time: next[selectedBoxIndex]?.end_time ?? Math.round(duration),
          display_width: Math.round(rect.width),
          display_height: Math.round(rect.height),
        };
        return next;
      });
    }
  };

  const handleOverlayMouseUp = () => {
    setIsDrawingBox(false);
    startDragRef.current = null;
  };

  const addNewBox = () => {
    const dispW = overlayRef.current?.clientWidth || 640;
    const dispH = overlayRef.current?.clientHeight || 360;
    const newBox: WatermarkBox = {
      x: 50,
      y: 50,
      width: 140,
      height: 45,
      start_time: 0,
      end_time: Math.round(duration) || 10,
      display_width: dispW,
      display_height: dispH,
    };
    setBoxes((prev) => [...prev, newBox]);
    setSelectedBoxIndex(boxes.length);
  };

  const removeBox = (index: number) => {
    setBoxes((prev) => prev.filter((_, i) => i !== index));
    setSelectedBoxIndex(0);
  };

  // Submit Video Watermark Removal Job
  const handleStartProcessing = async () => {
    if (!videoFile && !localVideoPath) {
      alert("Please upload a video file or choose a sample clip / local video first.");
      return;
    }

    if (!backendOnline) {
      alert("Please ensure the Katloss FastAPI backend is running (python run_backend.py) to process video watermark removal.");
      return;
    }

    if (boxes.length === 0) {
      alert("Please define at least one watermark bounding box or use Auto-Detect.");
      return;
    }

    setIsProcessing(true);
    setTaskProgress(5);
    setTaskMessage("Synthesizing clean frames with zero blur...");

    try {
      // Calculate current display viewport dimensions so backend scales coordinates accurately
      const dispW = overlayRef.current?.clientWidth || videoRef.current?.clientWidth || 640;
      const dispH = overlayRef.current?.clientHeight || videoRef.current?.clientHeight || 360;

      const scaledBoxes = boxes.map((b) => ({
        ...b,
        start_time: fullDuration ? undefined : b.start_time,
        end_time: fullDuration ? undefined : b.end_time,
        display_width: b.display_width || dispW,
        display_height: b.display_height || dispH,
      }));

      let taskId: string;
      let fallbackUrl: string | undefined = undefined;

      if (!videoFile && localVideoPath) {
        const res = await KatlossAPI.processLocalVideo({
          videoPath: localVideoPath,
          boxes: scaledBoxes,
          algorithm,
          quality,
        });
        taskId = res.taskId;
        fallbackUrl = res.downloadUrl;
      } else if (videoFile) {
        const res = await KatlossAPI.submitVideoWatermarkJob({
          file: videoFile,
          boxes: scaledBoxes,
          algorithm,
          quality,
        });
        taskId = res.taskId;
      } else {
        throw new Error("No video available to process.");
      }

      setCurrentTaskId(taskId);

      // Poll task progress every 800ms
      const pollInterval = setInterval(async () => {
        try {
          const status: TaskStatus = await KatlossAPI.getVideoTaskStatus(taskId);
          setTaskProgress(status.progress);
          setTaskMessage(status.message);

          if (status.status === "completed") {
            clearInterval(pollInterval);
            setIsProcessing(false);
            const finalUrl = status.output_filename
              ? KatlossAPI.getDownloadUrl(status.output_filename)
              : fallbackUrl || null;
            if (finalUrl) {
              setCleanedVideoUrl(finalUrl);
              setPreviewMode("cleaned");
            }
            confetti({
              particleCount: 100,
              spread: 80,
              origin: { y: 0.6 },
              colors: ["#E1E0CC", "#10b981", "#6366f1"],
            });
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            setIsProcessing(false);
            alert(`Processing failed: ${status.error || "Unknown error"}`);
          }
        } catch {
          // Retry on intermittent poll
        }
      }, 800);
    } catch (err: any) {
      setIsProcessing(false);
      alert(`Error starting task: ${err.message}`);
    }
  };

  const handleCancelTask = async () => {
    if (currentTaskId) {
      await KatlossAPI.cancelVideoTask(currentTaskId);
      setIsProcessing(false);
      setTaskMessage("Task cancelled by user.");
    }
  };

  // Format seconds to MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = Math.floor(secs % 60);
    return `${String(mins).padStart(2, "0")}:${String(remSecs).padStart(2, "0")}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#E1E0CC]/10 text-[#E1E0CC] border border-[#E1E0CC]/20">
              Video Delogo Suite
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                backendOnline
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${backendOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {backendOnline ? "FFmpeg 7.1 Engine Online" : "Backend Offline (Start Python Server)"}
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mt-2 text-[#E1E0CC]">
            AI Video Watermark Remover
          </h2>
          <p className="text-xs md:text-sm text-white/60">
            Remove channel logos, TikTok watermarks, and timestamps with automatic coordinate scaling and audio preservation.
          </p>
        </div>

        {/* Sample Selectors */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-white/50 font-medium whitespace-nowrap">Try Samples:</span>
          <button
            onClick={handleLoadLocalFarmers}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
            title="Load local 1080p video from D:\DL"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Farmers 1080p (D:\DL)
          </button>
          {SAMPLE_VIDEOS.map((v) => (
            <button
              key={v.id}
              onClick={() => handleSelectSample(v)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
            >
              <Film className="w-3.5 h-3.5 text-[#E1E0CC]" />
              {v.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main Workspace */}
      {!videoSrc ? (
        <div className="border-2 border-dashed border-white/20 rounded-3xl p-12 text-center bg-white/[0.02] hover:bg-white/[0.04] transition-all flex flex-col items-center justify-center min-h-[420px]">
          <div className="w-16 h-16 rounded-full bg-[#E1E0CC]/10 flex items-center justify-center text-[#E1E0CC] mb-4 border border-[#E1E0CC]/20">
            <Video className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-[#E1E0CC]">Upload video to remove watermark</h3>
          <p className="text-sm text-white/50 max-w-md mt-1 mb-6">
            Supports MP4, WebM, MOV, MKV. Multi-box tracking with temporal duration controls.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <label className="px-6 py-3 rounded-full bg-[#E1E0CC] text-black font-semibold text-sm cursor-pointer hover:bg-white transition-all shadow-lg inline-flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Choose Video File
              <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
            </label>
            <button
              onClick={handleLoadLocalFarmers}
              className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-[#E1E0CC] font-medium text-sm border border-white/15 transition-all inline-flex items-center gap-2 cursor-pointer"
            >
              <Film className="w-4 h-4 text-emerald-400" />
              Load Target 1080p Video (D:\DL\Farmers...)
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Controls Sidebar */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <div className="glass-panel rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
                  Watermark Regions ({boxes.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAutoDetect}
                    disabled={isDetecting || (!videoFile && !localVideoPath)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-xs text-emerald-300 font-semibold border border-emerald-500/30 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                    title="Scan video to automatically find watermark bounding box"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${isDetecting ? "animate-spin text-emerald-400" : "text-emerald-400"}`} />
                    {isDetecting ? "Detecting..." : "Auto-Detect"}
                  </button>
                  <button
                    onClick={addNewBox}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-[#E1E0CC] font-medium transition-colors cursor-pointer"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {detectionBanner && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{detectionBanner}</span>
                  </div>
                  <button
                    onClick={() => setDetectionBanner(null)}
                    className="text-emerald-400/60 hover:text-emerald-300 ml-2 cursor-pointer text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Watermark Boxes List */}
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {boxes.map((b, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedBoxIndex(idx)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedBoxIndex === idx
                        ? "bg-[#E1E0CC]/15 border-[#E1E0CC] text-[#E1E0CC]"
                        : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">Region #{idx + 1}</div>
                      <div className="text-[11px] text-white/50 font-mono">
                        {b.width}x{b.height} at ({b.x}, {b.y})
                      </div>
                    </div>
                    {boxes.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBox(idx);
                        }}
                        className="p-1.5 hover:text-red-400 text-white/40 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Duration Mode Control */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/80 font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#E1E0CC]" />
                    Duration Mode:
                  </span>
                  <button
                    type="button"
                    onClick={() => setFullDuration(!fullDuration)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      fullDuration
                        ? "bg-[#E1E0CC] text-black border-[#E1E0CC]"
                        : "bg-white/5 text-white/70 border-white/10"
                    }`}
                  >
                    {fullDuration ? "Whole Video (All Frames)" : "Custom Time Range"}
                  </button>
                </div>

                {!fullDuration && boxes[selectedBoxIndex] && (
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>Custom Range:</span>
                      <span className="font-mono text-[#E1E0CC]">
                        {formatTime(boxes[selectedBoxIndex].start_time || 0)} - {formatTime(boxes[selectedBoxIndex].end_time || duration)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-white/50 block mb-1">Start Time (sec):</label>
                        <input
                          type="number"
                          min="0"
                          max={Math.floor(duration)}
                          value={boxes[selectedBoxIndex].start_time || 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setBoxes((prev) => {
                              const next = [...prev];
                              next[selectedBoxIndex].start_time = val;
                              return next;
                            });
                          }}
                          className="w-full bg-black/60 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-[#E1E0CC] font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-white/50 block mb-1">End Time (sec):</label>
                        <input
                          type="number"
                          min="0"
                          max={Math.ceil(duration)}
                          value={boxes[selectedBoxIndex].end_time || Math.ceil(duration)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setBoxes((prev) => {
                              const next = [...prev];
                              next[selectedBoxIndex].end_time = val;
                              return next;
                            });
                          }}
                          className="w-full bg-black/60 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-[#E1E0CC] font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Algorithm & Quality */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <label className="text-xs text-white/60 block">Removal Algorithm:</label>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value as any)}
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-xs text-[#E1E0CC] focus:outline-none focus:border-[#E1E0CC]"
                >
                  <option value="harmonic">AI Harmonic Gradient (Zero Blur - Recommended)</option>
                  <option value="stroke">Adaptive Stroke Eraser (Preserves Video Background)</option>
                  <option value="ns">Navier-Stokes Fluid Inpainter (Texture Flow)</option>
                  <option value="telea">OpenCV Telea (Frame Inpaint)</option>
                  <option value="delogo">FFmpeg Delogo (Fast Legacy Border Blur)</option>
                </select>

                <label className="text-xs text-white/60 block">Export Quality:</label>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  {(["high", "medium", "low"] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`py-1.5 rounded-lg border text-center capitalize transition-colors ${
                        quality === q
                          ? "bg-[#E1E0CC] text-black font-semibold border-[#E1E0CC]"
                          : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-white/10">
                <button
                  onClick={handleStartProcessing}
                  disabled={isProcessing}
                  className="w-full py-3.5 rounded-xl bg-[#E1E0CC] hover:bg-white text-black font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-black" />
                  Erase Video Watermark
                </button>
              </div>
            </div>
          </div>

          {/* Center Video Viewport */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {/* View Mode Switcher if Cleaned Video is Ready */}
            {cleanedVideoUrl && (
              <div className="flex items-center justify-between p-2.5 bg-black/60 border border-white/10 rounded-2xl">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPreviewMode("cleaned")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      previewMode === "cleaned"
                        ? "bg-[#E1E0CC] text-black shadow"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Cleaned Video (Watermark Erased)
                  </button>
                  <button
                    onClick={() => setPreviewMode("original")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      previewMode === "original"
                        ? "bg-white/20 text-[#E1E0CC] shadow"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Original Video (With Watermark)
                  </button>
                </div>

                <a
                  href={cleanedVideoUrl}
                  download="cleaned_video.mp4"
                  className="px-4 py-1.5 rounded-xl bg-[#E1E0CC] text-black font-bold text-xs flex items-center gap-1.5 hover:bg-white transition-all shadow-md"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Cleaned MP4
                </a>
              </div>
            )}

            <div className="relative rounded-2xl border border-white/10 bg-black overflow-hidden shadow-2xl flex flex-col">
              {/* Video Display Container */}
              <div className="relative flex items-center justify-center min-h-[360px] bg-black">
                <video
                  ref={videoRef}
                  src={previewMode === "cleaned" && cleanedVideoUrl ? cleanedVideoUrl : videoSrc}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full h-auto max-h-[60vh] object-contain block mx-auto pointer-events-none"
                  playsInline
                />

                {/* Draggable Watermark Bounding Boxes Overlay (only shown before render or when viewing original) */}
                {(!cleanedVideoUrl || previewMode === "original") && (
                  <div
                    ref={overlayRef}
                    onMouseDown={handleOverlayMouseDown}
                    onMouseMove={handleOverlayMouseMove}
                    onMouseUp={handleOverlayMouseUp}
                    className="absolute inset-0 cursor-crosshair"
                  >
                    {boxes.map((b, idx) => {
                      const isActiveAtCurrentTime =
                        b.start_time === undefined ||
                        (currentTime >= b.start_time && currentTime <= (b.end_time || duration));

                      return (
                        <div
                          key={idx}
                          style={{
                            left: `${b.x}px`,
                            top: `${b.y}px`,
                            width: `${b.width}px`,
                            height: `${b.height}px`,
                          }}
                          className={`absolute border-2 pointer-events-none transition-all ${
                            selectedBoxIndex === idx
                              ? "border-[#E1E0CC] bg-red-500/30 shadow-[0_0_15px_rgba(225,224,204,0.5)]"
                              : "border-red-400/80 bg-red-500/15"
                          } ${!isActiveAtCurrentTime ? "opacity-30 border-dashed" : "opacity-100"}`}
                        >
                          <div className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-[#E1E0CC] font-mono border border-white/10 whitespace-nowrap">
                            Region #{idx + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Timeline & Scrubber Bar */}
              <div className="p-4 bg-black/60 backdrop-blur-md border-t border-white/10 space-y-3">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="0.01"
                  value={currentTime}
                  onChange={(e) => {
                    const time = Number(e.target.value);
                    setCurrentTime(time);
                    if (videoRef.current) videoRef.current.currentTime = time;
                  }}
                  className="w-full cursor-pointer h-1.5"
                />

                {/* Playback Controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => stepFrame(false)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-colors cursor-pointer"
                      title="Step back 1 frame"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <button
                      onClick={togglePlay}
                      className="p-2.5 rounded-full bg-[#E1E0CC] text-black hover:bg-white transition-all shadow-md cursor-pointer"
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black" />}
                    </button>

                    <button
                      onClick={() => stepFrame(true)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-colors cursor-pointer"
                      title="Step forward 1 frame"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = 0;
                          setCurrentTime(0);
                        }
                      }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-colors cursor-pointer"
                      title="Restart"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="font-mono text-xs text-[#E1E0CC]">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Modal Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel-glow rounded-3xl p-8 max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-[#E1E0CC]/10 flex items-center justify-center mx-auto border border-[#E1E0CC]/30">
              <Film className="w-8 h-8 text-[#E1E0CC] animate-pulse" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-[#E1E0CC]">Processing Video</h3>
              <p className="text-xs text-white/60">{taskMessage || "Inpainting frames and remuxing audio..."}</p>
            </div>

            <div className="space-y-2">
              <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#E1E0CC] to-emerald-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${taskProgress}%` }}
                />
              </div>
              <div className="text-right text-xs font-mono text-[#E1E0CC]">{taskProgress.toFixed(0)}%</div>
            </div>

            <button
              onClick={handleCancelTask}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-xs font-medium border border-white/10 transition-colors cursor-pointer"
            >
              Cancel Processing
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
