# Katloss Studio - AI Watermark & Object Remover

Katloss Studio is a high-performance, content-aware inpainting engine designed for removing watermarks, logos, timestamps, and unwanted objects from photos and videos seamlessly with temporal consistency and zero blur.

---

## 🌟 Key Features

- 📸 **Photo Studio**: High-resolution image inpainting with Telea & Navier-Stokes content-aware algorithms.
- 🎬 **Video Studio**: Frame-by-frame temporal consistency watermark removal with FFmpeg integration.
- 🔍 **Smart Watermark Detection**: Multi-point automated and semi-automated mask generation.
- ⚡ **Real-time Processing**: Fast FastAPI asynchronous pipeline with task queuing and progress tracking.
- 🎨 **Modern Interactive UI**: Responsive, dark-mode studio interface built with Vite, React, and TypeScript.

---

## 📁 Project Structure

```text
katloss/
├── backend/                  # FastAPI Inpainting & Video Service
│   ├── routers/              # Photo & Video API routes
│   ├── services/             # Detection, inpainting & video pipeline
│   ├── storage/              # Temporary uploads & processed outputs
│   ├── config.py             # System configuration
│   ├── main.py               # Application entry point
│   └── requirements.txt      # Python dependencies
├── frontend/                 # Vite + React + TypeScript Studio UI
│   ├── src/                  # Components, Studio views & state
│   ├── package.json          # Node dependencies
│   └── vite.config.ts        # Vite configuration
├── run_backend.py            # Backend runner script
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** & **npm**
- **FFmpeg** installed and accessible in system PATH

---

### 1. Backend Setup

```bash
# Navigate to project root
cd katloss

# (Optional) Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate      # On Windows
# source venv/bin/activate  # On Linux/macOS

# Install dependencies
pip install -r backend/requirements.txt

# Start the backend server
python run_backend.py
```
The backend will start at `http://127.0.0.1:8000` (API Docs available at `http://127.0.0.1:8000/docs`).

---

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
Open `http://localhost:5173` in your browser to access the Katloss Studio UI.

---

## 🛠️ Tech Stack

- **Backend**: FastAPI, OpenCV, NumPy, FFmpeg, Uvicorn
- **Frontend**: React 18, TypeScript, Vite, Lucide Icons, Modern CSS
- **Processing**: Content-Aware Telea/NS Inpainting, Video Mask Propagation

---

## 📄 License

MIT License
