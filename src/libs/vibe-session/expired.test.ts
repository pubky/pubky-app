import { describe, expect, it } from 'vitest';
import { isPubkyExpiredError } from './expired';

function authExpired(message = 'The provided auth request has expired or was cancelled.') {
  const err = new Error(message) as Error & { name: string };
  err.name = 'AuthenticationError';
  return err;
}

function requestError(statusCode?: number, message = 'HTTP error') {
  const err = new Error(message) as Error & { name: string; data?: { statusCode?: number } };
  err.name = 'RequestError';
  if (statusCode !== undefined) {
    err.data = { statusCode };
  }
  return err;
}

describe('isPubkyExpiredError', () => {
  it('treats AuthenticationError as expired (RequestExpired equivalent)', () => {
    expect(isPubkyExpiredError(authExpired())).toBe(true);
  });

  it('treats RequestError 401 and 403 as expired', () => {
    expect(isPubkyExpiredError(requestError(401))).toBe(true);
    expect(isPubkyExpiredError(requestError(403))).toBe(true);
  });

  it('does not treat network, 5xx, or malformed export as expired', () => {
    expect(isPubkyExpiredError(requestError(500))).toBe(false);
    expect(isPubkyExpiredError(requestError())).toBe(false);
    expect(isPubkyExpiredError(new Error('invalid session export'))).toBe(false);
    expect(isPubkyExpiredError({ name: 'PkarrError', message: 'dht' })).toBe(false);
    expect(isPubkyExpiredError(null)).toBe(false);
    expect(isPubkyExpiredError('expired')).toBe(false);
  });
});
