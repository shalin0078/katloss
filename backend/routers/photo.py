import json
import base64
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response
from fastapi.responses import JSONResponse

from backend.services.photo_service import PhotoInpaintService
from backend.config import MAX_IMAGE_SIZE_MB, ALLOWED_IMAGE_EXTENSIONS

router = APIRouter(prefix="/api/photo", tags=["Photo Watermark Removal"])


@router.post("/remove")
async def remove_photo_watermark(
    file: UploadFile = File(..., description="Original image file"),
    mask: Optional[UploadFile] = File(None, description="Optional painted binary/alpha mask file"),
    boxes: Optional[str] = Form(None, description="Optional JSON array of bounding boxes: '[{\"x\":0,\"y\":0,\"width\":100,\"height\":100}]'"),
    algorithm: str = Form("telea", description="'telea', 'ns', or 'blur'"),
    radius: int = Form(5, description="Inpainting neighborhood radius in pixels"),
    dilate: int = Form(2, description="Mask dilation size in pixels"),
    output_format: Optional[str] = Form(None, description="Optional output format: 'PNG', 'JPEG', 'WEBP'"),
    response_type: str = Form("binary", description="'binary' for image stream, 'json' for base64 JSON"),
):
    # Validate image extension
    filename = file.filename or "image.png"
    ext = "." + filename.split(".")[-1].lower() if "." in filename else ".png"
    if ext not in ALLOWED_IMAGE_EXTENSIONS and ext != ".jpg":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"
        )

    # Read image bytes
    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Image size exceeds limit of {MAX_IMAGE_SIZE_MB}MB.")

    # Read mask bytes if provided
    mask_bytes = None
    if mask is not None:
        mask_bytes = await mask.read()

    # Parse boxes JSON if provided
    parsed_boxes = None
    if boxes:
        try:
            parsed_boxes = json.loads(boxes)
            if not isinstance(parsed_boxes, list):
                raise ValueError("Boxes must be a JSON array.")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid boxes JSON format: {str(e)}")

    if not mask_bytes and not parsed_boxes:
        raise HTTPException(
            status_code=400,
            detail="Must provide either a mask image or at least one bounding box region."
        )

    try:
        result_bytes, mime_type = PhotoInpaintService.inpaint(
            image_bytes=image_bytes,
            mask_bytes=mask_bytes,
            boxes=parsed_boxes,
            algorithm=algorithm,
            radius=radius,
            dilate_px=dilate,
            output_format=output_format
        )

        if response_type.lower() == "json":
            b64_str = base64.b64encode(result_bytes).decode("utf-8")
            data_url = f"data:{mime_type};base64,{b64_str}"
            return JSONResponse({
                "success": True,
                "mime_type": mime_type,
                "data_url": data_url,
                "size_bytes": len(result_bytes)
            })

        return Response(
            content=result_bytes,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'inline; filename="cleaned_{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Inpainting error: {str(ex)}")
