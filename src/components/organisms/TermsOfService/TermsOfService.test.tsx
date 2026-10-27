import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TermsOfService } from './TermsOfService';

describe('TermsOfService', () => {
  it('renders the title and the effective date', () => {
    render(<TermsOfService />);

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText('Effective Date: October 22, 2026')).toBeInTheDocument();
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
      '12. PUBKY SHOP AND PUBKY MARKET',
      '13. THIRD-PARTY MATERIALS',
      '14. PUBLISHING AND DISTRIBUTION OF CONTENT VIA THE PLATFORM',
      '15. PROHIBITED USES',
      '16. NO REPRESENTATION BY SYNONYM',
      '17. PUBKY IS A PROGRESSIVE WEB APPLICATION',
      '18. TAX',
      '19. RESPONSIBILITIES, LIMITATION OF LIABILITY AND INDEMNITY',
      '20. FORCE MAJEURE',
      '21. MANDATORY RESOLUTION OF DISPUTES THROUGH ARBITRATION',
      '22. JURY TRIAL WAIVER',
      '23. DEFINITIONS',
      '24. MISCELLANEOUS',
    ]);
  });

  it('turns the lead-ins into numbered subsection headings', () => {
    render(<TermsOfService />);

    expect(screen.getByRole('heading', { level: 3, name: '3.1 User Identity Requirements' })).toHaveAttribute(
      'id',
      'user-identity-requirements',
    );
    expect(screen.getByRole('heading', { level: 3, name: '12.2 What Pubky Market is' })).toHaveAttribute(
      'id',
      'what-pubky-market-is',
    );
    expect(screen.getByRole('heading', { level: 3, name: '21.4 Class Action Waiver' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '24.1 Governing law' })).toBeInTheDocument();
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

describe('TermsOfService - regional availability', () => {
  it('limits the EU, the UK and the US to commerce features, not the whole Platform', () => {
    const { container } = render(<TermsOfService />);
    const text = container.textContent ?? '';

    expect(text).toMatch(
      /Buying, selling, and paid unlocks of digital content \(together, “commerce features”\) are not available in the European Union \(including each EU Member State\), the United Kingdom, or the United States\./,
    );
    expect(text).toContain(
      'It applies to commerce features only: the rest of the Platform remains available in those places.',
    );
    expect(text).toContain('We reserve the right to restrict access to specific features based on your location.');
  });

  it('keeps Prohibited Jurisdiction to the sanctions list plus Russia and Belarus', () => {
    const { container } = render(<TermsOfService />);
    const definition = Array.from(container.querySelectorAll('li')).find((li) =>
      li.textContent?.startsWith('“Prohibited Jurisdiction” means'),
    );

    expect(definition?.textContent).toBe(
      '“Prohibited Jurisdiction” means any of: Cuba, Democratic People’s Republic of Korea (North Korea), Iran, Syria, Russia, Belarus, Crimea (a region of Ukraine annexed by the Russian Federation), the self-proclaimed Donetsk People’s Republic (a region of Ukraine) and the self-proclaimed Luhansk People’s Republic (a region of Ukraine);',
    );
    expect(container.textContent).toContain(
      'The Platform is not available to users in Prohibited Jurisdictions as defined below.',
    );
    expect(container.textContent).toContain(
      'you agree to not access the Platform from Prohibited Jurisdictions as defined herein.',
    );
  });

  it('describes the Shop without Stripe', () => {
    const { container } = render(<TermsOfService />);
    const text = container.textContent ?? '';

    expect(screen.getByRole('heading', { level: 2, name: '12. PUBKY SHOP AND PUBKY MARKET' })).toHaveAttribute(
      'id',
      'pubky-shop',
    );
    expect(text).toContain('We are not the PayPal merchant of record for the sale.');
    expect(text).toContain('PayPal, Bitkit, and similar tools are Third-Party Materials.');
    expect(text).not.toMatch(/stripe/i);
  });

  it('names the product Pubky Market, never Pubky Marketplace', () => {
    const { container } = render(<TermsOfService />);
    const text = container.textContent ?? '';

    expect(text).toContain('Pubky Market is the name we use for commerce on Pubky.');
    expect(text).toContain('"Pubky Market" means the concept of commerce among Pubky identities.');
    expect(text).toContain('Pubky Market is not a separate product or a second set of Terms.');
    expect(text).not.toMatch(/Pubky Marketplace/i);
  });
});
