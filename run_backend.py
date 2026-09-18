import uvicorn

if __name__ == "__main__":
    print("==================================================")
    print("  KATLOSS STUDIO - WATERMARK REMOVER BACKEND API  ")
    print("  Server URL:    http://127.0.0.1:8000             ")
    print("  Swagger Docs:  http://127.0.0.1:8000/docs        ")
    print("  Health Check:  http://127.0.0.1:8000/api/health  ")
    print("==================================================")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
