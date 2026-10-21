import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LegalDocument, LegalLink, LegalList, LegalParagraph } from './LegalDocument';
import type { LegalSection } from './LegalDocument.types';

const SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    title: 'SCOPE',
    content: <LegalParagraph>Scope text.</LegalParagraph>,
  },
  {
    id: 'choices',
    title: 'CHOICES',
    content: <LegalParagraph>Choices intro.</LegalParagraph>,
    subsections: [
      { id: 'sms', title: 'SMS Messages', content: <LegalParagraph>SMS text.</LegalParagraph> },
      { id: 'cookies', title: 'Cookies', content: <LegalParagraph>Cookie text.</LegalParagraph> },
    ],
  },
];

function renderDocument() {
  return render(
    <LegalDocument
      title="Privacy Policy"
      effectiveDate="January 29, 2026"
      preamble={{ id: 'opening', title: 'OPENING', content: <LegalParagraph>Opening text.</LegalParagraph> }}
      sections={SECTIONS}
    />,
  );
}

describe('LegalDocument', () => {
  it('renders the title as the page heading and the effective date under it', () => {
    renderDocument();

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText('Effective Date: January 29, 2026')).toBeInTheDocument();
  });

  it('numbers sections as h2 and subsections as h3, each with its own anchor', () => {
    renderDocument();

    expect(screen.getByRole('heading', { level: 2, name: '1. SCOPE' })).toHaveAttribute('id', 'scope');
    expect(screen.getByRole('heading', { level: 2, name: '2. CHOICES' })).toHaveAttribute('id', 'choices');
    expect(screen.getByRole('heading', { level: 3, name: '2.1 SMS Messages' })).toHaveAttribute('id', 'sms');
    expect(screen.getByRole('heading', { level: 3, name: '2.2 Cookies' })).toHaveAttribute('id', 'cookies');
  });

  it('labels each section region by its heading', () => {
    renderDocument();

    const choices = screen.getByRole('region', { name: '2. CHOICES' });
    expect(within(choices).getByText('Choices intro.')).toBeInTheDocument();
    expect(within(choices).getByRole('region', { name: '2.1 SMS Messages' })).toHaveTextContent('SMS text.');
  });

  it('renders the preamble as an unnumbered section before section 1, outside the contents', () => {
    renderDocument();

    const preamble = screen.getByRole('heading', { level: 2, name: 'OPENING' });
    expect(preamble).toHaveAttribute('id', 'opening');
    expect(preamble.compareDocumentPosition(screen.getByRole('heading', { name: '1. SCOPE' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByRole('link', { name: /OPENING/ })).not.toBeInTheDocument();
  });

  it('links every numbered section from the contents sidebar', () => {
    renderDocument();

    const contents = screen.getByRole('navigation', { name: 'Contents' });
    const links = within(contents).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['1. SCOPE', '#scope'],
      ['2. CHOICES', '#choices'],
    ]);
  });

  it('keeps the narrow-screen contents list collapsed until its button is pressed', async () => {
    const user = userEvent.setup();
    renderDocument();

    const toggle = screen.getByRole('button', { name: 'Contents' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('navigation', { name: 'Contents' })).toHaveLength(1);

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const [collapsible] = screen.getAllByRole('navigation', { name: 'Contents' });
    expect(within(collapsible).getByRole('link', { name: '2. CHOICES' })).toHaveAttribute('href', '#choices');
  });
});

describe('LegalParagraph', () => {
  it('renders body text, italic only when asked', () => {
    render(
      <>
        <LegalParagraph>Plain</LegalParagraph>
        <LegalParagraph italic>Intro</LegalParagraph>
      </>,
    );

    expect(screen.getByText('Plain')).not.toHaveClass('italic');
    expect(screen.getByText('Intro')).toHaveClass('italic', 'text-muted-foreground');
  });
});

describe('LegalList', () => {
  it('renders a bulleted list', () => {
    render(
      <LegalList>
        <li>First</li>
      </LegalList>,
    );

    expect(screen.getByRole('list')).toHaveClass('list-disc');
    expect(screen.getByRole('listitem')).toHaveTextContent('First');
  });
});

describe('LegalLink', () => {
  it('sizes the link like the paragraph around it', () => {
    render(<LegalLink href="mailto:privacy@synonym.to">privacy@synonym.to</LegalLink>);

    const link = screen.getByRole('link', { name: 'privacy@synonym.to' });
    expect(link).toHaveAttribute('href', 'mailto:privacy@synonym.to');
    expect(link).toHaveClass('text-base');
    expect(link).not.toHaveClass('text-sm');
  });
});
