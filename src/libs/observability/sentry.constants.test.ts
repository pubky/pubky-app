import { describe, expect, it } from 'vitest';
import { toChunkLoadRecoveryError } from '@/libs/chunk-load/chunkLoadRecovery';
import { OBSERVABILITY_IGNORE_ERRORS } from './sentry.constants';

// Sentry and Pulse both treat a string pattern as a substring and test a RegExp against the message.
const isIgnored = (message: string) =>
  OBSERVABILITY_IGNORE_ERRORS.some((pattern) =>
    typeof pattern === 'string' ? message.includes(pattern) : pattern.test(message),
  );

describe('OBSERVABILITY_IGNORE_ERRORS', () => {
  it.each([
    'ChunkLoadError: Loading chunk 4521 failed.',
    'ChunkLoadError: Failed to load chunk /_next/static/chunks/0i4cyig_78vax.js from module 466034',
    'Failed to load chunk static/chunks/1a2b.js as a runtime dependency of chunk static/chunks/3c4d.js',
  ])('drops stale chunk failures after a deploy: %s', (message) => {
    expect(isIgnored(message)).toBe(true);
  });

  it.each(['Failed to load resource: the server responded with a status of 500', 'Failed to load chunk'])(
    'keeps unrelated load failures: %s',
    (message) => {
      expect(isIgnored(message)).toBe(false);
    },
  );

  it('keeps the boundary report for a chunk the one-time reload could not recover', () => {
    const reported = toChunkLoadRecoveryError(
      new Error('Failed to load chunk /_next/static/chunks/0i4cyig_78vax.js from module 466034'),
    );

    expect(isIgnored(reported.message)).toBe(false);
    expect(isIgnored(`${reported.name}: ${reported.message}`)).toBe(false);
  });

  it('carries no stateful /g patterns', () => {
    for (const pattern of OBSERVABILITY_IGNORE_ERRORS) {
      if (pattern instanceof RegExp) expect(pattern.global).toBe(false);
    }
  });
});
