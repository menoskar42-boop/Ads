// Phone cameras produce photos of 4–12 MB, often above the 8 MB media limit, so a
// camera photo was picked but never sent. On the web we shrink large photos before
// upload: longest side ≤ 2048 px, JPEG quality 0.85 (still sharp on a phone screen).
// GIFs and small images are sent untouched, and any failure falls back to the original.

export const WEB_IMAGE_MAX_SIDE = 2048;
export const WEB_IMAGE_QUALITY = 0.85;
export const WEB_IMAGE_SHRINK_ABOVE_BYTES = 1_500_000;

export type PreparedWebImage = {
  file: Blob;
  contentType: string;
  filename: string;
  sizeBytes: number;
};

function jpegName(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, "") || `صورة-${Date.now()}`;
  return `${base}.jpg`;
}

async function decode(file: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    // imageOrientation keeps phone photos upright (EXIF rotation).
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function prepareWebImageForUpload(input: PreparedWebImage): Promise<PreparedWebImage> {
  if (
    typeof document === "undefined" ||
    !input.contentType.startsWith("image/") ||
    input.contentType === "image/gif" ||
    input.sizeBytes <= WEB_IMAGE_SHRINK_ABOVE_BYTES
  ) {
    return input;
  }
  try {
    const decoded = await decode(input.file);
    try {
      const scale = Math.min(1, WEB_IMAGE_MAX_SIDE / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return input;
      context.drawImage(decoded.source, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", WEB_IMAGE_QUALITY),
      );
      if (!blob || blob.size >= input.sizeBytes) return input;
      return {
        file: blob,
        contentType: "image/jpeg",
        filename: jpegName(input.filename),
        sizeBytes: blob.size,
      };
    } finally {
      decoded.close();
    }
  } catch {
    return input;
  }
}

// A file input that is not in the document can be dropped while the camera app is
// open (the page goes to the background), so the picked photo never arrives.
export function pickWebCameraPhoto(onPicked: (file: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.setAttribute("capture", "environment");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.opacity = "0";
  input.setAttribute("aria-hidden", "true");
  const cleanup = () => {
    window.removeEventListener("focus", onFocusBack);
    setTimeout(() => input.remove(), 1_000);
  };
  const onFocusBack = () => {
    // Cancelled camera: no change event will come, so remove the input later.
    setTimeout(() => {
      if (!input.files?.length) cleanup();
    }, 60_000);
  };
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    cleanup();
    if (file) onPicked(file);
  });
  window.addEventListener("focus", onFocusBack, { once: true });
  document.body.appendChild(input);
  input.click();
}
