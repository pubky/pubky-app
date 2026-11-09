import { describe, expect, it } from 'vitest';
import { HttpStatusCode } from '@/libs/http/http.types';
import { MOCK_LOCK_AUTHOR_PUBKY } from '@/test-utils/locks';
import { PaykitCreatorValidators } from './paykit-creator.validators';

describe('PaykitCreatorValidators.validateSafe', () => {
  it('passes a prefixed creator through in its canonical form', () => {
    expect(PaykitCreatorValidators.validateSafe(`pubky${MOCK_LOCK_AUTHOR_PUBKY}`)).toEqual({
      ok: true,
      creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}`,
    });
  });

  it('adds the pubky prefix to a bare creator, the only form /setup/creator-held parses', () => {
    expect(PaykitCreatorValidators.validateSafe(MOCK_LOCK_AUTHOR_PUBKY)).toMatchObject({
      ok: true,
      creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}`,
    });
  });

  it.each([`pubkyb${'o'.repeat(46)}`, `pubkypubkyb${'o'.repeat(46)}`])(
    'keeps a raw key that itself starts with pubky whole, as %j',
    (creator) => {
      expect(PaykitCreatorValidators.validateSafe(creator)).toEqual({
        ok: true,
        creator: `pubkypubkyb${'o'.repeat(46)}`,
      });
    },
  );

  it.each([null, '', 'pubky', 'not-a-pubky', `${MOCK_LOCK_AUTHOR_PUBKY}x`, MOCK_LOCK_AUTHOR_PUBKY.toUpperCase()])(
    'rejects the creator %j',
    (creator) => {
      expect(PaykitCreatorValidators.validateSafe(creator)).toEqual({
        ok: false,
        message: 'Invalid creator',
        statusCode: HttpStatusCode.BAD_REQUEST,
      });
    },
  );
});
