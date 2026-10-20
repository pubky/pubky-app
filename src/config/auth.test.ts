import { describe, expect, it } from 'vitest';
import { SHOP_CAPABILITIES } from '@/config/auth';

describe('SHOP_CAPABILITIES', () => {
  it('pins the shared five-scope App/Shop contract without access to other Chat versions', () => {
    expect(SHOP_CAPABILITIES).toEqual([
      '/pub/pubky.app/:rw',
      '/pub/paykit/:rw',
      '/priv/pubky.app/:rw',
      '/pub/chat/v0/:rw',
      '/priv/chat/v0/:rw',
    ]);
  });
});
