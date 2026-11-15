import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { PubchiFlyoutHeader } from './PubchiFlyoutHeader';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const pubchi = {
  bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
  displayName: 'Scout',
  verified: true,
};

describe('PubchiFlyoutHeader', () => {
  beforeEach(() => {
    push.mockReset();
    usePubchiStore.getState().openFlyout();
  });

  it('re-renders the updated display name without remounting', () => {
    const { rerender } = render(<PubchiFlyoutHeader pubchi={pubchi} />);

    expect(screen.getByText('Scout')).toBeInTheDocument();
    rerender(<PubchiFlyoutHeader pubchi={{ ...pubchi, displayName: 'Scout III' }} />);

    expect(screen.queryByText('Scout')).not.toBeInTheDocument();
    expect(screen.getByText('Scout III')).toBeInTheDocument();
  });

  it('links the profile flyout action to the brain editor', () => {
    render(<PubchiFlyoutHeader pubchi={pubchi} />);

    const link = screen.getByRole('link', { name: /edit brain/i });
    expect(link).toHaveAttribute('href', '/pubchi/brain');
    fireEvent.click(link);
    expect(usePubchiStore.getState().flyout.open).toBe(false);
    expect(push).toHaveBeenCalledWith('/pubchi/brain');
  });

  it('shows a missed badge for undismissed proactive suggestions', () => {
    render(<PubchiFlyoutHeader pubchi={pubchi} missedCount={2} />);
    expect(screen.getByTestId('pubchi-missed-badge')).toHaveTextContent('2 missed');
  });
});
