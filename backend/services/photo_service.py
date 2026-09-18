import io
import cv2
import numpy as np
from PIL import Image
from typing import List, Dict, Tuple, Optional


class PhotoInpaintService:
    @staticmethod
    def _read_image(image_bytes: bytes) -> Tuple[np.ndarray, Optional[np.ndarray], str]:
        """
        Reads image bytes into a numpy BGR array, returns (bgr_img, alpha_channel, format_ext).
        """
        # Read using PIL first to reliably detect format and alpha channel
        pil_img = Image.open(io.BytesIO(image_bytes))
        orig_format = (pil_img.format or "PNG").upper()

        if pil_img.mode in ("RGBA", "LA") or (pil_img.mode == "P" and "transparency" in pil_img.info):
            rgba = pil_img.convert("RGBA")
            np_rgba = np.array(rgba)
            bgr = cv2.cvtColor(np_rgba, cv2.COLOR_RGBA2BGR)
            alpha = np_rgba[:, :, 3]
            return bgr, alpha, orig_format
        else:
            rgb = pil_img.convert("RGB")
            np_rgb = np.array(rgb)
            bgr = cv2.cvtColor(np_rgb, cv2.COLOR_RGB2BGR)
            return bgr, None, orig_format

    @staticmethod
    def _read_mask(mask_bytes: bytes, target_shape: Tuple[int, int]) -> np.ndarray:
        """
        Reads a mask image (can be PNG with alpha or grayscale) and resizes to target (height, width).
        Pixels with mask coverage will have value 255, background 0.
        """
        pil_mask = Image.open(io.BytesIO(mask_bytes))
        if pil_mask.size != (target_shape[1], target_shape[0]):
            pil_mask = pil_mask.resize((target_shape[1], target_shape[0]), Image.Resampling.NEAREST)

        # If mask has alpha, mask pixels are either colored or opaque
        if pil_mask.mode in ("RGBA", "LA"):
            np_mask = np.array(pil_mask)
            alpha = np_mask[:, :, 3]
            # Consider any pixel with non-zero alpha and color or alpha > 50 as masked
            binary_mask = np.where(alpha > 30, 255, 0).astype(np.uint8)
        else:
            gray = np.array(pil_mask.convert("L"))
            # Threshold at 128
            _, binary_mask = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY)

        return binary_mask

    @staticmethod
    def _create_mask_from_boxes(shape: Tuple[int, int], boxes: List[Dict]) -> np.ndarray:
        """
        Creates a uint8 binary mask (shape: height, width) with boxes filled with 255.
        """
        height, width = shape
        mask = np.zeros((height, width), dtype=np.uint8)

        for b in boxes:
            x = max(0, int(b.get("x", 0)))
            y = max(0, int(b.get("y", 0)))
            w = max(1, int(b.get("width", 0)))
            h = max(1, int(b.get("height", 0)))

            x2 = min(width, x + w)
            y2 = min(height, y + h)

            if x < width and y < height and x2 > x and y2 > y:
                cv2.rectangle(mask, (x, y), (x2, y2), 255, -1)

        return mask

    @staticmethod
    def _apply_dilation(mask: np.ndarray, dilate_px: int) -> np.ndarray:
        """
        Dilates the mask slightly to cover watermark edge anti-aliasing / halos.
        """
        if dilate_px <= 0:
            return mask
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_px * 2 + 1, dilate_px * 2 + 1))
        return cv2.dilate(mask, kernel, iterations=1)

    @staticmethod
    def _inpaint_core(bgr: np.ndarray, mask: np.ndarray, algorithm: str = "telea", radius: int = 5) -> np.ndarray:
        """
        Performs inpainting on BGR image using the binary mask.
        """
        if algorithm.lower() == "ns":
            return cv2.inpaint(bgr, mask, inpaintRadius=max(1, radius), flags=cv2.INPAINT_NS)
        elif algorithm.lower() == "blur":
            # Edge-feathered blur / delogo
            result = bgr.copy()
            # Blur the image heavily
            blurred = cv2.GaussianBlur(bgr, (radius * 4 + 1, radius * 4 + 1), 0)
            # Smooth mask edges
            mask_float = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (9, 9), 0)
            mask_3c = np.dstack([mask_float, mask_float, mask_float])
            # Blend
            result = (blurred * mask_3c + bgr * (1.0 - mask_3c)).astype(np.uint8)
            return result
        else:
            # Default: Fast Marching Telea
            return cv2.inpaint(bgr, mask, inpaintRadius=max(1, radius), flags=cv2.INPAINT_TELEA)

    @classmethod
    def inpaint(
        cls,
        image_bytes: bytes,
        mask_bytes: Optional[bytes] = None,
        boxes: Optional[List[Dict]] = None,
        algorithm: str = "telea",
        radius: int = 5,
        dilate_px: int = 2,
        output_format: Optional[str] = None
    ) -> Tuple[bytes, str]:
        """
        Main entry point for photo watermark removal.
        Returns: (result_bytes, mime_type)
        """
        bgr, alpha, orig_format = cls._read_image(image_bytes)
        height, width = bgr.shape[:2]

        # Generate or read mask
        if mask_bytes is not None and len(mask_bytes) > 0:
            mask = cls._read_mask(mask_bytes, (height, width))
            # If boxes are also provided, combine them
            if boxes and len(boxes) > 0:
                box_mask = cls._create_mask_from_boxes((height, width), boxes)
                mask = cv2.bitwise_or(mask, box_mask)
        elif boxes and len(boxes) > 0:
            mask = cls._create_mask_from_boxes((height, width), boxes)
        else:
            raise ValueError("Either a mask image or watermark bounding boxes must be provided.")

        # Dilate mask if requested
        if dilate_px > 0:
            mask = cls._apply_dilation(mask, dilate_px)

        # Inpaint BGR channels
        inpainted_bgr = cls._inpaint_core(bgr, mask, algorithm=algorithm, radius=radius)

        # Reconstruct output format
        final_format = output_format.upper() if output_format else orig_format
        if final_format not in ("PNG", "JPEG", "JPG", "WEBP"):
            final_format = "PNG"

        if alpha is not None and final_format in ("PNG", "WEBP"):
            # Combine RGB with preserved alpha
            rgb = cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2RGB)
            rgba = np.dstack([rgb, alpha])
            out_img = Image.fromarray(rgba, mode="RGBA")
            mime = f"image/{final_format.lower()}"
        else:
            rgb = cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2RGB)
            out_img = Image.fromarray(rgb, mode="RGB")
            mime = "image/jpeg" if final_format in ("JPEG", "JPG") else f"image/{final_format.lower()}"

        out_buffer = io.BytesIO()
        if final_format in ("JPEG", "JPG"):
            out_img.save(out_buffer, format="JPEG", quality=95)
        elif final_format == "WEBP":
            out_img.save(out_buffer, format="WEBP", quality=95)
        else:
            out_img.save(out_buffer, format="PNG")

        return out_buffer.getvalue(), mime
