import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LEGAL_ROUTES } from '@/app/routes';
import { HumanFooter } from './HumanFooter';

// Mock organisms
vi.mock('@/organisms/DialogAge/DialogAge', () => {
  return {
    DialogAge: () => <span data-testid="dialog-age">over 18 years old.</span>,
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
  it('renders the footer text without the brand highlight', () => {
    const { container } = render(<HumanFooter />);

    expect(screen.getByText(/By creating a Pubky account/i)).toBeInTheDocument();
    expect(container.querySelector('.text-brand')).toBeNull();
  });

  it('opens the Terms of Service and Privacy Policy in a new tab so the sign-up step is kept', () => {
    render(<HumanFooter />);

    const terms = screen.getByRole('link', { name: 'Terms of Service' });
    expect(terms).toHaveAttribute('href', LEGAL_ROUTES.TERMS_OF_USE);
    expect(terms).toHaveAttribute('target', '_blank');
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(privacy).toHaveAttribute('href', LEGAL_ROUTES.PRIVACY_POLICY);
    expect(privacy).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('dialog-age')).toBeInTheDocument();
  });

  it('keeps the Terms of Service and Privacy Policy links without an underline, like the age confirmation beside them', () => {
    render(<HumanFooter />);

    const [legalLinks, coreLinks] = screen.getAllByTestId('footer-links');
    expect(legalLinks).toHaveClass('[&_a]:no-underline');
    expect(coreLinks).not.toHaveClass('[&_a]:no-underline');
  });

  it('renders the Pubky Core link', () => {
    render(<HumanFooter />);

    const pubkyCoreLink = screen.getByText('Pubky Core');
    expect(pubkyCoreLink).toBeInTheDocument();
    expect(pubkyCoreLink.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('renders the company information', () => {
    render(<HumanFooter />);

    expect(screen.getByText(/Synonym Software, S\.A\. de C\.V\./)).toBeInTheDocument();
    expect(screen.getByText(/©2026\. All rights reserved\./)).toBeInTheDocument();
  });

  it('renders two separate footer link sections', () => {
    render(<HumanFooter />);

    const footerLinks = screen.getAllByTestId('footer-links');
    expect(footerLinks).toHaveLength(2);
  });
});
