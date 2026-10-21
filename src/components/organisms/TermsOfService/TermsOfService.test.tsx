import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TermsOfService } from './TermsOfService';

describe('TermsOfService', () => {
  it('renders the title and the effective date', () => {
    render(<TermsOfService />);

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText('Effective Date: January 29, 2026')).toBeInTheDocument();
  });

  it('turns the all-caps lead lines into numbered section headings after the unnumbered preamble', () => {
    render(<TermsOfService />);

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'TERMS AND CONDITIONS',
      '1. INTRODUCTION',
      '2. ACCEPTANCE OF THESE TERMS AND CONDITIONS THROUGH USE',
      '3. REQUIREMENTS TO USE THE PLATFORM',
      '4. CRYPTOGRAPHIC KEYS AND ACCOUNT RECOVERY',
      '5. HUMAN VERIFICATION',
      '6. REGIONAL AVAILABILITY',
      '7. COMMUNITY GUIDELINES',
      '8. COMPLAINT PROCEDURE',
      '9. COMPLIANCE WITH APPLICABLE LAW',
      '10. PRIVACY POLICY',
      '11. INTELLECTUAL PROPERTY',
      '12. THIRD-PARTY MATERIALS',
      '13. PUBLISHING AND DISTRIBUTION OF CONTENT VIA THE PLATFORM',
      '14. PROHIBITED USES',
      '15. NO REPRESENTATION BY SYNONYM',
      '16. PUBKY IS A PROGRESSIVE WEB APPLICATION',
      '17. TAX',
      '18. RESPONSIBILITIES, LIMITATION OF LIABILITY AND INDEMNITY',
      '19. FORCE MAJEURE',
      '20. MANDATORY RESOLUTION OF DISPUTES THROUGH ARBITRATION',
      '21. JURY TRIAL WAIVER',
      '22. DEFINITIONS',
      '23. MISCELLANEOUS',
    ]);
  });

  it('turns the lead-ins into numbered subsection headings', () => {
    render(<TermsOfService />);

    expect(screen.getByRole('heading', { level: 3, name: '3.1 User Identity Requirements' })).toHaveAttribute(
      'id',
      'user-identity-requirements',
    );
    expect(screen.getByRole('heading', { level: 3, name: '20.4 Class Action Waiver' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '23.1 Governing law' })).toBeInTheDocument();
  });

  it('keeps the text as written, including the legal entity', () => {
    render(<TermsOfService />);

    expect(screen.getByText(/Thank you for using the Pubky platform/)).toBeInTheDocument();
    expect(screen.getByText(/PLEASE REVIEW THE ARBITRATION PROVISION SET FORTH BELOW CAREFULLY/)).toBeInTheDocument();
    expect(
      screen.getByText(/not sharing your private keys or recovery phase with any third party/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You must not be a convicted sex offender;/)).toBeInTheDocument();
    expect(screen.getByText(/a company operating under the laws of the Republic of El Salvador/)).toHaveTextContent(
      'Synonym Software, S.A. de C.V.',
    );
  });

  it('keeps the contact emails and points the Privacy Policy links at the new page', () => {
    render(<TermsOfService />);

    expect(screen.getByRole('link', { name: 'info@synonym.to' })).toHaveAttribute('href', 'mailto:info@synonym.to');
    expect(screen.getByRole('link', { name: 'report@synonym.to' })).toHaveAttribute('href', 'mailto:report@synonym.to');
    expect(screen.getByRole('link', { name: 'https://pubky.app/privacy' })).toHaveAttribute('href', '/privacy-policy');
    for (const link of screen.getAllByRole('link', { name: 'Privacy Policy' })) {
      expect(link).toHaveAttribute('href', '/privacy-policy');
    }
    expect(screen.getByRole('link', { name: 'Counter Notification' })).toHaveAttribute('href', '/copyright');
  });

  it('keeps the community guidelines as a list with its nested list', () => {
    render(<TermsOfService />);

    const nested = screen.getByText(/Promotes, supports, or incites violence or unlawful acts;/).closest('ul');
    expect(nested?.parentElement?.closest('ul')).toBeInTheDocument();
  });
});
