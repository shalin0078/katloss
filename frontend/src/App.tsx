import { useState, useRef } from "react";
import { PrismaHero } from "@/components/ui/prisma-hero";
import { PhotoStudio } from "@/components/studio/PhotoStudio";
import { VideoStudio } from "@/components/studio/VideoStudio";
import {
  Image,
  Video,
  Sparkles,
  Shield,
  Cpu,
  Zap,
  UploadCloud,
  Crop,
  DownloadCloud,
} from "lucide-react";

export function App() {
  const [activeTab, setActiveTab] = useState<"photo" | "video">("photo");
  const studioRef = useRef<HTMLDivElement>(null);

  const scrollToStudio = (tab?: "photo" | "video") => {
    if (tab) setActiveTab(tab);
    studioRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-[#E1E0CC] flex flex-col selection:bg-[#E1E0CC] selection:text-black">
      {/* Top Floating Application Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/50 border-b border-white/10 px-6 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#E1E0CC] flex items-center justify-center text-black font-extrabold text-lg shadow-lg">
              K
            </div>
            <div>
              <span className="font-bold tracking-tight text-lg text-[#E1E0CC]">Katloss</span>
              <span className="text-xs text-white/50 block -mt-1 font-mono">STUDIO AI</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-white/70">
            <button
              onClick={() => scrollToStudio("photo")}
              className="hover:text-[#E1E0CC] transition-colors cursor-pointer"
            >
              Photo Eraser
            </button>
            <button
              onClick={() => scrollToStudio("video")}
              className="hover:text-[#E1E0CC] transition-colors cursor-pointer"
            >
              Video Eraser
            </button>
            <a href="#how-it-works" className="hover:text-[#E1E0CC] transition-colors">
              How It Works
            </a>
            <a href="#features" className="hover:text-[#E1E0CC] transition-colors">
              Features
            </a>
          </nav>

          {/* Primary Action Button */}
          <button
            onClick={() => scrollToStudio()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-[#E1E0CC] text-black hover:bg-white transition-all shadow-md cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Launch Studio
          </button>
        </div>
      </header>

      {/* Flagship Hero Component (Single, Cinematic Hero) */}
      <main className="flex-1">
        <PrismaHero
          title="Katloss"
          description="Katloss Studio is a next-generation AI media eraser engineered for visual artists, content creators, and filmmakers. Erase watermarks, logos, timestamps, and unwanted objects from photos and videos with pixel-level precision."
          ctaText="Open Eraser Studio"
          onCtaClick={() => scrollToStudio()}
          customNavItems={["Photo Eraser", "Video Eraser", "How It Works", "Features", "Specs"]}
        />

        {/* Unified Studio Workspace Section */}
        <section ref={studioRef} id="studio" className="py-16 px-4 max-w-7xl mx-auto w-full">
          {/* Studio Mode Selector Tabs */}
          <div className="flex items-center justify-center mb-8">
            <div className="inline-flex items-center gap-1.5 p-1.5 bg-black/60 rounded-2xl border border-white/15 backdrop-blur-xl shadow-xl">
              <button
                onClick={() => setActiveTab("photo")}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "photo"
                    ? "bg-[#E1E0CC] text-black shadow-lg"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <Image className="w-4 h-4" />
                Photo Watermark Eraser
              </button>

              <button
                onClick={() => setActiveTab("video")}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "video"
                    ? "bg-[#E1E0CC] text-black shadow-lg"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <Video className="w-4 h-4" />
                Video Watermark Eraser
              </button>
            </div>
          </div>

          {/* Active Studio View */}
          <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden shadow-2xl p-2 md:p-6">
            {activeTab === "photo" ? <PhotoStudio /> : <VideoStudio />}
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-20 px-6 border-t border-white/10 bg-black/60">
          <div className="max-w-7xl mx-auto space-y-12">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#E1E0CC]/10 text-[#E1E0CC] border border-[#E1E0CC]/20">
                Simple 3-Step Process
              </span>
              <h3 className="text-3xl md:text-4xl font-extrabold text-[#E1E0CC]">
                How Katloss Erases Watermarks
              </h3>
              <p className="text-sm text-white/60">
                Effortless, non-destructive watermark removal designed to keep your media sharp and lossless.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Step 1 */}
              <div className="glass-panel p-8 rounded-3xl space-y-4 border border-white/10 hover:border-[#E1E0CC]/30 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-[#E1E0CC]/10 flex items-center justify-center text-[#E1E0CC] font-mono font-bold text-lg border border-[#E1E0CC]/20">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="text-xs font-mono text-[#E1E0CC]/60 uppercase tracking-wider">Step 01</div>
                <h4 className="text-lg font-bold text-[#E1E0CC]">Upload Your Media</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  Drag and drop any photo (PNG, JPEG, WEBP) or video (MP4, MOV, WebM, MKV). Files stay 100% private.
                </p>
              </div>

              {/* Step 2 */}
              <div className="glass-panel p-8 rounded-3xl space-y-4 border border-white/10 hover:border-[#E1E0CC]/30 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-[#E1E0CC]/10 flex items-center justify-center text-[#E1E0CC] font-mono font-bold text-lg border border-[#E1E0CC]/20">
                  <Crop className="w-6 h-6" />
                </div>
                <div className="text-xs font-mono text-[#E1E0CC]/60 uppercase tracking-wider">Step 02</div>
                <h4 className="text-lg font-bold text-[#E1E0CC]">Mark the Watermark</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  Use the Magic Brush, draw a bounding box, or tap 1-click corner presets. For videos, configure duration intervals.
                </p>
              </div>

              {/* Step 3 */}
              <div className="glass-panel p-8 rounded-3xl space-y-4 border border-white/10 hover:border-[#E1E0CC]/30 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-[#E1E0CC]/10 flex items-center justify-center text-[#E1E0CC] font-mono font-bold text-lg border border-[#E1E0CC]/20">
                  <DownloadCloud className="w-6 h-6" />
                </div>
                <div className="text-xs font-mono text-[#E1E0CC]/60 uppercase tracking-wider">Step 03</div>
                <h4 className="text-lg font-bold text-[#E1E0CC]">Lossless Export</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  AI inpainting seamlessly synthesizes the background. Download high-resolution media with synchronized audio intact.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section id="features" className="py-20 px-6 border-t border-white/10 bg-black/40">
          <div className="max-w-7xl mx-auto space-y-12">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#E1E0CC]/10 text-[#E1E0CC] border border-[#E1E0CC]/20">
                Core Engine Capabilities
              </span>
              <h3 className="text-3xl md:text-4xl font-extrabold text-[#E1E0CC]">
                Built for Precision and Privacy
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="glass-panel p-6 rounded-2xl space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#E1E0CC]/10 flex items-center justify-center text-[#E1E0CC] border border-[#E1E0CC]/20">
                  <Shield className="w-5 h-5" />
                </div>
                <h4 className="text-base font-bold text-[#E1E0CC]">100% Private In-Browser Mode</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  Process photos directly on your device with high-speed canvas inpainting without uploading data to external cloud servers.
                </p>
              </div>

              <div className="glass-panel p-6 rounded-2xl space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#E1E0CC]/10 flex items-center justify-center text-[#E1E0CC] border border-[#E1E0CC]/20">
                  <Cpu className="w-5 h-5" />
                </div>
                <h4 className="text-base font-bold text-[#E1E0CC]">Dual AI Engine Architecture</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  Combines OpenCV Telea and Navier-Stokes fluid boundary coherence on Python FastAPI with hardware-accelerated FFmpeg 7.1 video delogo filtering.
                </p>
              </div>

              <div className="glass-panel p-6 rounded-2xl space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#E1E0CC]/10 flex items-center justify-center text-[#E1E0CC] border border-[#E1E0CC]/20">
                  <Zap className="w-5 h-5" />
                </div>
                <h4 className="text-base font-bold text-[#E1E0CC]">Lossless Audio and Multi-Intervals</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  Preserve original audio tracks and isolate watermark appearances to specific time ranges (e.g., 00:02 to 00:08) so the rest of the clip stays pristine.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6 bg-black text-center text-xs text-white/40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#E1E0CC]">Katloss Studio</span>
            <span>— AI Photo & Video Watermark Remover</span>
          </div>
          <div>Obsidian & Prisma Design System • FastAPI & React 18</div>
        </div>
      </footer>
    </div>
  );
}

export default App;
