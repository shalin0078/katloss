from typing import List, Optional
from pydantic import BaseModel, Field


class WatermarkBox(BaseModel):
    x: int = Field(..., description="X coordinate of top-left corner")
    y: int = Field(..., description="Y coordinate of top-left corner")
    width: int = Field(..., description="Width of watermark region")
    height: int = Field(..., description="Height of watermark region")
    start_time: Optional[float] = Field(None, description="Start time in seconds (for video)")
    end_time: Optional[float] = Field(None, description="End time in seconds (for video)")
    display_width: Optional[int] = Field(None, description="Client display viewport width when box was drawn")
    display_height: Optional[int] = Field(None, description="Client display viewport height when box was drawn")


class PhotoInpaintParams(BaseModel):
    algorithm: str = Field("telea", description="Inpainting algorithm: 'telea', 'ns', or 'blur'")
    radius: int = Field(5, description="Inpainting neighborhood radius in pixels")
    dilate: int = Field(2, description="Mask dilation size in pixels to avoid edge halos")


class VideoProcessParams(BaseModel):
    boxes: List[WatermarkBox] = Field(..., description="List of watermark boxes with optional time ranges")
    algorithm: str = Field("harmonic", description="Removal algorithm: 'harmonic', 'stroke', 'ns', 'telea', or 'delogo'")
    quality: str = Field("high", description="Output quality: 'high', 'medium', or 'low'")


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str = Field(..., description="'queued', 'processing', 'completed', 'failed', or 'cancelled'")
    progress: float = Field(0.0, description="Progress from 0.0 to 100.0")
    message: str
    download_url: Optional[str] = None
    output_filename: Optional[str] = None
    created_at: str
    error: Optional[str] = None


class SystemInfoResponse(BaseModel):
    status: str
    version: str
    ffmpeg_available: bool
    ffmpeg_path: Optional[str] = None
    supported_image_types: List[str]
    supported_video_types: List[str]
