/**
 * The image type a favicon's first bytes say it is, else `null`. Only raster formats a browser
 * shows in an `<img>` are served: ICO, PNG, GIF, JPEG and WebP. SVG is never served from the app's
 * origin (it can carry script), nor is anything a site labels as an image but is not one (an HTML
 * page answering `/favicon.ico`).
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (bytes.length >= 4 && starts(0x00, 0x00, 0x01, 0x00)) return 'image/x-icon';
  if (bytes.length >= 8 && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (
    bytes.length >= 6 &&
    starts(0x47, 0x49, 0x46, 0x38) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  )
    return 'image/gif';
  if (bytes.length >= 3 && starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  return null;
}

/**
 * Whether a response's declared type may be a favicon: any `image/*` but SVG, a generic binary
 * type, or none. The bytes decide in the end (`sniffImageType`).
 */
export function isFaviconContentType(contentType: string | null): boolean {
  const type = contentType?.split(';')[0].trim().toLowerCase() ?? '';
  if (!type || type === 'application/octet-stream') return true;
  return type.startsWith('image/') && !type.startsWith('image/svg');
}

/**
 * The body's bytes, at most `maxBytes`, else `null` (larger, or the read failed or was aborted).
 * Stops reading as soon as the cap is passed.
 */
export async function readBodyBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    reader.cancel().catch(() => {});
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
