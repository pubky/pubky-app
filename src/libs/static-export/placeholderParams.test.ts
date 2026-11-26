import { afterEach, describe, expect, it, vi } from 'vitest';

describe('placeholderParams', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('generates no page in a server build', async () => {
    const { placeholderParams } = await import('./placeholderParams');
    expect(placeholderParams('userId', 'postId')).toEqual([]);
  });

  it('generates one placeholder page in the static export', async () => {
    vi.stubEnv('NEXT_PUBLIC_STATIC_EXPORT', 'true');
    const { placeholderParams } = await import('./placeholderParams');
    expect(placeholderParams('userId', 'postId')).toEqual([{ userId: '_', postId: '_' }]);
  });
});
