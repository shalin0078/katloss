import os
import cv2
import json
import pytest
import numpy as np
from pathlib import Path
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.detector_service import WatermarkDetector

client = TestClient(app)


def find_target_farmers_video(cleaned: bool = False):
    dl_dir = Path("D:/DL")
    if dl_dir.exists():
        for f in dl_dir.iterdir():
            if "Farmers" in f.name and f.suffix == ".mp4":
                if cleaned and "cleaned" in f.name:
                    return str(f)
                elif not cleaned and "cleaned" not in f.name:
                    return str(f)
    return None


def test_detector_on_farmers_video():
    target_vid = find_target_farmers_video()
    if not target_vid:
        pytest.skip("Target Farmers video not found in D:\\DL")

    result = WatermarkDetector.detect_video_watermark(target_vid)
    assert result["detected"] is True, f"Failed to detect watermark in {target_vid}"
    assert len(result["boxes"]) >= 1, "Expected at least 1 detected box"

    top_box = result["boxes"][0]
    print(f"[TEST] Detected box: {top_box}")

    # Verify confidence and location
    assert top_box["confidence"] >= 0.90, f"Confidence {top_box['confidence']} < 0.90"
    assert top_box["zone"] == "bottom_right"

    # Box coordinates should be around (1698, 858, 84, 84) within reasonable tolerance
    assert 1650 <= top_box["x"] <= 1750
    assert 800 <= top_box["y"] <= 900
    assert 40 <= top_box["width"] <= 120
    assert 40 <= top_box["height"] <= 120
    assert top_box["start_time"] == 0.0
    assert top_box["end_time"] > 0.0


def test_api_detect_endpoint_local_path():
    target_vid = find_target_farmers_video()
    if not target_vid:
        pytest.skip("Target Farmers video not found in D:\\DL")

    response = client.post(
        "/api/video/detect-watermark",
        data={"video_path": target_vid}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["detected"] is True
    assert len(data["boxes"]) >= 1
    assert data["boxes"][0]["confidence"] >= 0.90
    print("[TEST] API /api/video/detect-watermark passed")


def test_api_detect_endpoint_validation():
    # Test missing both file and video_path
    response = client.post("/api/video/detect-watermark")
    assert response.status_code == 400

    # Test non-existent file path
    response = client.post(
        "/api/video/detect-watermark",
        data={"video_path": "D:/non_existent_video_12345.mp4"}
    )
    assert response.status_code == 404


def test_cleaned_video_has_no_watermark():
    cleaned_vid = find_target_farmers_video(cleaned=True)
    if not cleaned_vid:
        pytest.skip("Cleaned Farmers video not found in D:\\DL")

    result = WatermarkDetector.detect_video_watermark(cleaned_vid)
    # The cleaned video should have no detected watermark
    assert result["detected"] is False or len(result["boxes"]) == 0, "Cleaned video should have no detected watermark!"
    print(f"[TEST] Confirmed zero watermark detected in cleaned video: {cleaned_vid}")


def test_api_process_local_endpoint():
    target_vid = find_target_farmers_video(cleaned=False)
    if not target_vid:
        pytest.skip("Target Farmers video not found in D:\\DL")

    # Call /api/video/process-local without explicit boxes so it auto-detects
    response = client.post(
        "/api/video/process-local",
        data={
            "video_path": target_vid,
            "algorithm": "ns",
            "quality": "high"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "task_id" in data
    assert len(data["detected_boxes"]) >= 1
    print(f"[TEST] API /api/video/process-local created task: {data['task_id']}")
