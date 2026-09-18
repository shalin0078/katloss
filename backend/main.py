import cv2
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import HOST, PORT, ALLOWED_IMAGE_EXTENSIONS, ALLOWED_VIDEO_EXTENSIONS
from backend.services.video_service import VideoWatermarkService
from backend.services.task_manager import task_manager
from backend.routers.photo import router as photo_router
from backend.routers.video import router as video_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    print("[KATLOSS] Studio Watermark Remover Backend starting...")
    try:
        ffmpeg_exe = VideoWatermarkService.get_ffmpeg_exe()
        print(f"[FFMPEG] Engine initialized: {ffmpeg_exe}")
    except Exception as e:
        print(f"[WARNING] FFmpeg warning: {e}")
    yield
    # Shutdown actions
    print("[KATLOSS] Studio Backend shutting down...")


app = FastAPI(
    title="Katloss Studio - Watermark Remover API",
    description="High-performance, content-aware inpainting engine for removing watermarks from photos and videos.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Sub-Routers
app.include_router(photo_router)
app.include_router(video_router)


@app.get("/")
@app.get("/api/health")
async def health_check():
    """
    Returns system status, active version, OpenCV version, and FFmpeg runtime details.
    """
    ffmpeg_available = False
    ffmpeg_path = None
    try:
        ffmpeg_path = VideoWatermarkService.get_ffmpeg_exe()
        ffmpeg_available = bool(ffmpeg_path)
    except Exception:
        pass

    return JSONResponse({
        "status": "online",
        "service": "Katloss Studio Inpainting Engine",
        "version": "1.0.0",
        "opencv_version": cv2.__version__,
        "ffmpeg_available": ffmpeg_available,
        "ffmpeg_path": ffmpeg_path,
        "supported_image_types": sorted(list(ALLOWED_IMAGE_EXTENSIONS)),
        "supported_video_types": sorted(list(ALLOWED_VIDEO_EXTENSIONS)),
        "features": [
            "photo_telea_inpaint",
            "photo_navier_stokes_inpaint",
            "photo_delogo_blur",
            "photo_custom_mask_painting",
            "photo_bounding_boxes",
            "video_delogo_ffmpeg",
            "video_frame_inpaint",
            "video_timeline_intervals",
            "lossless_audio_remux"
        ]
    })


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)
