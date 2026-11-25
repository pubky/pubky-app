import { describe, expect, it, vi } from 'vitest';
import { ok } from './codes';
import { MAX_PUBCHI_DOCUMENT_BYTES, parsePubchiDocumentText, validatePubchiDocumentSize } from './document';

describe('Pubchi document limits', () => {
  it('rejects an oversized read before parsing', () => {
    const parse = vi.fn(() => ok({}));
    const result = parsePubchiDocumentText('x'.repeat(MAX_PUBCHI_DOCUMENT_BYTES + 1), parse);

    expect(result).toEqual({ ok: false, code: 'DOCUMENT_TOO_LARGE' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('rejects an oversized serialized write', () => {
    const result = validatePubchiDocumentSize({ ext: { large: 'x'.repeat(MAX_PUBCHI_DOCUMENT_BYTES) } });

    expect(result).toEqual({ ok: false, code: 'DOCUMENT_TOO_LARGE' });
  });
});
