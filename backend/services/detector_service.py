import os
import cv2
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class WatermarkDetector:
    """
    AI Watermark Detector:
    Analyzes temporal edge persistence, structural symmetry, and contour solidity across video frames
    to automatically identify static logos, text stamps, channel badges, and AI watermarks.
    """

    @classmethod
    def detect_video_watermark(
        cls,
        video_path: str,
        num_samples: int = 16,
        zone_size_ratio: float = 0.28
    ) -> Dict:
        """
        Scans candidate perimeter regions across video frames and detects persistent watermark contours.
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        vid_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        vid_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 24.0

        if total_frames <= 0:
            cap.release()
            return {"detected": False, "boxes": [], "message": "Video has no frames"}

        # Sample frames uniformly across the video
        sample_count = min(num_samples, max(4, total_frames // 3))
        step = max(1, (total_frames - 6) // sample_count)
        sample_indices = [min(total_frames - 1, 3 + i * step) for i in range(sample_count)]

        frames = []
        for idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if ret and frame is not None:
                frames.append(frame)

        cap.release()

        if len(frames) < 3:
            return {"detected": False, "boxes": [], "message": "Could not sample sufficient frames"}

        # Define 4 candidate corner zones (where 98% of watermarks reside)
        zone_w = max(180, min(int(vid_w * zone_size_ratio), 360))
        zone_h = max(180, min(int(vid_h * zone_size_ratio), 360))

        candidate_zones = {
            "bottom_right": (vid_w - zone_w, vid_h - zone_h, zone_w, zone_h),
            "bottom_left": (0, vid_h - zone_h, zone_w, zone_h),
            "top_right": (vid_w - zone_w, 0, zone_w, zone_h),
            "top_left": (0, 0, zone_w, zone_h),
        }

        detected_candidates = []

        for zone_name, (zx, zy, zw, zh) in candidate_zones.items():
            patches = [f[zy:zy+zh, zx:zx+zw] for f in frames]
            grays = [cv2.cvtColor(p, cv2.COLOR_BGR2GRAY) for p in patches]

            # Canny edge detection
            edges = [cv2.Canny(g, 40, 140).astype(np.float32) for g in grays]

            # Mean edge map across time (stationary watermark borders persist with high mean)
            mean_edge = np.mean(edges, axis=0)

            # Test multiple sensitivity thresholds for watermark contour extraction
            for thresh_val in [140.0, 110.0, 90.0]:
                thresh = (mean_edge > thresh_val).astype(np.uint8) * 255

                # Morphological close to bridge adjacent letter/icon strokes
                close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
                closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, close_kernel)

                contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                for cnt in contours:
                    area = cv2.contourArea(cnt)
                    if area < 250 or area > (zw * zh * 0.5):
                        continue

                    bx, by, bw, bh = cv2.boundingRect(cnt)
                    if bw < 25 or bh < 20 or bw > (zw - 15) or bh > (zh - 15):
                        continue

                    aspect = float(bw) / float(bh)
                    if aspect < 0.35 or aspect > 6.0:
                        continue

                    hull = cv2.convexHull(cnt)
                    hull_area = cv2.contourArea(hull)
                    solidity = float(area) / float(hull_area + 1e-5)

                    # Watermarks (logos, text blocks, badges) have higher solidity than scattered leaves
                    if solidity < 0.45:
                        continue

                    # Check neighborhood around this contour for adjacent badge/logo elements (e.g. multi-star badges)
                    roi_margin = 30
                    roi_x1 = max(0, bx - roi_margin)
                    roi_y1 = max(0, by - roi_margin)
                    roi_x2 = min(zw, bx + bw + roi_margin)
                    roi_y2 = min(zh, by + bh + roi_margin)

                    roi_edge = mean_edge[roi_y1:roi_y2, roi_x1:roi_x2]
                    sub_thresh = (roi_edge > 14.0).astype(np.uint8) * 255
                    ys, xs = np.where(sub_thresh > 0)
                    if len(xs) > 30 and len(ys) > 30:
                        nb_bx = roi_x1 + int(np.min(xs))
                        nb_by = roi_y1 + int(np.min(ys))
                        nb_bw = int(np.max(xs) - np.min(xs) + 1)
                        nb_bh = int(np.max(ys) - np.min(ys) + 1)
                        if nb_bw <= 180 and nb_bh <= 160:
                            bx, by, bw, bh = nb_bx, nb_by, nb_bw, nb_bh

                    # Safety padding
                    pad = 8
                    px = max(0, bx - pad)
                    py = max(0, by - pad)
                    pw = min(zw - px, bw + pad * 2)
                    ph = min(zh - py, bh + pad * 2)

                    global_x = zx + px
                    global_y = zy + py

                    # Score based on solidity, area, and edge persistence
                    score = area * solidity * (1.0 + (thresh_val / 100.0))
                    confidence = min(0.99, round(0.70 + (solidity * 0.20) + min(0.09, area / 20000.0), 2))

                    detected_candidates.append({
                        "x": int(global_x),
                        "y": int(global_y),
                        "width": int(pw),
                        "height": int(ph),
                        "zone": zone_name,
                        "confidence": float(confidence),
                        "score": float(score),
                        "start_time": 0.0,
                        "end_time": round(total_frames / (fps or 24.0), 2),
                    })

                if detected_candidates:
                    break  # Found candidates at this threshold for this zone

        # Sort all detected candidates across all zones by score
        detected_candidates.sort(key=lambda c: c["score"], reverse=True)

        # De-duplicate overlapping boxes
        final_boxes = []
        for cand in detected_candidates:
            is_dup = False
            for fb in final_boxes:
                # Check overlap (IoU)
                ix = max(cand["x"], fb["x"])
                iy = max(cand["y"], fb["y"])
                iw = min(cand["x"] + cand["width"], fb["x"] + fb["width"]) - ix
                ih = min(cand["y"] + cand["height"], fb["y"] + fb["height"]) - iy
                if iw > 0 and ih > 0:
                    inter_area = iw * ih
                    union_area = (cand["width"] * cand["height"]) + (fb["width"] * fb["height"]) - inter_area
                    if (inter_area / (union_area + 1e-5)) > 0.4:
                        is_dup = True
                        break
            if not is_dup:
                final_boxes.append(cand)

        return {
            "detected": len(final_boxes) > 0,
            "boxes": final_boxes,
            "video_width": vid_w,
            "video_height": vid_h,
            "total_frames": total_frames,
            "fps": fps
        }
