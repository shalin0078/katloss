import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional, Any


class TaskManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TaskManager, cls).__new__(cls)
            cls._instance.tasks: Dict[str, Dict[str, Any]] = {}
        return cls._instance

    def create_task(self, initial_message: str = "Task queued") -> str:
        task_id = str(uuid.uuid4())
        self.tasks[task_id] = {
            "task_id": task_id,
            "status": "queued",
            "progress": 0.0,
            "message": initial_message,
            "download_url": None,
            "output_filename": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": time.time(),
            "error": None,
            "cancel_requested": False,
        }
        return task_id

    def update_task(
        self,
        task_id: str,
        status: Optional[str] = None,
        progress: Optional[float] = None,
        message: Optional[str] = None,
        output_filename: Optional[str] = None,
        download_url: Optional[str] = None,
        error: Optional[str] = None,
    ):
        if task_id not in self.tasks:
            return

        task = self.tasks[task_id]
        if status is not None:
            task["status"] = status
        if progress is not None:
            task["progress"] = round(float(progress), 2)
        if message is not None:
            task["message"] = message
        if output_filename is not None:
            task["output_filename"] = output_filename
        if download_url is not None:
            task["download_url"] = download_url
        if error is not None:
            task["error"] = error
            task["status"] = "failed"
        task["updated_at"] = time.time()

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self.tasks.get(task_id)

    def cancel_task(self, task_id: str) -> bool:
        if task_id in self.tasks:
            self.tasks[task_id]["cancel_requested"] = True
            self.tasks[task_id]["status"] = "cancelled"
            self.tasks[task_id]["message"] = "Processing was cancelled by user"
            return True
        return False

    def is_cancelled(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        return bool(task and task.get("cancel_requested", False))

    def cleanup_old_tasks(self, max_age_seconds: int = 7200):
        now = time.time()
        expired = [
            tid for tid, data in self.tasks.items()
            if (now - data.get("updated_at", now)) > max_age_seconds
        ]
        for tid in expired:
            del self.tasks[tid]


task_manager = TaskManager()
