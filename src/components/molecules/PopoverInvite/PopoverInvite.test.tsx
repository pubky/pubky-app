import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getEmailLink, getTelegramLink, getTwitterLink } from '@/config/externalLinks';
import { PopoverInvite } from './PopoverInvite';

describe('InvitePopover', () => {
  it('renders trigger button with gift icon', () => {
    render(<PopoverInvite />);

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(document.querySelector('.lucide-gift')).toBeInTheDocument();
  });

  it('shows popover content when clicked', () => {
    render(<PopoverInvite />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(screen.getByText("Don't have an invite yet?")).toBeInTheDocument();
    expect(screen.getByText('Ask the Pubky team!')).toBeInTheDocument();
  });

  it('renders social contact links in popover', () => {
    render(<PopoverInvite />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(document.querySelector('.lucide-mail')).toBeInTheDocument();
    expect(document.querySelector('.lucide-x-twitter')).toBeInTheDocument();
    expect(document.querySelector('.lucide-telegram')).toBeInTheDocument();
    // Icons are now actual lucide-react components (SVGs), verify links instead
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(3);
  });

  it('uses default URLs', () => {
    render(<PopoverInvite />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Icons are now actual lucide-react components (SVGs), find links by href
    const links = screen.getAllByRole('link');
    const emailUrl = getEmailLink();
    const twitterUrl = getTwitterLink();
    const telegramUrl = getTelegramLink();
    const mailLink = links.find((link) => link.getAttribute('href') === emailUrl);
    const twitterLink = links.find((link) => link.getAttribute('href') === twitterUrl);
    const telegramLink = links.find((link) => link.getAttribute('href') === telegramUrl);

    expect(mailLink).toHaveAttribute('href', emailUrl);
    expect(twitterLink).toHaveAttribute('href', twitterUrl);
    expect(telegramLink).toHaveAttribute('href', telegramUrl);
  });

  it('has proper popover content structure', () => {
    render(<PopoverInvite />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Check the popover content structure
    const heading = screen.getByText("Don't have an invite yet?");
    const description = screen.getByText('Ask the Pubky team!');

    // Check that the components are rendered
    expect(heading).toBeInTheDocument();
    expect(description).toBeInTheDocument();
  });
});

// Note: snapshot cannot capture entire popover content, so the above unit tests are more important
describe('PopoverInvite - Snapshots', () => {
  it('matches snapshot for default PopoverInvite', () => {
    const { container } = render(<PopoverInvite />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for PopoverInvite with custom className', () => {
    const { container } = render(<PopoverInvite className="custom-invite-style" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
