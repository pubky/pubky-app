import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TermsOfUsePage, { generateMetadata } from './page';

describe('TermsOfUsePage', () => {
  it('renders the Terms of Service with its effective date, headings and text', () => {
    render(<TermsOfUsePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText('Effective Date: January 29, 2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'TERMS AND CONDITIONS' })).toHaveAttribute(
      'id',
      'terms-and-conditions',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: '20. MANDATORY RESOLUTION OF DISPUTES THROUGH ARBITRATION' }),
    ).toHaveAttribute('id', 'arbitration');
    expect(screen.getByRole('heading', { level: 3, name: '20.1 Covered Claims' })).toBeInTheDocument();
    expect(
      screen.getByText(/Your Pubky account is secured by cryptographic keys that only you control/),
    ).toBeInTheDocument();
    expect(screen.getByText(/The sole arbitrator must be a legal practitioner in London, England/)).toBeInTheDocument();
  });

  it('describes the page and makes it its own canonical URL', () => {
    const metadata = generateMetadata();

    expect(metadata.title).toBe('Terms of Service - Pubky App');
    expect(metadata.description).toMatch(/^The terms and conditions/);
    expect(metadata.alternates.canonical).toBe('/terms-of-use');
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
