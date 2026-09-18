import { describe, expect, it } from 'vitest';
import {
  PASSPORT_ACK_MESSAGE_TYPE,
  PASSPORT_MESSAGE_VERSION,
  PASSPORT_OUTCOME_MESSAGE_TYPE,
  PASSPORT_RETURN_MESSAGE_TYPE,
  PASSPORT_X_SOURCE,
} from '@/config/passport';
import {
  buildPassportAuthorizeUrl,
  buildPassportCallbacks,
  buildPassportOutcomeAck,
  buildPassportReturnPostMessage,
  buildPassportReturnUrl,
  getPassportOrigin,
  isPassportOutcome,
  parsePassportOutcomeMessage,
  parsePassportReturnMessage,
  parsePassportReturnQuery,
} from './passport';

const PASSPORT_URL = 'https://passport.example.com/';
const PASSPORT_ORIGIN = 'https://passport.example.com';
const APP_ORIGIN = 'https://app.example.com';
const ATTEMPT_ID = 'attempt-1234';
const AUTH_URL = 'pubkyauth:///?caps=/pub/pubky.app/:rw&secret=abc%2Bdef&relay=https://relay.example.com/inbox';

const popup = { name: 'popup' };
const otherWindow = { name: 'other' };

describe('passport helpers', () => {
  describe('getPassportOrigin', () => {
    it('reduces a base URL to its origin', () => {
      expect(getPassportOrigin('https://passport.example.com/some/path?x=1')).toBe(PASSPORT_ORIGIN);
    });

    it('throws on a malformed URL', () => {
      expect(() => getPassportOrigin('not a url')).toThrow();
    });
  });

  describe('buildPassportAuthorizeUrl', () => {
    it('places the single-encoded authorization URL in the fragment of /authorize', () => {
      const url = new URL(buildPassportAuthorizeUrl(PASSPORT_URL, AUTH_URL));

      expect(url.origin).toBe(PASSPORT_ORIGIN);
      expect(url.pathname).toBe('/authorize');
      expect(url.search).toBe('');
      expect(url.hash).toBe(`#d=${encodeURIComponent(AUTH_URL)}`);
      expect(decodeURIComponent(url.hash.slice('#d='.length))).toBe(AUTH_URL);
    });

    it('ignores any path on the configured Passport URL', () => {
      expect(buildPassportAuthorizeUrl('https://passport.example.com/ignored/path', AUTH_URL)).toMatch(
        /^https:\/\/passport\.example\.com\/authorize#d=/,
      );
    });
  });

  describe('buildPassportReturnUrl / buildPassportCallbacks', () => {
    it('builds a same-origin callback carrying the attempt id and outcome', () => {
      const url = new URL(buildPassportReturnUrl(APP_ORIGIN, ATTEMPT_ID, 'error'));

      expect(url.origin).toBe(APP_ORIGIN);
      expect(url.pathname).toBe('/passport/return');
      expect(url.searchParams.get('attempt')).toBe(ATTEMPT_ID);
      expect(url.searchParams.get('outcome')).toBe('error');
    });

    it('produces success, error and cancel callbacks on one origin plus the x-source label', () => {
      const callbacks = buildPassportCallbacks(APP_ORIGIN, ATTEMPT_ID);

      expect(callbacks.xSource).toBe(PASSPORT_X_SOURCE);
      const origins = new Set(
        [callbacks.xSuccess, callbacks.xError, callbacks.xCancel].map((value) => new URL(value ?? '').origin),
      );
      expect(origins).toEqual(new Set([APP_ORIGIN]));
      expect(new URL(callbacks.xSuccess ?? '').searchParams.get('outcome')).toBe('success');
      expect(new URL(callbacks.xError ?? '').searchParams.get('outcome')).toBe('error');
      expect(new URL(callbacks.xCancel ?? '').searchParams.get('outcome')).toBe('cancel');
      expect(new URL(callbacks.xCancel ?? '').searchParams.get('attempt')).toBe(ATTEMPT_ID);
    });
  });

  describe('isPassportOutcome', () => {
    it.each(['success', 'error', 'cancel'])('accepts %s', (value) => {
      expect(isPassportOutcome(value)).toBe(true);
    });

    it.each(['ok', '', null, undefined, 1, {}])('rejects %s', (value) => {
      expect(isPassportOutcome(value)).toBe(false);
    });
  });

  describe('parsePassportOutcomeMessage', () => {
    const validData = {
      type: PASSPORT_OUTCOME_MESSAGE_TYPE,
      version: PASSPORT_MESSAGE_VERSION,
      outcome: 'success',
      messageId: 'msg-1',
    };

    it('accepts a well-formed outcome from the Passport origin and popup source', () => {
      expect(
        parsePassportOutcomeMessage(
          { origin: PASSPORT_ORIGIN, source: popup, data: validData },
          popup,
          PASSPORT_ORIGIN,
        ),
      ).toEqual({ outcome: 'success', messageId: 'msg-1' });
    });

    it('rejects a wrong origin', () => {
      expect(
        parsePassportOutcomeMessage({ origin: APP_ORIGIN, source: popup, data: validData }, popup, PASSPORT_ORIGIN),
      ).toBeNull();
    });

    it('rejects a source other than the popup', () => {
      expect(
        parsePassportOutcomeMessage(
          { origin: PASSPORT_ORIGIN, source: otherWindow, data: validData },
          popup,
          PASSPORT_ORIGIN,
        ),
      ).toBeNull();
    });

    it('rejects when there is no popup to match against', () => {
      expect(
        parsePassportOutcomeMessage({ origin: PASSPORT_ORIGIN, source: null, data: validData }, null, PASSPORT_ORIGIN),
      ).toBeNull();
    });

    it.each([
      ['wrong type', { ...validData, type: 'other' }],
      ['wrong version', { ...validData, version: 2 }],
      ['unknown outcome', { ...validData, outcome: 'done' }],
      ['missing messageId', { ...validData, messageId: undefined }],
      ['empty messageId', { ...validData, messageId: '' }],
      ['non-string messageId', { ...validData, messageId: 7 }],
      ['non-object data', 'success'],
      ['array data', [validData]],
      ['null data', null],
    ])('rejects %s', (_label, data) => {
      expect(
        parsePassportOutcomeMessage({ origin: PASSPORT_ORIGIN, source: popup, data }, popup, PASSPORT_ORIGIN),
      ).toBeNull();
    });
  });

  describe('parsePassportReturnMessage', () => {
    const validData = { type: PASSPORT_RETURN_MESSAGE_TYPE, attemptId: ATTEMPT_ID, outcome: 'cancel' };

    it('accepts a same-origin message from the popup for the current attempt', () => {
      expect(
        parsePassportReturnMessage(
          { origin: APP_ORIGIN, source: popup, data: validData },
          popup,
          APP_ORIGIN,
          ATTEMPT_ID,
        ),
      ).toEqual({ attemptId: ATTEMPT_ID, outcome: 'cancel' });
    });

    it('rejects a wrong origin', () => {
      expect(
        parsePassportReturnMessage(
          { origin: PASSPORT_ORIGIN, source: popup, data: validData },
          popup,
          APP_ORIGIN,
          ATTEMPT_ID,
        ),
      ).toBeNull();
    });

    it('rejects a source other than the popup', () => {
      expect(
        parsePassportReturnMessage(
          { origin: APP_ORIGIN, source: otherWindow, data: validData },
          popup,
          APP_ORIGIN,
          ATTEMPT_ID,
        ),
      ).toBeNull();
    });

    it('rejects a different attempt id', () => {
      expect(
        parsePassportReturnMessage({ origin: APP_ORIGIN, source: popup, data: validData }, popup, APP_ORIGIN, 'other'),
      ).toBeNull();
    });

    it.each([
      ['wrong type', { ...validData, type: PASSPORT_OUTCOME_MESSAGE_TYPE }],
      ['unknown outcome', { ...validData, outcome: 'ok' }],
      ['missing outcome', { type: PASSPORT_RETURN_MESSAGE_TYPE, attemptId: ATTEMPT_ID }],
      ['non-string attemptId', { ...validData, attemptId: 1234 }],
      ['non-object data', 'cancel'],
    ])('rejects %s', (_label, data) => {
      expect(
        parsePassportReturnMessage({ origin: APP_ORIGIN, source: popup, data }, popup, APP_ORIGIN, ATTEMPT_ID),
      ).toBeNull();
    });
  });

  describe('buildPassportOutcomeAck / buildPassportReturnPostMessage', () => {
    it('builds the acknowledgement for a message id', () => {
      expect(buildPassportOutcomeAck('msg-9')).toEqual({
        type: PASSPORT_ACK_MESSAGE_TYPE,
        version: PASSPORT_MESSAGE_VERSION,
        messageId: 'msg-9',
      });
    });

    it('builds the callback page post message', () => {
      expect(buildPassportReturnPostMessage(ATTEMPT_ID, 'success')).toEqual({
        type: PASSPORT_RETURN_MESSAGE_TYPE,
        attemptId: ATTEMPT_ID,
        outcome: 'success',
      });
    });
  });

  describe('parsePassportReturnQuery', () => {
    it('reads attempt and outcome from the callback query string', () => {
      expect(parsePassportReturnQuery(`?attempt=${ATTEMPT_ID}&outcome=success`)).toEqual({
        attemptId: ATTEMPT_ID,
        outcome: 'success',
      });
    });

    it.each(['', '?attempt=a', '?outcome=success', `?attempt=${ATTEMPT_ID}&outcome=nope`, '?attempt=&outcome=success'])(
      'returns null for %s',
      (search) => {
        expect(parsePassportReturnQuery(search)).toBeNull();
      },
    );
  });
});
