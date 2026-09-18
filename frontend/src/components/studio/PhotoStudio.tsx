import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Paintbrush,
  Square,
  Eraser,
  RotateCcw,
  Sparkles,
  Download,
  Upload,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import confetti from "canvas-confetti";
import { KatlossAPI } from "@/services/api";
import type { WatermarkBox } from "@/services/api";
import { inpaintCanvasData } from "@/services/clientInpainter";
import { ComparisonSlider } from "./ComparisonSlider";
import { SAMPLE_IMAGES } from "@/data/samples";
import type { SampleImage } from "@/data/samples";

export const PhotoStudio: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [cleanedSrc, setCleanedSrc] = useState<string | null>(null);
  const [tool, setTool] = useState<"brush" | "rect" | "eraser">("brush");
  const [brushSize, setBrushSize] = useState<number>(32);
  const [algorithm, setAlgorithm] = useState<"telea" | "ns" | "blur">("telea");
  const [radius, setRadius] = useState<number>(5);
  const [dilate, setDilate] = useState<number>(2);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [boxes, setBoxes] = useState<WatermarkBox[]>([]);

  // Canvas Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  // Check Backend Health
  useEffect(() => {
    KatlossAPI.getHealth().then((res) => {
      setBackendOnline(res.status === "online");
    });
  }, []);

  // Initialize Canvas when image changes
  const initCanvasWithImage = useCallback((src: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageObjRef.current = img;
      const imgCanvas = imageCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      if (!imgCanvas || !maskCanvas) return;

      imgCanvas.width = img.naturalWidth;
      imgCanvas.height = img.naturalHeight;
      maskCanvas.width = img.naturalWidth;
      maskCanvas.height = img.naturalHeight;

      const imgCtx = imgCanvas.getContext("2d");
      const maskCtx = maskCanvas.getContext("2d");
      if (!imgCtx || !maskCtx) return;

      imgCtx.clearRect(0, 0, imgCanvas.width, imgCanvas.height);
      imgCtx.drawImage(img, 0, 0);

      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      setCleanedSrc(null);
      setBoxes([]);
    };
    img.src = src;
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    initCanvasWithImage(url);
  };

  const handleSelectSample = async (sample: SampleImage) => {
    setImageSrc(sample.url);
    setImageFile(null);
    initCanvasWithImage(sample.url);

    // Apply default watermark box
    setTimeout(() => {
      applyCornerPreset(sample.defaultBox);
    }, 300);
  };

  // Convert client mouse/touch coordinates to image canvas pixel space
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Mouse / Drawing Events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);
    isDrawingRef.current = true;
    startPosRef.current = coords;

    if (tool === "brush" || tool === "eraser") {
      drawBrush(coords.x, coords.y, false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const coords = getCanvasCoordinates(e);

    if (tool === "brush" || tool === "eraser") {
      drawBrush(coords.x, coords.y, true);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (tool === "rect" && startPosRef.current) {
      const endCoords = getCanvasCoordinates(e);
      const x = Math.min(startPosRef.current.x, endCoords.x);
      const y = Math.min(startPosRef.current.y, endCoords.y);
      const width = Math.abs(endCoords.x - startPosRef.current.x);
      const height = Math.abs(endCoords.y - startPosRef.current.y);

      if (width > 5 && height > 5) {
        drawRectMask(x, y, width, height);
      }
    }
    startPosRef.current = null;
  };

  const drawBrush = (x: number, y: number, isLine: boolean) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(255, 60, 60, 0.65)";
      ctx.strokeStyle = "rgba(255, 60, 60, 0.65)";
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (!isLine) {
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
    ctx.restore();
  };

  const drawRectMask = (x: number, y: number, width: number, height: number) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = "rgba(255, 60, 60, 0.65)";
    ctx.fillRect(x, y, width, height);
    ctx.restore();

    setBoxes((prev) => [...prev, { x, y, width, height }]);
  };

  const applyCornerPreset = (preset: { x: number; y: number; width: number; height: number }) => {
    drawRectMask(preset.x, preset.y, preset.width, preset.height);
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setBoxes([]);
    setCleanedSrc(null);
  };

  // Process Watermark Removal
  const handleRemoveWatermark = async () => {
    if (!imageCanvasRef.current || !maskCanvasRef.current) return;
    setIsProcessing(true);
    setStatusMessage("Analyzing watermark and inpainting background...");

    try {
      if (backendOnline) {
        // Prepare original file or blob
        let targetFile = imageFile;
        if (!targetFile) {
          const blob = await new Promise<Blob | null>((resolve) =>
            imageCanvasRef.current?.toBlob(resolve, "image/png")
          );
          if (!blob) throw new Error("Could not read canvas image");
          targetFile = new File([blob], "photo.png", { type: "image/png" });
        }

        // Get binary mask blob
        const maskBlob = await new Promise<Blob | null>((resolve) =>
          maskCanvasRef.current?.toBlob(resolve, "image/png")
        );
        if (!maskBlob) throw new Error("Could not read mask layer");

        const result = await KatlossAPI.removePhotoWatermark({
          file: targetFile,
          mask: maskBlob,
          boxes: boxes.length > 0 ? boxes : undefined,
          algorithm,
          radius,
          dilate,
        });

        setCleanedSrc(result.dataUrl);
      } else {
        // High-speed client-side inpainting fallback
        const workCanvas = document.createElement("canvas");
        workCanvas.width = imageCanvasRef.current.width;
        workCanvas.height = imageCanvasRef.current.height;
        const workCtx = workCanvas.getContext("2d");
        if (!workCtx) throw new Error("Canvas context failed");

        workCtx.drawImage(imageCanvasRef.current, 0, 0);
        inpaintCanvasData(workCtx, workCanvas.width, workCanvas.height, maskCanvasRef.current, radius);

        setCleanedSrc(workCanvas.toDataURL("image/png"));
      }

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#E1E0CC", "#10b981", "#6366f1"],
      });
      setStatusMessage("Watermark removed cleanly!");
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = (format: "png" | "jpeg" = "png") => {
    if (!cleanedSrc) return;
    const a = document.createElement("a");
    a.href = cleanedSrc;
    a.download = `cleaned_katloss_${Date.now()}.${format}`;
    a.click();
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#E1E0CC]/10 text-[#E1E0CC] border border-[#E1E0CC]/20">
              Photo Inpaint Suite
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                backendOnline
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${backendOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {backendOnline ? "AI Engine Online (FastAPI)" : "Edge Mode (In-Browser)"}
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mt-2 text-[#E1E0CC]">
            AI Photo Watermark Remover
          </h2>
          <p className="text-xs md:text-sm text-white/60">
            Paint over any watermark, text, stamp, or logo. Inpaint instantly without leaving trace edges.
          </p>
        </div>

        {/* Sample Selectors */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-white/50 font-medium whitespace-nowrap">Try Samples:</span>
          {SAMPLE_IMAGES.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSample(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-colors whitespace-nowrap cursor-pointer"
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main Workspace */}
      {!imageSrc ? (
        /* Upload Hero Zone */
        <div className="border-2 border-dashed border-white/20 rounded-3xl p-12 text-center bg-white/[0.02] hover:bg-white/[0.04] transition-all flex flex-col items-center justify-center min-h-[420px]">
          <div className="w-16 h-16 rounded-full bg-[#E1E0CC]/10 flex items-center justify-center text-[#E1E0CC] mb-4 border border-[#E1E0CC]/20">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-[#E1E0CC]">Upload photo to erase watermark</h3>
          <p className="text-sm text-white/50 max-w-md mt-1 mb-6">
            Supports PNG, JPEG, WEBP, AVIF with transparent alpha channel preservation.
          </p>
          <label className="px-6 py-3 rounded-full bg-[#E1E0CC] text-black font-semibold text-sm cursor-pointer hover:bg-white transition-all shadow-lg hover:shadow-[#E1E0CC]/20 inline-flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Choose Image File
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      ) : (
        /* Interactive Editor View */
        <div className="grid grid-cols-12 gap-6">
          {/* Left / Top Controls Toolbar */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <div className="glass-panel rounded-2xl p-5 space-y-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#E1E0CC]" />
                Selection Tools
              </h3>

              {/* Tool selector */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setTool("brush")}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    tool === "brush"
                      ? "bg-[#E1E0CC] text-black border-[#E1E0CC] shadow-md"
                      : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                  }`}
                >
                  <Paintbrush className="w-4 h-4" />
                  Brush
                </button>

                <button
                  onClick={() => setTool("rect")}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    tool === "rect"
                      ? "bg-[#E1E0CC] text-black border-[#E1E0CC] shadow-md"
                      : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                  }`}
                >
                  <Square className="w-4 h-4" />
                  Box
                </button>

                <button
                  onClick={() => setTool("eraser")}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    tool === "eraser"
                      ? "bg-[#E1E0CC] text-black border-[#E1E0CC] shadow-md"
                      : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                  }`}
                >
                  <Eraser className="w-4 h-4" />
                  Eraser
                </button>
              </div>

              {/* Brush Size Slider */}
              {tool !== "rect" && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-white/70">
                    <span>Brush Radius</span>
                    <span className="font-mono text-[#E1E0CC]">{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="6"
                    max="90"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
              )}

              {/* Quick Corner Presets */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <span className="text-xs text-white/60 block">1-Click Corner Presets:</span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <button
                    onClick={() => applyCornerPreset({ x: 30, y: 30, width: 160, height: 50 })}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80"
                  >
                    Top Left
                  </button>
                  <button
                    onClick={() => {
                      const w = imageCanvasRef.current?.width || 800;
                      applyCornerPreset({ x: w - 190, y: 30, width: 160, height: 50 });
                    }}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80"
                  >
                    Top Right
                  </button>
                  <button
                    onClick={() => {
                      const h = imageCanvasRef.current?.height || 600;
                      applyCornerPreset({ x: 30, y: h - 80, width: 160, height: 50 });
                    }}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80"
                  >
                    Bottom Left
                  </button>
                  <button
                    onClick={() => {
                      const w = imageCanvasRef.current?.width || 800;
                      const h = imageCanvasRef.current?.height || 600;
                      applyCornerPreset({ x: w - 190, y: h - 80, width: 160, height: 50 });
                    }}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80"
                  >
                    Bottom Right
                  </button>
                </div>
              </div>

              {/* Inpaint Algorithm Settings */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <label className="text-xs text-white/60 block">Inpaint Algorithm:</label>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value as any)}
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-xs text-[#E1E0CC] focus:outline-none focus:border-[#E1E0CC]"
                >
                  <option value="telea">Telea (Content-Aware, Recommended)</option>
                  <option value="ns">Navier-Stokes (Fluid Texture)</option>
                  <option value="blur">Delogo Blur (Glass/Translucent)</option>
                </select>

                <div className="flex justify-between text-xs text-white/70">
                  <span>Inpaint Radius</span>
                  <span className="font-mono text-[#E1E0CC]">{radius}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="15"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />

                <div className="flex justify-between text-xs text-white/70">
                  <span>Edge Dilation (Fix Halos)</span>
                  <span className="font-mono text-[#E1E0CC]">{dilate}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6"
                  value={dilate}
                  onChange={(e) => setDilate(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                {statusMessage && (
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-[11px] text-[#E1E0CC] text-center">
                    {statusMessage}
                  </div>
                )}
                <button
                  onClick={handleRemoveWatermark}
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl bg-[#E1E0CC] hover:bg-white text-black font-bold text-sm transition-all shadow-lg hover:shadow-[#E1E0CC]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Inpainting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-black" />
                      Erase Watermark
                    </>
                  )}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={clearMask}
                    className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium border border-white/10 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Clear Mask
                  </button>
                  <label className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium border border-white/10 flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center">
                    <Upload className="w-3.5 h-3.5" />
                    New Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Center Viewport */}
          <div className="col-span-12 lg:col-span-9 space-y-4">
            {cleanedSrc ? (
              /* Cleaned Comparison Slider */
              <div className="space-y-4">
                <ComparisonSlider originalUrl={imageSrc} cleanedUrl={cleanedSrc} />
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 glass-panel rounded-2xl">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Watermark removed successfully. Compare using slider above!
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCleanedSrc(null)}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/80"
                    >
                      Adjust Mask
                    </button>
                    <button
                      onClick={() => handleDownload("png")}
                      className="px-5 py-2 rounded-xl bg-[#E1E0CC] text-black font-semibold text-xs flex items-center gap-1.5 hover:bg-white transition-all shadow-md"
                    >
                      <Download className="w-4 h-4" />
                      Download PNG Lossless
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Interactive Canvas Area */
              <div
                ref={containerRef}
                className="relative select-none overflow-hidden rounded-2xl border border-white/10 bg-black/80 flex items-center justify-center min-h-[500px]"
              >
                {/* Base Image Canvas */}
                <canvas ref={imageCanvasRef} className="max-w-full max-h-[75vh] object-contain block mx-auto pointer-events-none" />

                {/* Mask Overlay Canvas */}
                <canvas
                  ref={maskCanvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  className="absolute inset-0 max-w-full max-h-[75vh] object-contain mx-auto cursor-crosshair"
                />

                {/* Instruction Badge */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
                  <span className="text-xs text-[#E1E0CC]/70 px-4 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 shadow-lg">
                    Paint red mask over the watermark to erase it
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
