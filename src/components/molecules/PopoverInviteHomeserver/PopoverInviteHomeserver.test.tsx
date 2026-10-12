import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getEmailLink, getTelegramLink, getTwitterLink } from '@/config/externalLinks';
import { PopoverInviteHomeserver } from './PopoverInviteHomeserver';

// The popover opens on hover, which the atom disables on touch devices.
vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({
  useIsTouchDevice: () => false,
}));

describe('PopoverInviteHomeserver', () => {
  it('renders a help trigger and keeps the content closed until hovered', () => {
    render(<PopoverInviteHomeserver />);

    expect(screen.getByTestId('circle-help-icon')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "Don't have an invite yet?" })).not.toBeInTheDocument();
  });

  it('shows the invite explanation and contact links on hover', () => {
    render(<PopoverInviteHomeserver />);

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(screen.getByRole('heading', { name: "Don't have an invite yet?" })).toBeInTheDocument();
    expect(screen.getByText(/Ask the Pubky team for your invite code/)).toBeInTheDocument();
    expect(screen.getByText(/A homeserver is a storage provider/)).toBeInTheDocument();

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([getEmailLink(), getTwitterLink(), getTelegramLink()]);
  });

  it('applies a default hover class to the trigger button', () => {
    render(<PopoverInviteHomeserver />);

    expect(screen.getByRole('button')).toHaveClass('hover:bg-brand/10');
  });

  it('replaces the default trigger class with className', () => {
    render(<PopoverInviteHomeserver className="custom-homeserver-style" />);

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveClass('custom-homeserver-style');
    expect(trigger).not.toHaveClass('hover:bg-brand/10');
  });
});
