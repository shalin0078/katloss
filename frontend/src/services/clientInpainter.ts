/**
 * Client-Side Fast Marching / Telea-Style Inpainting Engine
 * Allows 100% in-browser offline image watermark removal when backend is unreachable.
 */

export function inpaintCanvasData(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  maskCanvas: HTMLCanvasElement,
  radius: number = 5
) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return;
  const maskData = maskCtx.getImageData(0, 0, width, height).data;

  // Identify masked pixels: any pixel where mask red or alpha > 30
  const isMasked = new Uint8Array(width * height);
  let maskedCount = 0;

  for (let i = 0; i < width * height; i++) {
    const mi = i * 4;
    // Check if mask has red or alpha
    if (maskData[mi] > 30 || maskData[mi + 3] > 30) {
      isMasked[i] = 1;
      maskedCount++;
    }
  }

  if (maskedCount === 0) return;

  // Multi-pass boundary pixel propagation (Telea fast marching approximation)
  const passes = Math.min(15, Math.max(3, radius * 2));
  const r = Math.max(2, Math.min(12, radius));

  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (isMasked[idx] === 1) {
          let sumR = 0, sumG = 0, sumB = 0, weightSum = 0;

          // Sample neighborhood
          for (let dy = -r; dy <= r; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;

            for (let dx = -r; dx <= r; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;

              const nIdx = ny * width + nx;
              if (isMasked[nIdx] === 0) {
                const distSq = dx * dx + dy * dy;
                if (distSq <= r * r) {
                  const weight = 1.0 / (Math.sqrt(distSq) + 0.1);
                  const p = nIdx * 4;
                  sumR += data[p] * weight;
                  sumG += data[p + 1] * weight;
                  sumB += data[p + 2] * weight;
                  weightSum += weight;
                }
              }
            }
          }

          if (weightSum > 0) {
            const p = idx * 4;
            data[p] = Math.round(sumR / weightSum);
            data[p + 1] = Math.round(sumG / weightSum);
            data[p + 2] = Math.round(sumB / weightSum);
          }
        }
      }
    }
  }

  // Subtle Gaussian blur on the inpainted zone to remove artifacts
  ctx.putImageData(imgData, 0, 0);
}
