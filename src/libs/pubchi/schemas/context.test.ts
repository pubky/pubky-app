import { describe, expect, it } from 'vitest';
import { parsePubchiOwnerContextV1 } from './context';

const valid = {
  schema: 'pubchi-owner-context',
  version: 1,
  about: 'Bitcoin',
  instructions: 'Answer briefly',
  updated_at: 1_700_000_000,
} as const;

describe('PubchiOwnerContextV1Schema', () => {
  it('accepts valid context and counts Unicode code points', () => {
    expect(parsePubchiOwnerContextV1(valid).ok).toBe(true);
    expect(parsePubchiOwnerContextV1({ ...valid, about: '😀'.repeat(1500) }).ok).toBe(true);
    expect(parsePubchiOwnerContextV1({ ...valid, about: '😀'.repeat(1501) }).ok).toBe(false);
  });

  it('rejects oversized instructions and secret-shaped values', () => {
    expect(parsePubchiOwnerContextV1({ ...valid, instructions: 'a'.repeat(1001) }).ok).toBe(false);
    expect(parsePubchiOwnerContextV1({ ...valid, about: 'sk-abcdefghijklmnopqrstuvwxyz' }).ok).toBe(false);
  });
});
