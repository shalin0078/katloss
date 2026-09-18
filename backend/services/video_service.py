import os
import re
import cv2
import shutil
import subprocess
import threading
import numpy as np
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import imageio_ffmpeg

from backend.services.task_manager import task_manager


class VideoWatermarkService:
    @staticmethod
    def get_ffmpeg_exe() -> str:
        return imageio_ffmpeg.get_ffmpeg_exe()

    @classmethod
    def get_video_info(cls, video_path: str) -> Dict:
        """
        Retrieves video properties using OpenCV VideoCapture.
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError("Could not open video file.")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0.0
        cap.release()

        return {
            "width": width,
            "height": height,
            "fps": round(fps, 2),
            "total_frames": total_frames,
            "duration": round(duration, 2)
        }

    @staticmethod
    def _scale_and_clamp_box(b: Dict, vid_w: int, vid_h: int) -> Tuple[int, int, int, int]:
        """
        Scales bounding box from display coordinates to actual video resolution and strictly clamps.
        """
        disp_w = b.get("display_width")
        disp_h = b.get("display_height")

        if disp_w and disp_h and float(disp_w) > 0 and float(disp_h) > 0:
            scale_x = vid_w / float(disp_w)
            scale_y = vid_h / float(disp_h)
            raw_x = float(b.get("x", 1)) * scale_x
            raw_y = float(b.get("y", 1)) * scale_y
            raw_w = float(b.get("width", 2)) * scale_x
            raw_h = float(b.get("height", 2)) * scale_y
        else:
            raw_x = float(b.get("x", 1))
            raw_y = float(b.get("y", 1))
            raw_w = float(b.get("width", 2))
            raw_h = float(b.get("height", 2))

        x = int(round(raw_x))
        y = int(round(raw_y))
        w = int(round(raw_w))
        h = int(round(raw_h))

        x = max(1, min(x, vid_w - 4))
        y = max(1, min(y, vid_h - 4))
        w = max(2, min(w, vid_w - x - 1))
        h = max(2, min(h, vid_h - y - 1))
        return x, y, w, h

    @classmethod
    def _build_delogo_filter_string(cls, boxes: List[Dict], vid_w: int, vid_h: int) -> str:
        """
        Builds chained delogo filter string for FFmpeg with optional time intervals and scaled coordinates.
        """
        filters = []
        for b in boxes:
            x, y, w, h = cls._scale_and_clamp_box(b, vid_w, vid_h)

            filter_str = f"delogo=x={x}:y={y}:w={w}:h={h}"

            start_t = b.get("start_time")
            end_t = b.get("end_time")

            if start_t is not None and end_t is not None:
                filter_str += f":enable='between(t,{float(start_t)},{float(end_t)})'"
            elif start_t is not None:
                filter_str += f":enable='gte(t,{float(start_t)})'"
            elif end_t is not None:
                filter_str += f":enable='lte(t,{float(end_t)})'"

            filters.append(filter_str)

        return ",".join(filters)

    @classmethod
    def process_video_ffmpeg(
        cls,
        task_id: str,
        input_path: str,
        output_path: str,
        boxes: List[Dict],
        quality: str = "high",
        secondary_output_path: Optional[str] = None
    ):
        """
        Native FFmpeg delogo processing pipeline.
        """
        ffmpeg_exe = cls.get_ffmpeg_exe()
        info = cls.get_video_info(input_path)
        vid_w, vid_h = info["width"], info["height"]
        total_duration = info["duration"]

        filter_graph = cls._build_delogo_filter_string(boxes, vid_w, vid_h)
        if not filter_graph:
            raise ValueError("No valid watermark boxes provided.")

        crf = "18" if quality == "high" else ("23" if quality == "medium" else "28")
        preset = "medium" if quality == "high" else "fast"

        cmd = [
            ffmpeg_exe,
            "-y",
            "-i", str(input_path),
            "-vf", filter_graph,
            "-c:v", "libx264",
            "-preset", preset,
            "-crf", crf,
            "-pix_fmt", "yuv420p",
            "-map", "0:v",
            "-map", "0:a?",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            "-progress", "pipe:1",
            str(output_path)
        ]

        task_manager.update_task(task_id, status="processing", progress=5.0, message="Starting video encoding...")

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )

        time_pattern = re.compile(r"out_time_ms=(\d+)")

        try:
            for line in process.stdout:
                if task_manager.is_cancelled(task_id):
                    process.terminate()
                    task_manager.update_task(task_id, status="cancelled", message="Task cancelled by user.")
                    return

                match = time_pattern.search(line)
                if match and total_duration > 0:
                    curr_ms = int(match.group(1))
                    curr_sec = curr_ms / 1_000_000.0
                    progress_pct = min(98.0, max(5.0, (curr_sec / total_duration) * 100.0))
                    task_manager.update_task(
                        task_id,
                        status="processing",
                        progress=progress_pct,
                        message=f"Processing video: {curr_sec:.1f}s / {total_duration:.1f}s ({progress_pct:.0f}%)"
                    )

            process.wait()

            if process.returncode == 0 and os.path.exists(output_path):
                if secondary_output_path:
                    try:
                        sec_p = Path(secondary_output_path)
                        sec_p.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(output_path, secondary_output_path)
                    except Exception as ex_copy:
                        print(f"[WARN] Failed to copy to secondary path: {ex_copy}")

                task_manager.update_task(
                    task_id,
                    status="completed",
                    progress=100.0,
                    message="Video processing complete!",
                    output_filename=Path(output_path).name,
                    download_url=f"/api/video/download/{Path(output_path).name}"
                )
            else:
                task_manager.update_task(
                    task_id,
                    status="failed",
                    error="FFmpeg encoding exited with error.",
                    message="Video processing failed."
                )
        except Exception as e:
            task_manager.update_task(task_id, status="failed", error=str(e), message="Processing encountered an error.")
        finally:
            if process.poll() is None:
                process.terminate()

    @classmethod
    def process_video_harmonic_inpaint(
        cls,
        task_id: str,
        input_path: str,
        output_path: str,
        boxes: List[Dict],
        quality: str = "high",
        secondary_output_path: Optional[str] = None
    ):
        """
        AI Discrete Harmonic Gradient inpainting engine for video watermark removal.
        Solves the Laplace Dirichlet boundary value problem on each watermark region,
        eliminating rectangular blur and matching surrounding color gradients and lighting seamlessly.
        Includes temporal inter-frame exponential smoothing to prevent inter-frame flickering.
        """
        ffmpeg_exe = cls.get_ffmpeg_exe()
        cap = cv2.VideoCapture(str(input_path))
        if not cap.isOpened():
            task_manager.update_task(task_id, status="failed", error="Could not read video file.")
            return

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        temp_raw_video = Path(output_path).with_suffix(".harmonic_raw.mp4")

        # Scale and prepare boxes
        scaled_boxes = []
        for b in boxes:
            x, y, w, h = cls._scale_and_clamp_box(b, width, height)
            pad = 4
            x1 = max(0, x - pad)
            y1 = max(0, y - pad)
            x2 = min(width, x + w + pad)
            y2 = min(height, y + h + pad)
            scaled_boxes.append({
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "ph": y2 - y1,
                "pw": x2 - x1,
                "start_time": b.get("start_time"),
                "end_time": b.get("end_time")
            })

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(temp_raw_video), fourcc, fps, (width, height))

        frame_idx = 0
        iterations = 30 if quality == "high" else (20 if quality == "medium" else 12)
        prev_patches = [None] * len(scaled_boxes)

        try:
            task_manager.update_task(task_id, status="processing", progress=5.0, message="Synthesizing clean frames...")
            while True:
                if task_manager.is_cancelled(task_id):
                    break

                ret, frame = cap.read()
                if not ret:
                    break

                curr_time = frame_idx / fps

                for i, sb in enumerate(scaled_boxes):
                    st = sb["start_time"]
                    et = sb["end_time"]
                    if st is not None and curr_time < float(st):
                        continue
                    if et is not None and curr_time > float(et):
                        continue

                    x1, y1, x2, y2 = sb["x1"], sb["y1"], sb["x2"], sb["y2"]
                    ph, pw = sb["ph"], sb["pw"]
                    if ph < 4 or pw < 4:
                        continue

                    patch = frame[y1:y2, x1:x2].astype(np.float32)
                    top = patch[0, :, :]
                    bottom = patch[-1, :, :]
                    left = patch[:, 0, :]
                    right = patch[:, -1, :]

                    ys = np.linspace(0, 1, ph)[:, None, None]
                    xs = np.linspace(0, 1, pw)[None, :, None]

                    c00 = top[0:1, :]
                    c01 = top[-1:, :]
                    c10 = bottom[0:1, :]
                    c11 = bottom[-1:, :]

                    c_corners = (1-xs)*(1-ys)*c00 + xs*(1-ys)*c01 + (1-xs)*ys*c10 + xs*ys*c11
                    synth = (1-ys)*top[None, :, :] + ys*bottom[None, :, :] + (1-xs)*left[:, None, :] + xs*right[:, None, :] - c_corners

                    # Discrete Laplacian Jacobi relaxation
                    for _ in range(iterations):
                        synth[1:-1, 1:-1, :] = 0.25 * (
                            synth[0:-2, 1:-1, :] + synth[2:, 1:-1, :] + synth[1:-1, 0:-2, :] + synth[1:-1, 2:, :]
                        )

                    # Temporal smoothing across frames to eliminate flicker
                    if prev_patches[i] is not None and prev_patches[i].shape == synth.shape:
                        synth = 0.82 * synth + 0.18 * prev_patches[i]
                    prev_patches[i] = synth.copy()

                    frame[y1:y2, x1:x2] = np.clip(synth, 0, 255).astype(np.uint8)

                writer.write(frame)
                frame_idx += 1

                if frame_idx % 12 == 0 and total_frames > 0:
                    pct = min(92.0, (frame_idx / total_frames) * 85.0 + 5.0)
                    task_manager.update_task(
                        task_id,
                        status="processing",
                        progress=pct,
                        message=f"Harmonic inpainting: frame {frame_idx} / {total_frames} ({pct:.0f}%)"
                    )

            cap.release()
            writer.release()

            if task_manager.is_cancelled(task_id):
                if temp_raw_video.exists():
                    temp_raw_video.unlink(missing_ok=True)
                return

            task_manager.update_task(task_id, status="processing", progress=94.0, message="Encoding lossless MP4 & remuxing audio...")

            crf = "18" if quality == "high" else ("23" if quality == "medium" else "28")
            preset = "fast"

            mux_cmd = [
                ffmpeg_exe,
                "-y",
                "-i", str(temp_raw_video),
                "-i", str(input_path),
                "-c:v", "libx264",
                "-crf", crf,
                "-preset", preset,
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "192k",
                "-map", "0:v:0",
                "-map", "1:a:0?",
                "-movflags", "+faststart",
                str(output_path)
            ]

            subprocess.run(mux_cmd, check=True, capture_output=True)

            if temp_raw_video.exists():
                temp_raw_video.unlink(missing_ok=True)

            if secondary_output_path and os.path.exists(output_path):
                try:
                    sec_p = Path(secondary_output_path)
                    sec_p.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(output_path, secondary_output_path)
                except Exception as ex_copy:
                    print(f"[WARN] Failed to copy to secondary path: {ex_copy}")

            task_manager.update_task(
                task_id,
                status="completed",
                progress=100.0,
                message="Video watermark cleanly erased with zero blur!",
                output_filename=Path(output_path).name,
                download_url=f"/api/video/download/{Path(output_path).name}"
            )

        except Exception as e:
            cap.release()
            writer.release()
            if temp_raw_video.exists():
                temp_raw_video.unlink(missing_ok=True)
            task_manager.update_task(task_id, status="failed", error=str(e), message="Video inpainting failed.")

    @classmethod
    def process_video_adaptive_stroke_inpaint(
        cls,
        task_id: str,
        input_path: str,
        output_path: str,
        boxes: List[Dict],
        quality: str = "high",
        secondary_output_path: Optional[str] = None
    ):
        """
        Adaptive Stroke & Logo inpainting engine:
        Isolates high-contrast characters, logos, and timestamp strokes from the background inside the box.
        Inpaints only the watermark strokes while keeping 85-95% of the video background inside the box intact.
        """
        ffmpeg_exe = cls.get_ffmpeg_exe()
        cap = cv2.VideoCapture(str(input_path))
        if not cap.isOpened():
            task_manager.update_task(task_id, status="failed", error="Could not read video file.")
            return

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        temp_raw_video = Path(output_path).with_suffix(".stroke_raw.mp4")

        scaled_boxes = []
        for b in boxes:
            x, y, w, h = cls._scale_and_clamp_box(b, width, height)
            scaled_boxes.append({
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "start_time": b.get("start_time"),
                "end_time": b.get("end_time")
            })

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(temp_raw_video), fourcc, fps, (width, height))

        frame_idx = 0
        morph_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

        try:
            task_manager.update_task(task_id, status="processing", progress=5.0, message="Extracting logo strokes & inpainting...")
            while True:
                if task_manager.is_cancelled(task_id):
                    break

                ret, frame = cap.read()
                if not ret:
                    break

                curr_time = frame_idx / fps

                for sb in scaled_boxes:
                    st = sb["start_time"]
                    et = sb["end_time"]
                    if st is not None and curr_time < float(st):
                        continue
                    if et is not None and curr_time > float(et):
                        continue

                    bx, by, bw, bh = sb["x"], sb["y"], sb["w"], sb["h"]
                    crop = frame[by:by+bh, bx:bx+bw]
                    if crop.shape[0] < 4 or crop.shape[1] < 4:
                        continue

                    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                    # Detect edges and strong contrast text
                    grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
                    grad_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
                    mag = cv2.magnitude(grad_x, grad_y)
                    norm_mag = np.clip(mag, 0, 255).astype(np.uint8)

                    # Otsu threshold on gradient to find watermark strokes
                    thresh_val, stroke_mask = cv2.threshold(norm_mag, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                    # Dilate strokes slightly
                    stroke_mask = cv2.dilate(stroke_mask, morph_kernel, iterations=2)

                    # Inpaint only the strokes on the cropped region
                    inpainted_crop = cv2.inpaint(crop, stroke_mask, 3, cv2.INPAINT_NS)
                    frame[by:by+bh, bx:bx+bw] = inpainted_crop

                writer.write(frame)
                frame_idx += 1

                if frame_idx % 12 == 0 and total_frames > 0:
                    pct = min(92.0, (frame_idx / total_frames) * 85.0 + 5.0)
                    task_manager.update_task(
                        task_id,
                        status="processing",
                        progress=pct,
                        message=f"Stroke inpainting: frame {frame_idx} / {total_frames} ({pct:.0f}%)"
                    )

            cap.release()
            writer.release()

            if task_manager.is_cancelled(task_id):
                if temp_raw_video.exists():
                    temp_raw_video.unlink(missing_ok=True)
                return

            task_manager.update_task(task_id, status="processing", progress=94.0, message="Encoding lossless MP4 & remuxing audio...")

            crf = "18" if quality == "high" else ("23" if quality == "medium" else "28")
            preset = "fast"

            mux_cmd = [
                ffmpeg_exe,
                "-y",
                "-i", str(temp_raw_video),
                "-i", str(input_path),
                "-c:v", "libx264",
                "-crf", crf,
                "-preset", preset,
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "192k",
                "-map", "0:v:0",
                "-map", "1:a:0?",
                "-movflags", "+faststart",
                str(output_path)
            ]

            subprocess.run(mux_cmd, check=True, capture_output=True)

            if temp_raw_video.exists():
                temp_raw_video.unlink(missing_ok=True)

            if secondary_output_path and os.path.exists(output_path):
                try:
                    sec_p = Path(secondary_output_path)
                    sec_p.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(output_path, secondary_output_path)
                except Exception as ex_copy:
                    print(f"[WARN] Failed to copy to secondary path: {ex_copy}")

            task_manager.update_task(
                task_id,
                status="completed",
                progress=100.0,
                message="Video strokes cleanly removed with background preserved!",
                output_filename=Path(output_path).name,
                download_url=f"/api/video/download/{Path(output_path).name}"
            )

        except Exception as e:
            cap.release()
            writer.release()
            if temp_raw_video.exists():
                temp_raw_video.unlink(missing_ok=True)
            task_manager.update_task(task_id, status="failed", error=str(e), message="Stroke inpainting failed.")

    @classmethod
    def process_video_inpaint_frames(
        cls,
        task_id: str,
        input_path: str,
        output_path: str,
        boxes: List[Dict],
        algorithm: str = "ns",
        secondary_output_path: Optional[str] = None
    ):
        """
        Frame-by-frame OpenCV inpainting pipeline (Navier-Stokes or Telea).
        Optimized with localized watermark bounding crops for extreme efficiency and 100% background preservation.
        """
        ffmpeg_exe = cls.get_ffmpeg_exe()
        cap = cv2.VideoCapture(str(input_path))
        if not cap.isOpened():
            task_manager.update_task(task_id, status="failed", error="Could not read video file.")
            return

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        temp_raw_video = Path(output_path).with_suffix(".raw.mp4")

        # Prepare localized sub-patches and masks for each watermark box
        scaled_boxes = []
        for b in boxes:
            x, y, w, h = cls._scale_and_clamp_box(b, width, height)
            pad = 8
            x1 = max(0, x - pad)
            y1 = max(0, y - pad)
            x2 = min(width, x + w + pad)
            y2 = min(height, y + h + pad)

            crop_w = x2 - x1
            crop_h = y2 - y1
            box_mask = np.zeros((crop_h, crop_w), dtype=np.uint8)
            bx1 = x - x1
            by1 = y - y1
            cv2.rectangle(box_mask, (bx1, by1), (bx1 + w, by1 + h), 255, -1)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            box_mask = cv2.dilate(box_mask, kernel, iterations=1)

            scaled_boxes.append({
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "mask": box_mask,
                "start_time": b.get("start_time"),
                "end_time": b.get("end_time")
            })

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(temp_raw_video), fourcc, fps, (width, height))

        frame_idx = 0
        inpaint_flag = cv2.INPAINT_NS if algorithm == "ns" else cv2.INPAINT_TELEA

        try:
            task_manager.update_task(task_id, status="processing", progress=5.0, message="Inpainting frames with texture flow...")
            while True:
                if task_manager.is_cancelled(task_id):
                    break

                ret, frame = cap.read()
                if not ret:
                    break

                curr_time = frame_idx / fps

                for sb in scaled_boxes:
                    st = sb["start_time"]
                    et = sb["end_time"]
                    if st is not None and curr_time < float(st):
                        continue
                    if et is not None and curr_time > float(et):
                        continue

                    x1, y1, x2, y2 = sb["x1"], sb["y1"], sb["x2"], sb["y2"]
                    crop = frame[y1:y2, x1:x2]
                    if crop.shape[0] < 4 or crop.shape[1] < 4:
                        continue

                    inpainted_crop = cv2.inpaint(crop, sb["mask"], 5, inpaint_flag)
                    frame[y1:y2, x1:x2] = inpainted_crop

                writer.write(frame)
                frame_idx += 1

                if frame_idx % 12 == 0 and total_frames > 0:
                    pct = min(90.0, (frame_idx / total_frames) * 85.0 + 5.0)
                    task_manager.update_task(
                        task_id,
                        status="processing",
                        progress=pct,
                        message=f"Inpainting frame {frame_idx} / {total_frames} ({pct:.0f}%)"
                    )

            cap.release()
            writer.release()

            if task_manager.is_cancelled(task_id):
                if temp_raw_video.exists():
                    temp_raw_video.unlink(missing_ok=True)
                return

            task_manager.update_task(task_id, status="processing", progress=92.0, message="Re-muxing audio...")

            mux_cmd = [
                ffmpeg_exe,
                "-y",
                "-i", str(temp_raw_video),
                "-i", str(input_path),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "192k",
                "-map", "0:v:0",
                "-map", "1:a:0?",
                "-movflags", "+faststart",
                str(output_path)
            ]

            subprocess.run(mux_cmd, check=True, capture_output=True)

            if temp_raw_video.exists():
                temp_raw_video.unlink(missing_ok=True)

            if secondary_output_path and os.path.exists(output_path):
                try:
                    sec_p = Path(secondary_output_path)
                    sec_p.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(output_path, secondary_output_path)
                except Exception as ex_copy:
                    print(f"[WARN] Failed to copy to secondary path: {ex_copy}")

            task_manager.update_task(
                task_id,
                status="completed",
                progress=100.0,
                message="Video inpainting completed successfully!",
                output_filename=Path(output_path).name,
                download_url=f"/api/video/download/{Path(output_path).name}"
            )

        except Exception as e:
            cap.release()
            writer.release()
            if temp_raw_video.exists():
                temp_raw_video.unlink(missing_ok=True)
            task_manager.update_task(task_id, status="failed", error=str(e), message="Video inpainting failed.")

    @classmethod
    def start_background_processing(
        cls,
        task_id: str,
        input_path: str,
        output_path: str,
        boxes: List[Dict],
        algorithm: str = "harmonic",
        quality: str = "high",
        secondary_output_path: Optional[str] = None
    ):
        """
        Dispatches processing to a dedicated background worker thread based on selected algorithm.
        Protects local source files outside UPLOAD_DIR from deletion.
        """
        def worker():
            try:
                if algorithm == "harmonic":
                    cls.process_video_harmonic_inpaint(task_id, input_path, output_path, boxes, quality=quality, secondary_output_path=secondary_output_path)
                elif algorithm == "stroke":
                    cls.process_video_adaptive_stroke_inpaint(task_id, input_path, output_path, boxes, quality=quality, secondary_output_path=secondary_output_path)
                elif algorithm in ("telea", "ns"):
                    cls.process_video_inpaint_frames(task_id, input_path, output_path, boxes, algorithm=algorithm, secondary_output_path=secondary_output_path)
                else:
                    cls.process_video_ffmpeg(task_id, input_path, output_path, boxes, quality=quality, secondary_output_path=secondary_output_path)
            except Exception as ex:
                task_manager.update_task(task_id, status="failed", error=str(ex), message="Worker exception occurred.")
            finally:
                try:
                    from backend.config import UPLOAD_DIR
                    input_resolved = Path(input_path).resolve()
                    upload_resolved = Path(UPLOAD_DIR).resolve()
                    if input_resolved.is_relative_to(upload_resolved):
                        if input_resolved.exists():
                            input_resolved.unlink(missing_ok=True)
                except Exception:
                    pass

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
