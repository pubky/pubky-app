/**
 * Byte ranges of local media: Safari plays a `<video>` or `<audio>` only from a server that answers them. Imported
 * by the worker, so it stays free of app imports.
 */

/** An inclusive byte range within a body. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * The single range a `Range` header asks of a body of `size` bytes: `start-end`, `start-` or the suffix `-length`.
 * `null` when there is no header or one that is answered with the whole body (another unit, several ranges, a
 * malformed one), and `unsatisfiable` when the range starts past the end.
 */
export function parseByteRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (header === null) return null;
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (match === null) return null;
  const [, first, last] = match;
  if (first === '') {
    if (last === '') return null;
    const length = Number(last);
    if (length === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  const end = last === '' ? size - 1 : Number(last);
  if (end < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end: Math.min(end, size - 1) };
}

/**
 * `body` answered to a request carrying `rangeHeader`: the slice it asks for as a 206, a 416 for a range past the
 * end, else the whole body as a 200. Each response carries `headers` with `Accept-Ranges` and the length it sends.
 */
export function rangedResponse(body: Blob, headers: Headers, rangeHeader: string | null): Response {
  headers.set('Accept-Ranges', 'bytes');
  const range = parseByteRange(rangeHeader, body.size);
  if (range === null) {
    headers.set('Content-Length', String(body.size));
    return new Response(body, { status: 200, headers });
  }
  if (range === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${body.size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${body.size}`);
  headers.set('Content-Length', String(range.end - range.start + 1));
  return new Response(body.slice(range.start, range.end + 1), { status: 206, headers });
}
