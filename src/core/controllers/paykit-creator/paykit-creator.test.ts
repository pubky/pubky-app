import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaykitCreatorApplication } from '@/application/paykit-creator/paykit-creator';
import { HttpStatusCode } from '@/libs/http/http.types';
import { MOCK_LOCK_AUTHOR_PUBKY } from '@/test-utils/locks';
import { PaykitCreatorController } from './paykit-creator';

describe('PaykitCreatorController.fetchCreatorHeld', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(PaykitCreatorApplication, 'isCreatorHeld').mockResolvedValue(true);
  });

  it('asks Paykit with the validated creator and origin, and returns its answer', async () => {
    const result = await PaykitCreatorController.fetchCreatorHeld({
      creator: MOCK_LOCK_AUTHOR_PUBKY,
      returnTo: 'https://pubky.app/some/path',
    });

    expect(result).toEqual({ ok: true, held: true });
    expect(PaykitCreatorApplication.isCreatorHeld).toHaveBeenCalledWith({
      creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}`,
      returnTo: 'https://pubky.app',
    });
  });

  it('returns a validation failure without asking Paykit', async () => {
    const result = await PaykitCreatorController.fetchCreatorHeld({ creator: 'nope', returnTo: 'https://pubky.app' });

    expect(result).toEqual({ ok: false, message: 'Invalid creator', statusCode: HttpStatusCode.BAD_REQUEST });
    expect(PaykitCreatorApplication.isCreatorHeld).not.toHaveBeenCalled();
  });

  it('lets a Paykit failure through for the route to report', async () => {
    vi.mocked(PaykitCreatorApplication.isCreatorHeld).mockRejectedValue(new Error('Paykit down'));

    await expect(
      PaykitCreatorController.fetchCreatorHeld({ creator: MOCK_LOCK_AUTHOR_PUBKY, returnTo: 'https://pubky.app' }),
    ).rejects.toThrow('Paykit down');
  });
});
