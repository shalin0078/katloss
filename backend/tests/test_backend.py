import io
import os
import cv2
import time
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw

from backend.services.photo_service import PhotoInpaintService
from backend.services.video_service import VideoWatermarkService
from backend.services.task_manager import task_manager


def create_sample_photo() -> tuple[bytes, dict]:
    """
    Generates a 500x350 colorful test image with a visible watermark.
    """
    # Create image with smooth color gradient
    width, height = 500, 350
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img)

    for y in range(height):
        r = int(50 + 150 * (y / height))
        g = int(80 + 100 * (1 - y / height))
        b = int(120 + 130 * (y / height))
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Add a watermark box
    box = {"x": 120, "y": 140, "width": 260, "height": 60}
    draw.rectangle([box["x"], box["y"], box["x"] + box["width"], box["y"] + box["height"]], fill=(255, 255, 255))
    draw.text((box["x"] + 15, box["y"] + 20), "SAMPLE WATERMARK", fill=(20, 20, 20))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue(), box


def create_sample_video(output_path: str, duration_sec: int = 2, fps: int = 30):
    """
    Generates a small test MP4 video with a stationary watermark in the corner.
    """
    width, height = 320, 240
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    total_frames = duration_sec * fps
    for f in range(total_frames):
        # Background that changes slightly
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:, :, 0] = int(100 + 50 * np.sin(f / 10.0))
        frame[:, :, 1] = int(150 + 40 * np.cos(f / 10.0))
        frame[:, :, 2] = 200

        # Draw watermark in top-left
        cv2.rectangle(frame, (10, 10), (110, 40), (255, 255, 255), -1)
        cv2.putText(frame, "LOGO", (25, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

        writer.write(frame)

    writer.release()


def run_tests():
    print("========================================")
    print("[TEST] Running Katloss Studio Backend Tests")
    print("========================================")

    # 1. Test Photo Inpainting with Bounding Box
    print("\n[1/3] Testing Photo Inpainting with Bounding Box...")
    img_bytes, box = create_sample_photo()
    res_bytes, mime = PhotoInpaintService.inpaint(
        image_bytes=img_bytes,
        boxes=[box],
        algorithm="telea",
        radius=5,
        dilate_px=3,
        output_format="PNG"
    )
    assert len(res_bytes) > 0, "Photo inpainting returned empty bytes!"
    assert mime == "image/png", f"Expected image/png, got {mime}"
    
    # Verify result can be decoded
    out_pil = Image.open(io.BytesIO(res_bytes))
    assert out_pil.size == (500, 350), f"Unexpected dimensions {out_pil.size}"
    print(f"[OK] Photo inpainting (Telea) passed! Output size: {len(res_bytes)} bytes, dim: {out_pil.size}")

    # 2. Test Photo Inpainting with Navier-Stokes
    print("\n[2/3] Testing Photo Inpainting with Navier-Stokes...")
    res_ns, mime_ns = PhotoInpaintService.inpaint(
        image_bytes=img_bytes,
        boxes=[box],
        algorithm="ns",
        radius=5,
        dilate_px=3
    )
    assert len(res_ns) > 0, "Navier-Stokes returned empty bytes!"
    print("[OK] Photo inpainting (Navier-Stokes) passed!")

    # 3. Test Video Delogo Processing
    print("\n[3/3] Testing Video Watermark Removal (FFmpeg Delogo)...")
    test_dir = Path(__file__).resolve().parent / "test_media"
    test_dir.mkdir(parents=True, exist_ok=True)
    input_video = test_dir / "sample_watermark.mp4"
    output_video = test_dir / "cleaned_video.mp4"

    create_sample_video(str(input_video), duration_sec=2, fps=25)
    assert input_video.exists(), "Sample video was not created!"

    task_id = task_manager.create_task("Test video processing")
    boxes = [{"x": 10, "y": 10, "width": 100, "height": 30, "start_time": 0.0, "end_time": 2.0}]

    VideoWatermarkService.process_video_ffmpeg(
        task_id=task_id,
        input_path=str(input_video),
        output_path=str(output_video),
        boxes=boxes,
        quality="medium"
    )

    task_status = task_manager.get_task(task_id)
    print(f"Task status result: {task_status.get('status')}, progress: {task_status.get('progress')}%")
    assert task_status.get("status") == "completed", f"Video processing failed: {task_status.get('error')}"
    assert output_video.exists() and output_video.stat().st_size > 0, "Cleaned video file does not exist or is empty!"

    # Verify output video properties
    info = VideoWatermarkService.get_video_info(str(output_video))
    print(f"Cleaned video properties: {info}")
    assert info["width"] == 320 and info["height"] == 240, "Video resolution mismatch!"
    print("[OK] Video watermark removal passed!")

    print("\n========================================")
    print("[SUCCESS] ALL KATLOSS BACKEND TESTS PASSED!")
    print("========================================")


if __name__ == "__main__":
    run_tests()
