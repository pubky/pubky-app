import { describe, expect, it } from 'vitest';
import { HttpStatusCode } from '@/libs/http/http.types';
import { MOCK_LOCK_AUTHOR_PUBKY } from '@/test-utils/locks';
import { PaykitCreatorValidators } from './paykit-creator.validators';

describe('PaykitCreatorValidators.validateSafe', () => {
  it('passes a prefixed creator through in its canonical form', () => {
    expect(PaykitCreatorValidators.validateSafe(`pubky${MOCK_LOCK_AUTHOR_PUBKY}`, 'https://pubky.app')).toEqual({
      ok: true,
      creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}`,
      returnTo: 'https://pubky.app',
    });
  });

  it('adds the pubky prefix to a bare creator, the only form /setup/reconnect parses', () => {
    expect(PaykitCreatorValidators.validateSafe(MOCK_LOCK_AUTHOR_PUBKY, 'https://pubky.app')).toMatchObject({
      ok: true,
      creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}`,
    });
  });

  it('reduces return_to to its origin', () => {
    expect(
      PaykitCreatorValidators.validateSafe(MOCK_LOCK_AUTHOR_PUBKY, 'http://localhost:3000/shop?x=1#y'),
    ).toMatchObject({ ok: true, returnTo: 'http://localhost:3000' });
  });

  it.each([null, '', 'pubky', 'not-a-pubky', `${MOCK_LOCK_AUTHOR_PUBKY}x`, MOCK_LOCK_AUTHOR_PUBKY.toUpperCase()])(
    'rejects the creator %j',
    (creator) => {
      expect(PaykitCreatorValidators.validateSafe(creator, 'https://pubky.app')).toEqual({
        ok: false,
        message: 'Invalid creator',
        statusCode: HttpStatusCode.BAD_REQUEST,
      });
    },
  );

  it.each([null, '', 'pubky.app', 'javascript:alert(1)', 'ftp://pubky.app', 'data:text/html,x'])(
    'rejects the return_to %j',
    (returnTo) => {
      expect(PaykitCreatorValidators.validateSafe(MOCK_LOCK_AUTHOR_PUBKY, returnTo)).toEqual({
        ok: false,
        message: 'Invalid return_to',
        statusCode: HttpStatusCode.BAD_REQUEST,
      });
    },
  );
});
