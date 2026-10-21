import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrivacyPolicy } from './PrivacyPolicy';

describe('PrivacyPolicy', () => {
  it('renders the title and the effective date', () => {
    render(<PrivacyPolicy />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText('Effective Date: January 29, 2026')).toBeInTheDocument();
  });

  it('turns the all-caps lead lines into numbered section headings', () => {
    render(<PrivacyPolicy />);

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '1. SCOPE',
      '2. POLICY SUMMARY',
      '3. NOTICE AT COLLECTION',
      '4. TYPES OF INFORMATION WE COLLECT',
      '5. LEGAL BASIS',
      '6. HOW WE COLLECT YOUR INFORMATION',
      '7. HOW WE USE YOUR INFORMATION',
      '8. HUMAN VERIFICATION',
      '9. HOW WE SHARE YOUR INFORMATION',
      '10. CHILDREN UNDER 18',
      '11. CHOICES REGARDING YOUR INFORMATION',
      '12. YOUR PRIVACY RIGHTS',
      '13. SECURITY',
      '14. STORAGE AND TRANSFER OF INFORMATION',
      '15. LINKS',
      '16. HOW TO CONTACT US',
      '17. CHANGES IN POLICY',
    ]);
  });

  it('turns the lead-ins into numbered subsection headings', () => {
    render(<PrivacyPolicy />);

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      '8.1 SMS Verification',
      '8.2 Lightning Payment Verification',
      '8.3 Invite Code Verification',
      '8.4 Local Storage',
      '11.1 SMS Messages',
      '11.2 Cookies & Other Tracking Technologies',
      '11.3 Our Do Not Track Policy',
    ]);
    expect(screen.getByRole('heading', { name: '11.1 SMS Messages' })).toHaveAttribute('id', 'sms-messages');
  });

  it('keeps the text as written, including the legal entity', () => {
    render(<PrivacyPolicy />);

    expect(screen.getByText(/This Privacy Policy \(“Policy“\) describes how/)).toHaveTextContent(
      'Synonym Software, S.A. de C.V.',
    );
    expect(
      screen.getByText(/We have not “sold” or “shared” personal information in the past 12 months/),
    ).toBeInTheDocument();
    expect(screen.getByText('Your phone number (stored in hashed form)')).toBeInTheDocument();
    expect(screen.getByText(/You may reply “HELP” if you need assistance or “STOP”/)).toBeInTheDocument();
  });

  it('keeps the privacy email and the external links', () => {
    render(<PrivacyPolicy />);

    for (const link of screen.getAllByRole('link', { name: /privacy@synonym\.to/ })) {
      expect(link).toHaveAttribute('href', 'mailto:privacy@synonym.to');
    }
    expect(screen.getByRole('link', { name: 'here' })).toHaveAttribute(
      'href',
      'https://www.consumer.ftc.gov/articles/0031-protecting-your-childs-privacy-online',
    );
    expect(screen.getByRole('link', { name: 'click here' })).toHaveAttribute('target', '_blank');
  });
});
