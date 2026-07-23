import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HumanFooter } from './HumanFooter';

// Mock organisms
vi.mock('@/organisms/DialogAge/DialogAge', () => {
  return {
    DialogAge: () => <span data-testid="dialog-age">over 18 years old.</span>,
  };
});

vi.mock('@/organisms/DialogPrivacy/DialogPrivacy', () => {
  return {
    DialogPrivacy: () => <span data-testid="dialog-privacy">Privacy Policy</span>,
  };
});

vi.mock('@/organisms/DialogTerms/DialogTerms', () => {
  return {
    DialogTerms: () => <span data-testid="dialog-terms">Terms of Service</span>,
  };
});

// Mock config
vi.mock('@/config/externalLinks', () => ({
  PUBKY_CORE_URL: 'https://pubky.core',
  getPubkyCoreLink: () => 'https://pubky.core',
}));

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/FooterLinks/FooterLinks', () => {
  return {
    FooterLinks: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="footer-links" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({ children, href, target }: { children: React.ReactNode; href: string; target?: string }) => (
      <a data-testid="link" href={href} target={target}>
        {children}
      </a>
    ),
  };
});

describe('HumanFooter', () => {
  it('renders the footer text with Pubky brand highlight', () => {
    render(<HumanFooter />);

    expect(screen.getByText('Pubky')).toHaveClass('text-brand');
    expect(screen.getByText(/By creating a/i)).toBeInTheDocument();
  });

  it('renders the terms and privacy dialogs', () => {
    render(<HumanFooter />);

    expect(screen.getByTestId('dialog-terms')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-privacy')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-age')).toBeInTheDocument();
  });

  it('renders the Pubky Core link', () => {
    render(<HumanFooter />);

    const pubkyCoreLink = screen.getByText('Pubky Core');
    expect(pubkyCoreLink).toBeInTheDocument();
    expect(pubkyCoreLink.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('renders the company information', () => {
    render(<HumanFooter />);

    expect(screen.getByText(/Synonym Software, S\.A\. DE C\.V\./)).toBeInTheDocument();
    expect(screen.getByText(/©2026\. All rights reserved\./)).toBeInTheDocument();
  });

  it('renders two separate footer link sections', () => {
    render(<HumanFooter />);

    const footerLinks = screen.getAllByTestId('footer-links');
    expect(footerLinks).toHaveLength(2);
  });

  it('matches snapshot', () => {
    const { container } = render(<HumanFooter />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
