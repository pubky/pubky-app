import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PopoverSocialGraph } from './PopoverSocialGraph';

// jsdom reports touch support, which would disable the Popover atom's hover mode and hide
// its focus-stealing behaviour; pin a pointer device so keyboard access is really exercised.
vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({
  useIsTouchDevice: () => false,
}));

describe('PopoverSocialGraph', () => {
  it('renders a help trigger button', () => {
    render(<PopoverSocialGraph />);

    const trigger = screen.getByRole('button', { name: 'About social graph status' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('data-slot', 'popover-trigger');
    expect(trigger).toHaveClass('size-8');
    expect(screen.getByTestId('circle-help-icon')).toBeInTheDocument();
  });

  it('shows the explanation copy when opened', () => {
    render(<PopoverSocialGraph />);

    fireEvent.click(screen.getByRole('button', { name: 'About social graph status' }));

    expect(screen.getByText('Social Graph Status')).toBeInTheDocument();
    expect(screen.getByText(/Shows how established an account is in Pubky's follow graph/)).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Networked')).toBeInTheDocument();
    expect(screen.getByText('Established')).toBeInTheDocument();
    expect(
      screen.getByText('This is not an endorsement or guarantee that an account is trustworthy.'),
    ).toBeInTheDocument();
  });

  it('keeps keyboard focus on the trigger and opens with Enter', async () => {
    const user = userEvent.setup();
    render(<PopoverSocialGraph />);

    await user.tab();
    const trigger = screen.getByRole('button', { name: 'About social graph status' });
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(screen.getByText('Social Graph Status')).toBeInTheDocument();
  });

  it('merges a custom className onto the trigger', () => {
    render(<PopoverSocialGraph className="custom-class" />);

    expect(screen.getByRole('button', { name: 'About social graph status' })).toHaveClass('custom-class');
  });
});

describe('PopoverSocialGraph - Snapshots', () => {
  it('matches snapshot when closed', () => {
    const { container } = render(<PopoverSocialGraph />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when open', () => {
    render(<PopoverSocialGraph />);
    fireEvent.click(screen.getByRole('button', { name: 'About social graph status' }));
    expect(screen.getByTestId('popover-content')).toMatchSnapshot();
  });
});
