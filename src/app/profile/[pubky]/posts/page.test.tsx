import { redirect } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import DynamicProfilePostsPage from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('DynamicProfilePostsPage', () => {
  it('redirects the legacy posts route to the canonical profile route', async () => {
    await DynamicProfilePostsPage({
      params: Promise.resolve({
        pubky: 'user123',
      }),
    });

    expect(redirect).toHaveBeenCalledWith('/profile/user123');
  });
});
