// imageCompress.js — small client-side image downscaler/compressor used by
// banner/logo upload flows. Only touches raster formats (JPEG/PNG/WebP) —
// SVG and GIF are returned unchanged because the canvas pipeline would
// flatten vectors and break animations.

const RASTER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const blobToFile = (blob, name, type) =>
  new File([blob], name, { type, lastModified: Date.now() });

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));

/**
 * Compress an image client-side before uploading.
 *
 * @param {File} file  Original file selected by the user.
 * @param {Object} [opts]
 * @param {number} [opts.maxWidth=1600]   Cap on the longest edge in pixels.
 * @param {number} [opts.maxSizeKB=500]   Re-encode with lower quality until under this size (if possible).
 * @param {number} [opts.quality=0.82]    Starting JPEG/WebP quality.
 * @returns {Promise<File>} The compressed file (or the original if compression isn't worth it / isn't applicable).
 */
export async function compressImage(file, opts = {}) {
  const { maxWidth = 1600, maxSizeKB = 500, quality = 0.82 } = opts;
  if (!file || !RASTER_TYPES.has(file.type)) return file;
  // Skip files that are already small enough — no point burning CPU.
  if (file.size <= maxSizeKB * 1024) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longest > maxWidth ? maxWidth / longest : 1;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // White background for PNGs with transparency that we want to re-encode as JPEG
    const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
    if (outType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    // Iteratively reduce quality until we're under maxSizeKB or floor at 0.5
    let q = quality;
    let blob = await canvasToBlob(canvas, outType, q);
    while (blob && blob.size > maxSizeKB * 1024 && q > 0.5) {
      q -= 0.1;
      blob = await canvasToBlob(canvas, outType, q);
    }
    if (!blob) return file;
    if (blob.size >= file.size) return file; // not actually smaller, keep original
    const ext = outType === "image/png" ? ".png" : ".jpg";
    const newName = file.name.replace(/\.[^.]+$/, "") + ext;
    return blobToFile(blob, newName, outType);
  } catch (_e) {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
