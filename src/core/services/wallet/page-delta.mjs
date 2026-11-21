// An enclosing authenticated record identifies the immutable base. All numbers
// in this payload are little-endian. Tag 0 carries a full copy. Tag 1 carries
// the new length, page count, and ascending (page index, page bytes) entries.
const pageSize = 16 * 1024;
const maxBytes = 256 * 1024 * 1024;
const headerSize = 9;

function invalid() {
  return new Error('Invalid wallet page delta.');
}

function checkBytes(bytes, maximum) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maximum) throw invalid();
}

function fullCopy(current) {
  const result = new Uint8Array(1 + current.length);
  result.set(current, 1);
  return result;
}

/** Encode an independent delta from the immutable base, including length changes. */
export function encodePageDelta(base, current) {
  checkBytes(base, maxBytes);
  checkBytes(current, maxBytes);
  const shared = Math.min(base.length, current.length);
  // SQLite images are usually aligned. Comparing words makes the common case
  // of a large, unchanged image cheap. Sliced or short input also works.
  let baseWords, currentWords;
  if ((base.byteOffset | current.byteOffset) % 4 === 0) {
    baseWords = new Uint32Array(base.buffer, base.byteOffset, Math.floor(shared / 4));
    currentWords = new Uint32Array(current.buffer, current.byteOffset, Math.floor(shared / 4));
  }

  function changed(start, end) {
    const commonEnd = Math.min(shared, end);
    let i = start;
    if (baseWords) {
      const stop = Math.floor(commonEnd / 4);
      for (let j = start / 4; j < stop; j++) {
        if (baseWords[j] !== currentWords[j]) return true;
      }
      i = Math.max(i, stop * 4);
    }
    for (; i < commonEnd; i++) if (base[i] !== current[i]) return true;
    // The decoder zero-initializes bytes beyond the end of the base.
    for (; i < end; i++) if (current[i] !== 0) return true;
    return false;
  }

  const pages = [];
  let size = headerSize;
  for (let start = 0; start < current.length; start += pageSize) {
    const end = Math.min(current.length, start + pageSize);
    if (!changed(start, end)) continue;
    size += 4 + end - start;
    if (size >= current.length + 1) return fullCopy(current);
    pages.push(start);
  }
  if (size >= current.length + 1) return fullCopy(current);
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  result[0] = 1;
  view.setUint32(1, current.length, true);
  view.setUint32(5, pages.length, true);
  let pos = headerSize;
  for (const start of pages) {
    const end = Math.min(current.length, start + pageSize);
    view.setUint32(pos, start / pageSize, true);
    result.set(current.subarray(start, end), pos + 4);
    pos += 4 + end - start;
  }
  return result;
}

/** Validate without allocating so a vault can limit the combined size of all restored files. */
export function pageDeltaLength(encoded) {
  checkBytes(encoded, maxBytes + 1);
  if (encoded[0] === 0) return encoded.length - 1;
  if (encoded[0] !== 1 || encoded.length < headerSize) throw invalid();
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const length = view.getUint32(1, true);
  const count = view.getUint32(5, true);
  const pageCount = Math.ceil(length / pageSize);
  if (length > maxBytes || count > pageCount) throw invalid();
  let pos = headerSize;
  let previous = -1;
  for (let i = 0; i < count; i++) {
    if (pos + 4 > encoded.length) throw invalid();
    const index = view.getUint32(pos, true);
    if (index <= previous || index >= pageCount) throw invalid();
    previous = index;
    pos += 4 + Math.min(pageSize, length - index * pageSize);
    if (pos > encoded.length) throw invalid();
  }
  if (pos !== encoded.length) throw invalid();
  return length;
}

/** Validate the entire payload before allocating or copying the restored image. */
export function applyPageDelta(base, encoded) {
  checkBytes(base, maxBytes);
  const length = pageDeltaLength(encoded);
  if (encoded[0] === 0) return new Uint8Array(encoded.subarray(1));
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const count = view.getUint32(5, true);
  const result = new Uint8Array(length);
  result.set(base.subarray(0, length));
  let pos = headerSize;
  for (let i = 0; i < count; i++) {
    const start = view.getUint32(pos, true) * pageSize;
    const bytes = Math.min(pageSize, length - start);
    result.set(encoded.subarray(pos + 4, pos + 4 + bytes), start);
    pos += 4 + bytes;
  }
  return result;
}
