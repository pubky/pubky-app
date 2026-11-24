import { IMAGE_MAX_DIMENSION } from '@/config/images';

const SVG_MIME_TYPE = 'image/svg+xml';

export const isSvgType = (contentType: string) => contentType.toLowerCase().startsWith('image/svg');

// A percentage resolves against a box an `<img>` does not have.
const isFixedLength = (value: string | null) => !!value?.trim() && !value.trim().endsWith('%');

/**
 * Width ÷ height as an `<img>` shows the SVG: its fixed size when it has one. Browsers report an SVG
 * without a fixed width and height as 300×150 (some as 0×0) whatever its shape, so that one takes its
 * `viewBox`.
 */
function getRatio(image: HTMLImageElement, bytes: Uint8Array): number {
  const root = new DOMParser().parseFromString(new TextDecoder().decode(bytes), SVG_MIME_TYPE).documentElement;
  const { naturalWidth, naturalHeight } = image;
  const hasSize = naturalWidth > 0 && naturalHeight > 0;
  if (hasSize && isFixedLength(root.getAttribute('width')) && isFixedLength(root.getAttribute('height'))) {
    return naturalWidth / naturalHeight;
  }
  const [, , width, height] = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (width > 0 && height > 0) return width / height;
  return hasSize ? naturalWidth / naturalHeight : 1;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = url;
  });
}

/** Draws an SVG into PNG bytes, or returns null when the browser cannot draw it. */
export async function rasterizeSvg(bytes: Uint8Array): Promise<Uint8Array | null> {
  // This SVG URL never leaves the function: only the PNG reaches the page.
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: SVG_MIME_TYPE }));
  const canvas = document.createElement('canvas');
  try {
    const image = await loadImage(url);
    const ratio = getRatio(image, bytes);
    // An SVG has no fixed resolution, so it gets the long edge of an uploaded image: icons scale
    // up, huge drawings down.
    const [width, height] =
      ratio >= 1
        ? [IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION / ratio]
        : [IMAGE_MAX_DIMENSION * ratio, IMAGE_MAX_DIMENSION];
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return png ? new Uint8Array(await png.arrayBuffer()) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    // Safari caps the memory of all canvases together, so free this one now instead of at garbage collection.
    canvas.width = 0;
    canvas.height = 0;
  }
}
