import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { ProfileHoverCard } from './ProfileHoverCard';

// The shared popover content pulls in the full reactive user data stack;
// stub it, the card's job is anchoring and wiring props through.
vi.mock('@/molecules/UserInfoPopover/components/UserInfoPopoverContent/UserInfoPopoverContent', () => ({
  UserInfoPopoverContent: ({ userId, userName }: { userId: string; userName: string }) => (
    <div data-testid="user-info-popover-content">
      {userId}:{userName}
    </div>
  ),
}));

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy' as Pubky;

function Harness({ open, userName }: { open: boolean; userName?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <ProfileHoverCard pubky={PUBKY} userName={userName} open={open} x={40} y={60} />
    </div>
  );
}

describe('ProfileHoverCard', () => {
  it('renders the shared user info content anchored to the canvas point', () => {
    render(<Harness open userName="Alice" />);

    expect(document.querySelector('[data-cy="graph-hover-card"]')).toBeInTheDocument();
    expect(screen.getByTestId('user-info-popover-content')).toHaveTextContent(`${PUBKY}:Alice`);
  });

  it('falls back to the formatted public key as the display name', () => {
    render(<Harness open />);

    expect(screen.getByTestId('user-info-popover-content')).toHaveTextContent(/o1gg.*\.\.\./);
  });

  it('renders nothing when closed', () => {
    render(<Harness open={false} />);

    expect(document.querySelector('[data-cy="graph-hover-card"]')).not.toBeInTheDocument();
  });
});
