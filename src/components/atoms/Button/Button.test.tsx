import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, ButtonVariant } from './Button';

describe('Button', () => {
  it('renders with default props', () => {
    render(<Button>Default Button</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-brand/16', 'text-brand');
    expect(button).toHaveAttribute('data-slot', 'button');
    // data-variant is only set when variant prop is explicitly provided
    expect(button).not.toHaveAttribute('data-variant');
  });

  it('renders different variants correctly', () => {
    const { rerender } = render(<Button variant={ButtonVariant.SECONDARY}>Secondary</Button>);
    let button = screen.getByRole('button');
    expect(button).toHaveClass('bg-secondary', 'text-secondary-foreground');

    rerender(<Button variant={ButtonVariant.OUTLINE}>Outline</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('bg-input/30');

    rerender(<Button variant={ButtonVariant.GHOST}>Ghost</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('hover:bg-accent/50');

    rerender(<Button variant={ButtonVariant.BRAND}>Brand</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('bg-brand', 'text-background');

    rerender(<Button variant="destructive">Destructive</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('bg-destructive/60', 'text-destructive-foreground');

    rerender(<Button variant="link">Link</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('text-primary', 'underline-offset-4');

    rerender(<Button variant="dark">Dark</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('bg-neutral-900', 'text-white');

    rerender(<Button variant="dark-outline">Dark Outline</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('bg-transparent');
  });

  it('renders different sizes correctly', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    let button = screen.getByRole('button');
    expect(button).toHaveClass('h-8', 'gap-1.5', 'px-3', 'has-[>svg]:px-3.5', 'text-sm');

    rerender(<Button size="lg">Large</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('h-auto', 'px-4', 'py-2.5', 'sm:px-8', 'sm:py-5');

    rerender(<Button size="icon">Icon</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('size-9');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('renders as child component when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: /link button/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test');
    expect(link).toHaveAttribute('data-slot', 'button');
  });

  it('overrideDefaults removes all default classes', () => {
    render(
      <Button overrideDefaults className="my-custom-class">
        Override Button
      </Button>,
    );
    const button = screen.getByRole('button');

    // Should only have the custom class
    expect(button).toHaveClass('my-custom-class');

    // Should NOT have default button classes
    expect(button).not.toHaveClass('inline-flex');
    expect(button).not.toHaveClass('bg-brand/16');
    expect(button).not.toHaveClass('rounded-full');
    expect(button).not.toHaveClass('border');
  });

  it('overrideDefaults with no className renders a clean button', () => {
    render(<Button overrideDefaults>Clean Button</Button>);
    const button = screen.getByRole('button');

    // Should not have variant or size classes
    expect(button).not.toHaveClass('bg-brand/16');
    expect(button).not.toHaveClass('h-10');
    expect(button).not.toHaveClass('rounded-full');

    // Should still have data attributes
    expect(button).toHaveAttribute('data-slot', 'button');
  });

  it('overrideDefaults works with multiple custom classes', () => {
    render(
      <Button overrideDefaults className="flex items-center gap-2 bg-red-500 px-4 py-2 text-white">
        Custom Styled Button
      </Button>,
    );
    const button = screen.getByRole('button');

    // Should have all custom classes
    expect(button).toHaveClass('flex', 'items-center', 'gap-2', 'px-4', 'py-2', 'bg-red-500', 'text-white');

    // Should NOT have default button classes
    expect(button).not.toHaveClass('bg-brand/16');
    expect(button).not.toHaveClass('rounded-full');
  });

  it('without overrideDefaults applies default classes normally', () => {
    render(<Button className="custom-class">Normal Button</Button>);
    const button = screen.getByRole('button');

    // Should have both default and custom classes
    expect(button).toHaveClass('custom-class');
    expect(button).toHaveClass('bg-brand/16');
    expect(button).toHaveClass('inline-flex');
    expect(button).toHaveClass('rounded-full');
  });
});

describe('Button - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Button>Default Button</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for default variant', () => {
    const { container } = render(<Button>Default</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for secondary variant', () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for outline variant', () => {
    const { container } = render(<Button variant="outline">Outline</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ghost variant', () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for brand variant', () => {
    const { container } = render(<Button variant="brand">Brand</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for small size', () => {
    const { container } = render(<Button size="sm">Small</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for default size', () => {
    const { container } = render(<Button>Default Size</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for large size', () => {
    const { container } = render(<Button size="lg">Large</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for icon size', () => {
    const { container } = render(<Button size="icon">🔍</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for disabled state', () => {
    const { container } = render(<Button disabled>Disabled</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Button className="custom-class">Custom</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for asChild prop', () => {
    const { container } = render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Button</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('forwards ref correctly with asChild', () => {
    const ref = React.createRef<HTMLAnchorElement>();
    render(
      <Button asChild>
        <a ref={ref} href="/test">
          Link Button
        </a>
      </Button>,
    );
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
  });

  it('has correct data attributes', () => {
    render(
      <Button variant="secondary" size="lg">
        Test
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-slot', 'button');
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'lg');
  });

  it('supports accessibility attributes', () => {
    render(
      <Button aria-label="Close dialog" role="button">
        ×
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Close dialog');
  });

  it('handles focus states correctly', () => {
    render(<Button tabIndex={0}>Focusable Button</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('tabIndex', '0');
    expect(button).toHaveClass('focus-visible:border-ring', 'focus-visible:ring-ring/50');
  });

  it('handles hover states correctly', () => {
    render(<Button variant="default">Hover Button</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('hover:!bg-brand/30');
  });

  it('handles invalid states correctly', () => {
    render(<Button aria-invalid="true">Invalid Button</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-invalid', 'true');
    expect(button).toHaveClass('aria-invalid:ring-destructive/40', 'aria-invalid:border-destructive');
  });

  it('renders with icons correctly', () => {
    render(
      <Button>
        <span>🎉</span>
        <span>New Feature</span>
      </Button>,
    );
    expect(screen.getByText('🎉')).toBeInTheDocument();
    expect(screen.getByText('New Feature')).toBeInTheDocument();
  });

  it('applies all base classes correctly', () => {
    render(<Button>Base Classes Test</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass(
      'inline-flex',
      'items-center',
      'justify-center',
      'whitespace-nowrap',
      'text-sm',
      'transition-all',
      'disabled:pointer-events-none',
      'disabled:opacity-50',
      'shrink-0',
      'outline-none',
      'font-semibold',
      'cursor-pointer',
      'rounded-full',
      'border',
      'shadow-xs',
    );
  });

  it('forwards additional props', () => {
    render(
      <Button data-testid="button" data-custom="test">
        Test
      </Button>,
    );
    const button = screen.getByTestId('button');
    expect(button).toHaveAttribute('data-custom', 'test');
  });

  it('matches snapshot with overrideDefaults and custom className', () => {
    const { container } = render(
      <Button overrideDefaults className="custom-override-class">
        Override
      </Button>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with overrideDefaults and no className', () => {
    const { container } = render(<Button overrideDefaults>Clean</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
