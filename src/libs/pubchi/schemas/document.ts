import { err, ok, type ParseResult } from './codes';

export const MAX_PUBCHI_DOCUMENT_BYTES = 65_536;

export function validatePubchiDocumentSize(value: unknown): ParseResult<void> {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return err('SCHEMA_INVALID');
  }
  if (serialized === undefined) return err('SCHEMA_INVALID');
  return new TextEncoder().encode(serialized).byteLength <= MAX_PUBCHI_DOCUMENT_BYTES
    ? ok(undefined)
    : err('DOCUMENT_TOO_LARGE');
}

export function parsePubchiDocumentText<T>(text: string, parse: (value: unknown) => ParseResult<T>): ParseResult<T> {
  if (new TextEncoder().encode(text).byteLength > MAX_PUBCHI_DOCUMENT_BYTES) {
    return err('DOCUMENT_TOO_LARGE');
  }
  try {
    return parse(JSON.parse(text));
  } catch {
    return err('SCHEMA_INVALID');
  }
}
