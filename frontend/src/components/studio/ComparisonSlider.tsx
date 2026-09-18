import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Image as ImageIcon } from "lucide-react";

interface ComparisonSliderProps {
  originalUrl: string;
  cleanedUrl: string;
  className?: string;
}

export const ComparisonSlider: React.FC<ComparisonSliderProps> = ({
  originalUrl,
  cleanedUrl,
  className = "",
}) => {
  const [sliderPos, setSliderPos] = useState<number>(50); // percentage 0 to 100
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPos(percentage);
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return;
      handleMove(e.touches[0].clientX);
    },
    [isDragging, handleMove]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      handleMove(e.clientX);
    },
    [isDragging, handleMove]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-2xl cursor-ew-resize ${className}`}
      onMouseDown={(e) => {
        setIsDragging(true);
        handleMove(e.clientX);
      }}
      onTouchStart={(e) => {
        setIsDragging(true);
        handleMove(e.touches[0].clientX);
      }}
    >
      {/* Cleaned image (Base full layer) */}
      <img
        src={cleanedUrl}
        alt="Cleaned without watermark"
        className="w-full h-auto max-h-[70vh] object-contain block mx-auto pointer-events-none"
      />

      {/* Original image (Clipped overlay) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ width: `${sliderPos}%` }}
      >
        <img
          src={originalUrl}
          alt="Original with watermark"
          className="w-full h-auto max-h-[70vh] object-contain block max-w-none"
          style={{
            width: containerRef.current?.clientWidth || "100%",
          }}
        />
      </div>

      {/* Divider Bar */}
      <div
        className="absolute top-0 bottom-0 w-[2px] bg-[#E1E0CC] shadow-[0_0_15px_rgba(225,224,204,0.8)] pointer-events-none"
        style={{ left: `${sliderPos}%` }}
      >
        {/* Handle grip badge */}
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-black border-2 border-[#E1E0CC] flex items-center justify-center shadow-lg">
          <div className="flex gap-[3px]">
            <div className="w-[2px] h-3 bg-[#E1E0CC] rounded-full" />
            <div className="w-[2px] h-3 bg-[#E1E0CC] rounded-full" />
          </div>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 pointer-events-none z-10">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-black/70 backdrop-blur-md text-[#E1E0CC]/80 border border-white/10">
          <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
          Original
        </span>
      </div>

      <div className="absolute top-3 right-3 pointer-events-none z-10">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-black/70 backdrop-blur-md text-[#E1E0CC] border border-[#E1E0CC]/30 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          Cleaned Result
        </span>
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-10">
        <span className="text-[11px] text-white/50 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/5">
          Drag slider left & right to compare
        </span>
      </div>
    </div>
  );
};
