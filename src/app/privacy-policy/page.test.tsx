import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPolicyPage, { generateMetadata } from './page';

describe('PrivacyPolicyPage', () => {
  it('renders the Privacy Policy with its effective date, headings and text', () => {
    render(<PrivacyPolicyPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText('Effective Date: January 29, 2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '12. YOUR PRIVACY RIGHTS' })).toHaveAttribute(
      'id',
      'your-privacy-rights',
    );
    expect(screen.getByRole('heading', { level: 3, name: '8.2 Lightning Payment Verification' })).toBeInTheDocument();
    expect(screen.getByText(/Lightning payments are processed through our own infrastructure/)).toBeInTheDocument();
    expect(screen.getByText(/Please mark your inquiries “COPPA Information Request.”/)).toBeInTheDocument();
  });

  it('describes the page and makes it its own canonical URL', () => {
    const metadata = generateMetadata();

    expect(metadata.title).toBe('Privacy Policy - Pubky App');
    expect(metadata.description).toMatch(/^How Synonym collects, uses, shares and protects/);
    expect(metadata.alternates.canonical).toBe('/privacy-policy');
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
