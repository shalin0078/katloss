import json
import uuid
import aiofiles
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from backend.config import UPLOAD_DIR, OUTPUT_DIR, MAX_VIDEO_SIZE_MB, ALLOWED_VIDEO_EXTENSIONS
from backend.services.video_service import VideoWatermarkService
from backend.services.detector_service import WatermarkDetector
from backend.services.task_manager import task_manager

router = APIRouter(prefix="/api/video", tags=["Video Watermark Removal"])


@router.post("/info")
async def get_video_information(file: UploadFile = File(...)):
    """
    Returns duration, fps, resolution, and frame count of a video.
    """
    temp_id = str(uuid.uuid4())
    temp_path = UPLOAD_DIR / f"temp_{temp_id}_{file.filename}"

    try:
        async with aiofiles.open(temp_path, "wb") as out_file:
            content = await file.read()
            await out_file.write(content)

        info = VideoWatermarkService.get_video_info(str(temp_path))
        return JSONResponse({"success": True, "info": info})
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Failed to inspect video: {str(ex)}")
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


@router.post("/detect-watermark")
async def detect_video_watermark(
    file: Optional[UploadFile] = File(None, description="Uploaded video file"),
    video_path: Optional[str] = Form(None, description="Local path to video file on server or disk")
):
    """
    Scans video frames across candidate zones to detect persistent watermark contours automatically.
    Accepts either an uploaded file or a local file path.
    """
    if not file and not video_path:
        raise HTTPException(status_code=400, detail="Either 'file' or 'video_path' must be provided.")

    target_path = None
    is_temp = False

    try:
        if file:
            temp_id = str(uuid.uuid4())
            filename = file.filename or "video.mp4"
            target_path = UPLOAD_DIR / f"detect_{temp_id}_{filename}"
            is_temp = True
            async with aiofiles.open(target_path, "wb") as out_file:
                content = await file.read()
                await out_file.write(content)
        else:
            p = Path(video_path)
            if not p.exists() or not p.is_file():
                raise HTTPException(status_code=404, detail=f"Local video file not found: {video_path}")
            target_path = p

        result = WatermarkDetector.detect_video_watermark(str(target_path))
        return JSONResponse({"success": True, **result})
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Watermark detection failed: {str(ex)}")
    finally:
        if is_temp and target_path and target_path.exists():
            target_path.unlink(missing_ok=True)


@router.post("/remove")
async def remove_video_watermark(
    file: UploadFile = File(..., description="Original video file (MP4, WebM, MOV, etc.)"),
    boxes: str = Form(..., description="JSON array of watermark boxes: '[{\"x\":10,\"y\":10,\"width\":100,\"height\":50,\"start_time\":0,\"end_time\":10}]'"),
    algorithm: str = Form("harmonic", description="'harmonic', 'stroke', 'ns', 'telea', or 'delogo'"),
    quality: str = Form("high", description="'high', 'medium', or 'low'"),
):
    # Validate extension
    filename = file.filename or "video.mp4"
    ext = "." + filename.split(".")[-1].lower() if "." in filename else ".mp4"
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format '{ext}'. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}"
        )

    # Parse boxes
    try:
        parsed_boxes = json.loads(boxes)
        if not isinstance(parsed_boxes, list) or len(parsed_boxes) == 0:
            raise ValueError("At least one watermark box must be provided in the array.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid boxes JSON: {str(e)}")

    # Initialize task
    task_id = task_manager.create_task("Uploading and preparing video...")

    input_path = UPLOAD_DIR / f"{task_id}_{filename}"
    output_filename = f"cleaned_{task_id}.mp4"
    output_path = OUTPUT_DIR / output_filename

    # Save uploaded video
    try:
        async with aiofiles.open(input_path, "wb") as out_file:
            bytes_read = 0
            while content := await file.read(1024 * 1024):  # 1MB chunks
                bytes_read += len(content)
                if bytes_read > MAX_VIDEO_SIZE_MB * 1024 * 1024:
                    if input_path.exists():
                        input_path.unlink(missing_ok=True)
                    task_manager.update_task(task_id, status="failed", error=f"Video exceeds {MAX_VIDEO_SIZE_MB}MB limit.")
                    raise HTTPException(status_code=400, detail=f"Video exceeds maximum allowed size of {MAX_VIDEO_SIZE_MB}MB.")
                await out_file.write(content)
    except HTTPException:
        raise
    except Exception as ex:
        task_manager.update_task(task_id, status="failed", error=str(ex))
        raise HTTPException(status_code=500, detail=f"Failed to save video: {str(ex)}")

    # Launch background processing worker
    VideoWatermarkService.start_background_processing(
        task_id=task_id,
        input_path=str(input_path),
        output_path=str(output_path),
        boxes=parsed_boxes,
        algorithm=algorithm,
        quality=quality
    )

    return JSONResponse({
        "success": True,
        "task_id": task_id,
        "status": "queued",
        "message": "Video removal task initiated successfully."
    })


@router.post("/process-local")
async def process_local_video(
    video_path: str = Form(..., description="Absolute local path to the source video file (e.g. D:\\DL\\...)"),
    output_path: Optional[str] = Form(None, description="Optional destination path for a direct copy (e.g. D:\\DL\\...cleaned.mp4)"),
    boxes: Optional[str] = Form(None, description="Optional JSON array of boxes. If omitted, auto-detection runs automatically."),
    algorithm: str = Form("harmonic", description="'harmonic', 'stroke', 'ns', 'telea', or 'delogo'"),
    quality: str = Form("high", description="'high', 'medium', or 'low'"),
):
    """
    Processes a local video file with automatic watermark detection and lossless removal.
    Outputs to both Katloss storage outputs and optional secondary local destination.
    """
    src_file = Path(video_path)
    if not src_file.exists() or not src_file.is_file():
        raise HTTPException(status_code=404, detail=f"Local video file not found: {video_path}")

    # Parse boxes or auto-detect
    parsed_boxes = []
    if boxes:
        try:
            parsed_boxes = json.loads(boxes)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid boxes JSON: {str(e)}")

    if not parsed_boxes:
        # Run automatic detection
        detection = WatermarkDetector.detect_video_watermark(str(src_file))
        if not detection.get("detected") or not detection.get("boxes"):
            raise HTTPException(
                status_code=422,
                detail="No watermark could be automatically detected on this video. Please specify bounding box coordinates."
            )
        parsed_boxes = detection["boxes"]

    # Initialize task
    task_id = task_manager.create_task("Initializing local video processing...")

    output_filename = f"cleaned_{task_id}.mp4"
    server_output_path = OUTPUT_DIR / output_filename

    # If output_path is not specified, default to saving a cleaned version in the same folder as src_file
    dest_path = output_path
    if not dest_path:
        dest_name = src_file.stem + "_cleaned" + src_file.suffix
        dest_path = str(src_file.parent / dest_name)

    # Launch background processing worker
    VideoWatermarkService.start_background_processing(
        task_id=task_id,
        input_path=str(src_file),
        output_path=str(server_output_path),
        boxes=parsed_boxes,
        algorithm=algorithm,
        quality=quality,
        secondary_output_path=str(dest_path)
    )

    return JSONResponse({
        "success": True,
        "task_id": task_id,
        "status": "queued",
        "detected_boxes": parsed_boxes,
        "local_output_path": dest_path,
        "download_url": f"/api/video/download/{output_filename}",
        "message": f"Local video processing started. Output will be saved to '{dest_path}' and Katloss Studio."
    })


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """
    Polls the progress and status of a video processing task.
    """
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task ID not found.")
    return JSONResponse(task)


@router.post("/tasks/{task_id}/cancel")
async def cancel_video_task(task_id: str):
    """
    Cancels an ongoing video task.
    """
    success = task_manager.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found or already completed.")
    return JSONResponse({"success": True, "message": "Task cancellation requested."})


@router.get("/download/{filename}")
async def download_processed_video(filename: str):
    """
    Streams the finished cleaned video file for download or in-browser preview.
    """
    file_path = OUTPUT_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Requested video file does not exist.")

    return FileResponse(
        path=str(file_path),
        media_type="video/mp4",
        filename=filename,
        headers={"Accept-Ranges": "bytes"}
    )
