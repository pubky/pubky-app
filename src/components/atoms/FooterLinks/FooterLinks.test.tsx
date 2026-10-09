import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FooterLinks } from './FooterLinks';

describe('FooterLinks', () => {
  it('renders with default props', () => {
    render(<FooterLinks>Footer text</FooterLinks>);
    const footerLinks = screen.getByText('Footer text');
    expect(footerLinks).toBeInTheDocument();
  });

  it('renders muted text at full opacity and underlines nested links', () => {
    render(
      <FooterLinks>
        Footer text <a href="/privacy">Privacy</a>
      </FooterLinks>,
    );
    const footerLinks = screen.getByRole('link', { name: 'Privacy' }).closest('p');
    expect(footerLinks).toHaveClass('text-muted-foreground', '[&_a]:underline');
    expect(footerLinks).not.toHaveClass('opacity-80');
  });
});
