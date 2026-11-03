import { describe, expect, it } from 'vitest';
import { PUBCHI_ERROR_CODES, PUBCHI_ERROR_COPY_BY_CODE, pubchiErrorCopy } from './error-copy';
import { ERROR_CODES } from './schemas/codes';

describe('pubchiErrorCopy', () => {
  it('has human-readable copy for every vendored and service error code', () => {
    for (const code of PUBCHI_ERROR_CODES) {
      const copy = pubchiErrorCopy(code);

      expect(copy.message).toBeTruthy();
      expect(copy.message).not.toContain(code);
    }
    expect(PUBCHI_ERROR_CODES).toEqual(expect.arrayContaining([...ERROR_CODES]));
    expect(Object.keys(PUBCHI_ERROR_COPY_BY_CODE)).toEqual(expect.arrayContaining([...PUBCHI_ERROR_CODES]));
  });

  it('does not expose a support code for recognised service errors', () => {
    expect(pubchiErrorCopy('BUDGET_EXCEEDED')).toEqual({
      message: "Your Pubchi has used today's budget. It resets at midnight UTC.",
    });
  });

  it('keeps unknown codes out of the message while retaining them for support', () => {
    expect(pubchiErrorCopy('NEW_SERVICE_CODE')).toEqual({
      message: 'Something went wrong on the Pubchi service.',
      supportCode: 'NEW_SERVICE_CODE',
    });
  });

  it('uses a separate message for network failures', () => {
    expect(pubchiErrorCopy('CONNECTION_FAILED').message).toBe(
      "I couldn't reach the Pubchi service. Check your connection and try again in a minute.",
    );
  });

  it('does not fall back to the generic service error for BRAIN_FORBIDDEN', () => {
    expect(pubchiErrorCopy('BRAIN_FORBIDDEN')).toEqual({
      message:
        "This Pubchi's brain isn't allowed here. A self-hosted brain has to run on this machine (127.0.0.1, localhost, or ::1).",
    });
    expect(pubchiErrorCopy('BRAIN_FORBIDDEN').message).not.toBe('Something went wrong on the Pubchi service.');
  });

  it('keeps BRAIN_UNAVAILABLE distinct from the graph UPSTREAM_UNAVAILABLE sentence', () => {
    expect(pubchiErrorCopy('BRAIN_UNAVAILABLE')).toEqual({
      message: "The brain didn't answer. If you run a local model, check that it is up and try again in a minute.",
    });
    expect(pubchiErrorCopy('BRAIN_UNAVAILABLE').message).not.toBe(pubchiErrorCopy('UPSTREAM_UNAVAILABLE').message);
  });
});
