import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders with default props', () => {
    render(<Badge>Default Badge</Badge>);
    const badge = screen.getByText('Default Badge');
    expect(badge).toBeInTheDocument();
  });
});

describe('Badge - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Badge>Default Badge</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for default variant', () => {
    const { container } = render(<Badge variant="default">Default</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for secondary variant', () => {
    const { container } = render(<Badge variant="secondary">Secondary</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for destructive variant', () => {
    const { container } = render(<Badge variant="destructive">Destructive</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for outline variant', () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Badge className="custom-badge">Custom</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex children', () => {
    const { container } = render(
      <Badge>
        <span>Complex Content</span>
      </Badge>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for asChild prop', () => {
    const { container } = render(
      <Badge asChild>
        <a href="/test">Link Badge</a>
      </Badge>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Badge ref={ref}>Badge</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards ref correctly with asChild', () => {
    const ref = React.createRef<HTMLAnchorElement>();
    render(
      <Badge asChild>
        <a ref={ref} href="/test">
          Link Badge
        </a>
      </Badge>,
    );
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
  });

  it('has correct data attributes', () => {
    render(<Badge variant="secondary">Test Badge</Badge>);
    const badge = screen.getByText('Test Badge');
    expect(badge).toHaveAttribute('data-slot', 'badge');
    expect(badge).toHaveAttribute('data-variant', 'secondary');
  });

  it('supports accessibility attributes', () => {
    render(
      <Badge aria-label="Status badge" role="status">
        Active
      </Badge>,
    );
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', 'Status badge');
  });

  it('handles focus states correctly', () => {
    render(<Badge tabIndex={0}>Focusable Badge</Badge>);
    const badge = screen.getByText('Focusable Badge');
    expect(badge).toHaveAttribute('tabIndex', '0');
    expect(badge).toHaveClass('focus-visible:border-ring', 'focus-visible:ring-ring/50');
  });

  it('handles hover states correctly', () => {
    render(<Badge variant="default">Hover Badge</Badge>);
    const badge = screen.getByText('Hover Badge');
    expect(badge).toHaveClass('[a&]:hover:bg-primary/90');
  });

  it('handles invalid states correctly', () => {
    render(<Badge aria-invalid="true">Invalid Badge</Badge>);
    const badge = screen.getByText('Invalid Badge');
    expect(badge).toHaveAttribute('aria-invalid', 'true');
    expect(badge).toHaveClass('aria-invalid:ring-destructive/40', 'aria-invalid:border-destructive');
  });

  it('renders with icons correctly', () => {
    render(
      <Badge>
        <span>🎉</span>
        <span>New Feature</span>
      </Badge>,
    );
    expect(screen.getByText('🎉')).toBeInTheDocument();
    expect(screen.getByText('New Feature')).toBeInTheDocument();
  });

  it('handles long text correctly', () => {
    const longText = 'This is a very long badge text that should be handled properly';
    render(<Badge>{longText}</Badge>);
    const badge = screen.getByText(longText);
    expect(badge).toHaveClass('whitespace-nowrap', 'overflow-hidden');
  });

  it('applies all base classes correctly', () => {
    render(<Badge>Base Classes Test</Badge>);
    const badge = screen.getByText('Base Classes Test');
    expect(badge).toHaveClass(
      'inline-flex',
      'items-center',
      'justify-center',
      'rounded-md',
      'border',
      'px-2',
      'py-0.5',
      'text-xs',
      'font-medium',
      'w-fit',
      'whitespace-nowrap',
      'shrink-0',
      'gap-1',
      'border-transparent',
      'transition-[color,box-shadow]',
      'overflow-hidden',
    );
  });
});
