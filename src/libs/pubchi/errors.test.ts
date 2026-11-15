import { describe, expect, it } from 'vitest';
import { extractPubchiErrorCode } from './errors';

describe('extractPubchiErrorCode', () => {
  it('accepts runtime codes in a string error field', () => {
    expect(extractPubchiErrorCode({ error: 'BUDGET_EXCEEDED' })).toBe('BUDGET_EXCEEDED');
  });

  it('accepts runtime codes in a nested error object', () => {
    expect(extractPubchiErrorCode({ error: { code: 'UPSTREAM_UNAVAILABLE' } })).toBe('UPSTREAM_UNAVAILABLE');
  });
});
