import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FooterLinks } from './FooterLinks';

describe('FooterLinks', () => {
  it('renders with default props', () => {
    render(<FooterLinks>Footer text</FooterLinks>);
    const footerLinks = screen.getByText('Footer text');
    expect(footerLinks).toBeInTheDocument();
  });
});

describe('FooterLinks - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<FooterLinks>Footer text</FooterLinks>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<FooterLinks className="custom-footer">Custom footer</FooterLinks>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with simple text', () => {
    const { container } = render(<FooterLinks>Simple text</FooterLinks>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex children', () => {
    const { container } = render(
      <FooterLinks>
        <span>Copyright 2024</span> | <a href="/privacy">Privacy</a>
      </FooterLinks>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty children', () => {
    const { container } = render(<FooterLinks />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<FooterLinks id="footer-id">Footer with ID</FooterLinks>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with data-testid prop', () => {
    const { container } = render(<FooterLinks data-testid="custom-footer-links">Footer with test ID</FooterLinks>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
