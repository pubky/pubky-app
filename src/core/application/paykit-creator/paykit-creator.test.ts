import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextJsPaykitCreatorService } from '@/services/nextjs/paykit-creator/paykit-creator';
import { MOCK_LOCK_AUTHOR_PUBKY } from '@/test-utils/locks';
import { PaykitCreatorApplication } from './paykit-creator';

const params = { creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}`, returnTo: 'https://pubky.app' };

describe('PaykitCreatorApplication.isCreatorHeld', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([true, false])('returns the service answer %s', async (held) => {
    vi.spyOn(NextJsPaykitCreatorService, 'isCreatorHeld').mockResolvedValue(held);

    await expect(PaykitCreatorApplication.isCreatorHeld(params)).resolves.toBe(held);
    expect(NextJsPaykitCreatorService.isCreatorHeld).toHaveBeenCalledWith(params);
  });

  it('lets a service failure through', async () => {
    vi.spyOn(NextJsPaykitCreatorService, 'isCreatorHeld').mockRejectedValue(new Error('Paykit down'));

    await expect(PaykitCreatorApplication.isCreatorHeld(params)).rejects.toThrow('Paykit down');
  });
});
