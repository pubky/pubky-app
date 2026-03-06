import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { HumanFooter } from './HumanFooter';

// Mock organisms
vi.mock('@/organisms', () => ({
  DialogTerms: () => <span data-testid="dialog-terms">Terms of Service</span>,
  DialogPrivacy: () => <span data-testid="dialog-privacy">Privacy Policy</span>,
  DialogAge: () => <span data-testid="dialog-age">over 18 years old.</span>,
}));

// Mock libs
vi.mock('@/libs', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// Mock config
vi.mock('@/config', () => ({
  PUBKY_CORE_URL: 'https://pubky.core',
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  FooterLinks: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="footer-links" className={className}>
      {children}
    </div>
  ),
  Link: ({ children, href, target }: { children: React.ReactNode; href: string; target?: string }) => (
    <a data-testid="link" href={href} target={target}>
      {children}
    </a>
  ),
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

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
