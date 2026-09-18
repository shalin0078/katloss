const API_BASE = "";

export interface WatermarkBox {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  start_time?: number;
  end_time?: number;
  display_width?: number;
  display_height?: number;
}

export interface VideoInfo {
  width: number;
  height: number;
  fps: number;
  total_frames: number;
  duration: number;
}

export interface TaskStatus {
  task_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  message: string;
  download_url?: string;
  output_filename?: string;
  created_at: string;
  error?: string;
}

export const KatlossAPI = {
  async getHealth() {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      return await res.json();
    } catch {
      return { status: "offline" };
    }
  },

  async removePhotoWatermark(params: {
    file: File | Blob;
    filename?: string;
    mask?: File | Blob;
    boxes?: WatermarkBox[];
    algorithm?: "telea" | "ns" | "blur";
    radius?: number;
    dilate?: number;
    outputFormat?: "PNG" | "JPEG" | "WEBP";
  }): Promise<{ dataUrl: string; mimeType: string }> {
    const formData = new FormData();
    formData.append("file", params.file, params.filename || "image.png");

    if (params.mask) {
      formData.append("mask", params.mask, "mask.png");
    }

    if (params.boxes && params.boxes.length > 0) {
      formData.append("boxes", JSON.stringify(params.boxes));
    }

    formData.append("algorithm", params.algorithm || "telea");
    formData.append("radius", String(params.radius || 5));
    formData.append("dilate", String(params.dilate || 2));
    if (params.outputFormat) {
      formData.append("output_format", params.outputFormat);
    }
    formData.append("response_type", "json");

    const res = await fetch(`${API_BASE}/api/photo/remove`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Network error occurred" }));
      throw new Error(err.detail || "Photo inpainting failed.");
    }

    const data = await res.json();
    return { dataUrl: data.data_url, mimeType: data.mime_type };
  },

  async getVideoInfo(file: File): Promise<VideoInfo> {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const res = await fetch(`${API_BASE}/api/video/info`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to inspect video" }));
      throw new Error(err.detail || "Video metadata error");
    }

    const data = await res.json();
    return data.info;
  },

  async submitVideoWatermarkJob(params: {
    file: File;
    boxes: WatermarkBox[];
    algorithm?: "harmonic" | "stroke" | "ns" | "telea" | "delogo";
    quality?: "high" | "medium" | "low";
  }): Promise<{ taskId: string }> {
    const formData = new FormData();
    formData.append("file", params.file, params.file.name);
    formData.append("boxes", JSON.stringify(params.boxes));
    formData.append("algorithm", params.algorithm || "harmonic");
    formData.append("quality", params.quality || "high");

    const res = await fetch(`${API_BASE}/api/video/remove`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to submit video" }));
      throw new Error(err.detail || "Video task submission failed");
    }

    const data = await res.json();
    return { taskId: data.task_id };
  },

  async getVideoTaskStatus(taskId: string): Promise<TaskStatus> {
    const res = await fetch(`${API_BASE}/api/video/tasks/${taskId}`);
    if (!res.ok) {
      throw new Error("Task not found");
    }
    return await res.json();
  },

  async cancelVideoTask(taskId: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/api/video/tasks/${taskId}/cancel`, {
      method: "POST",
    });
    return res.ok;
  },

  async detectWatermark(params: {
    file?: File;
    videoPath?: string;
  }): Promise<{
    detected: boolean;
    boxes: (WatermarkBox & { confidence?: number; zone?: string; score?: number })[];
    video_width: number;
    video_height: number;
    total_frames: number;
    fps: number;
  }> {
    const formData = new FormData();
    if (params.file) {
      formData.append("file", params.file, params.file.name);
    }
    if (params.videoPath) {
      formData.append("video_path", params.videoPath);
    }

    const res = await fetch(`${API_BASE}/api/video/detect-watermark`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Detection failed" }));
      throw new Error(err.detail || "Failed to detect watermark");
    }

    return await res.json();
  },

  async processLocalVideo(params: {
    videoPath: string;
    outputPath?: string;
    boxes?: WatermarkBox[];
    algorithm?: string;
    quality?: string;
  }): Promise<{ taskId: string; localOutputPath: string; downloadUrl: string }> {
    const formData = new FormData();
    formData.append("video_path", params.videoPath);
    if (params.outputPath) {
      formData.append("output_path", params.outputPath);
    }
    if (params.boxes && params.boxes.length > 0) {
      formData.append("boxes", JSON.stringify(params.boxes));
    }
    formData.append("algorithm", params.algorithm || "harmonic");
    formData.append("quality", params.quality || "high");

    const res = await fetch(`${API_BASE}/api/video/process-local`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Local processing failed" }));
      throw new Error(err.detail || "Failed to start local processing");
    }

    const data = await res.json();
    return {
      taskId: data.task_id,
      localOutputPath: data.local_output_path,
      downloadUrl: data.download_url,
    };
  },

  getDownloadUrl(filename: string): string {
    return `${API_BASE}/api/video/download/${filename}`;
  },
};
