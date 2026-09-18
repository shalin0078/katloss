import io
import json
import time
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from backend.main import app
from backend.tests.test_backend import create_sample_photo, create_sample_video

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["ffmpeg_available"] is True
    assert "photo_telea_inpaint" in data["features"]
    print("[OK] /api/health passed")


def test_photo_remove_endpoint():
    img_bytes, box = create_sample_photo()

    # Test binary output
    response = client.post(
        "/api/photo/remove",
        files={"file": ("test.png", img_bytes, "image/png")},
        data={
            "boxes": json.dumps([box]),
            "algorithm": "telea",
            "radius": "5",
            "dilate": "2",
            "response_type": "binary"
        }
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert len(response.content) > 0
    print("[OK] POST /api/photo/remove (binary) passed")

    # Test JSON base64 output
    response_json = client.post(
        "/api/photo/remove",
        files={"file": ("test.png", img_bytes, "image/png")},
        data={
            "boxes": json.dumps([box]),
            "algorithm": "ns",
            "response_type": "json"
        }
    )
    assert response_json.status_code == 200
    json_data = response_json.json()
    assert json_data["success"] is True
    assert "data_url" in json_data
    assert json_data["data_url"].startswith("data:image/png;base64,")
    print("[OK] POST /api/photo/remove (json data_url) passed")


def test_video_endpoints():
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_vid:
        tmp_vid_path = tmp_vid.name

    create_sample_video(tmp_vid_path, duration_sec=1, fps=25)

    with open(tmp_vid_path, "rb") as f:
        vid_bytes = f.read()

    # Test /api/video/info
    res_info = client.post(
        "/api/video/info",
        files={"file": ("sample.mp4", vid_bytes, "video/mp4")}
    )
    assert res_info.status_code == 200
    info_data = res_info.json()
    assert info_data["success"] is True
    assert info_data["info"]["width"] == 320
    print("[OK] POST /api/video/info passed")

    # Test /api/video/remove
    boxes = [{"x": 10, "y": 10, "width": 80, "height": 30, "start_time": 0.0, "end_time": 1.0}]
    res_remove = client.post(
        "/api/video/remove",
        files={"file": ("sample.mp4", vid_bytes, "video/mp4")},
        data={"boxes": json.dumps(boxes), "algorithm": "delogo", "quality": "fast"}
    )
    assert res_remove.status_code == 200
    task_info = res_remove.json()
    assert task_info["success"] is True
    task_id = task_info["task_id"]
    print(f"[OK] POST /api/video/remove created task: {task_id}")

    # Poll task status
    completed = False
    for _ in range(20):
        time.sleep(0.5)
        res_status = client.get(f"/api/video/tasks/{task_id}")
        assert res_status.status_code == 200
        st = res_status.json()
        if st["status"] == "completed":
            completed = True
            print(f"[OK] Video task completed! Download URL: {st.get('download_url')}")
            # Test download endpoint
            dl_res = client.get(st["download_url"])
            assert dl_res.status_code == 200
            assert dl_res.headers["content-type"] == "video/mp4"
            print("[OK] GET /api/video/download passed")
            break
        elif st["status"] == "failed":
            raise AssertionError(f"Task failed: {st.get('error')}")

    assert completed, "Video task timed out!"


def test_video_harmonic_endpoints():
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_vid:
        tmp_vid_path = tmp_vid.name

    create_sample_video(tmp_vid_path, duration_sec=1, fps=25)

    with open(tmp_vid_path, "rb") as f:
        vid_bytes = f.read()

    boxes = [{"x": 10, "y": 10, "width": 80, "height": 30, "start_time": 0.0, "end_time": 1.0}]
    res_remove = client.post(
        "/api/video/remove",
        files={"file": ("sample.mp4", vid_bytes, "video/mp4")},
        data={"boxes": json.dumps(boxes), "algorithm": "harmonic", "quality": "fast"}
    )
    assert res_remove.status_code == 200
    task_id = res_remove.json()["task_id"]

    completed = False
    for _ in range(30):
        time.sleep(0.5)
        res_status = client.get(f"/api/video/tasks/{task_id}")
        assert res_status.status_code == 200
        st = res_status.json()
        if st["status"] == "completed":
            completed = True
            dl_res = client.get(st["download_url"])
            assert dl_res.status_code == 200
            assert dl_res.headers["content-type"] == "video/mp4"
            print("[OK] Harmonic video inpaint passed with 0 errors!")
            break
        elif st["status"] == "failed":
            raise AssertionError(f"Harmonic task failed: {st.get('error')}")

    assert completed, "Harmonic video task timed out!"


if __name__ == "__main__":
    print("========================================")
    print("[TEST] Running Katloss Studio API Endpoint Tests")
    print("========================================")
    test_health_check()
    test_photo_remove_endpoint()
    test_video_endpoints()
    test_video_harmonic_endpoints()
    print("========================================")
    print("[SUCCESS] ALL ENDPOINT TESTS PASSED!")
    print("========================================")

