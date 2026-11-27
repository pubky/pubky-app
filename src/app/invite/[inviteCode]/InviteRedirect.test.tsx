import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InviteRedirect } from './InviteRedirect';

const { mockReplace } = vi.hoisted(() => ({ mockReplace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/invite/abcd-efgh-ijkl',
  useRouter: () => ({ replace: mockReplace }),
}));

describe('InviteRedirect', () => {
  it('sends the invite path to the install step with the formatted code', () => {
    render(<InviteRedirect />);

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/install?inviteCode=ABCD-EFGH-IJKL');
  });
});
