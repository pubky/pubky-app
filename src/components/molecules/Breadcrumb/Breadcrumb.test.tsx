import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from './Breadcrumb';

describe('Breadcrumb', () => {
  describe('Breadcrumb Container', () => {
    it('renders with nav element', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      const nav = screen.getByRole('navigation', { name: 'breadcrumb' });
      expect(nav).toBeInTheDocument();
    });

    it('renders with ordered list', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      const ol = container.querySelector('ol');
      expect(ol).toBeInTheDocument();
    });

    it('applies the md gap by default', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(screen.getByRole('list')).toHaveClass('gap-2.5');
    });

    it.each([
      ['sm', 'gap-1.5'],
      ['md', 'gap-2.5'],
    ] as const)('applies size=%s gap to the list', (size, className) => {
      render(
        <Breadcrumb size={size}>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(screen.getByRole('list')).toHaveClass(className);
    });

    it('merges a custom className on the nav', () => {
      render(
        <Breadcrumb className="custom-nav">
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(screen.getByRole('navigation')).toHaveClass('custom-nav', 'flex');
    });
  });

  describe('BreadcrumbItem', () => {
    it('renders as list item', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      const listItem = screen.getByRole('listitem');
      expect(listItem).toBeInTheDocument();
    });

    it('renders as link when href is provided', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem href="/home">Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/home');
    });

    it('renders as button when href is not provided', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('handles click events', () => {
      const handleClick = vi.fn();
      render(
        <Breadcrumb>
          <BreadcrumbItem onClick={handleClick}>Click me</BreadcrumbItem>
        </Breadcrumb>,
      );

      const item = screen.getByRole('listitem');
      fireEvent.click(item);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('truncates long item text with ellipsis classes', () => {
      const longName = 'This is an extremely long profile name that should truncate in the breadcrumb trail';

      render(
        <Breadcrumb>
          <BreadcrumbItem>{longName}</BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(screen.getByText(longName)).toHaveClass('block', 'max-w-full', 'truncate');
    });

    it('applies the link variant by default', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      const item = screen.getByRole('listitem');
      expect(item).toHaveClass('text-muted-foreground', 'hover:text-foreground', 'cursor-pointer');
      expect(item).not.toHaveClass('rounded');
    });

    it('applies the current variant', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem variant="current">Current page</BreadcrumbItem>
        </Breadcrumb>,
      );

      const item = screen.getByRole('listitem');
      expect(item).toHaveClass('text-foreground');
      expect(item).not.toHaveClass('text-muted-foreground', 'cursor-pointer');
    });

    it('applies the ellipsis variant', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem variant="ellipsis">...</BreadcrumbItem>
        </Breadcrumb>,
      );

      const item = screen.getByRole('listitem');
      expect(item).toHaveClass('text-muted-foreground');
      expect(item).not.toHaveClass('cursor-pointer');
    });

    it('applies the dropdown variant when the variant prop is set', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem variant="dropdown">Options</BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(screen.getByRole('listitem')).toHaveClass('cursor-pointer', 'rounded', 'overflow-hidden');
    });

    it('switches to the dropdown variant and renders a chevron when dropdown is set', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem dropdown>Options</BreadcrumbItem>
        </Breadcrumb>,
      );

      const item = screen.getByRole('listitem');
      expect(item).toHaveClass('rounded', 'overflow-hidden');
      expect(container.querySelector('svg.lucide-chevron-down')).toBeInTheDocument();
    });

    it('renders a button instead of a link when dropdown is set, even with an href', () => {
      const handleClick = vi.fn();
      render(
        <Breadcrumb>
          <BreadcrumbItem dropdown href="/ignored" onClick={handleClick}>
            Options
          </BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Options' }));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not render a chevron without dropdown', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(container.querySelector('svg.lucide-chevron-down')).not.toBeInTheDocument();
    });

    it('merges a custom className with the variant classes', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem className="custom-item">Home</BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(screen.getByRole('listitem')).toHaveClass('custom-item', 'text-muted-foreground');
    });
  });

  describe('BreadcrumbSeparator', () => {
    const renderSeparator = (props?: React.ComponentProps<typeof BreadcrumbSeparator>) =>
      render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <BreadcrumbSeparator data-testid="separator" {...props} />
          <BreadcrumbItem variant="current">Page</BreadcrumbItem>
        </Breadcrumb>,
      );

    it('is presentational and hidden from assistive tech', () => {
      renderSeparator();

      const separator = screen.getByTestId('separator');
      expect(separator.tagName).toBe('LI');
      expect(separator).toHaveAttribute('role', 'presentation');
      expect(separator).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('renders a chevron-right icon by default', () => {
      renderSeparator();

      expect(screen.getByTestId('separator').querySelector('svg.lucide-chevron-right')).toBeInTheDocument();
    });

    it('renders a custom icon instead of the default', () => {
      renderSeparator({ icon: <span data-testid="custom-icon">/</span> });

      const separator = screen.getByTestId('separator');
      expect(separator).toContainElement(screen.getByTestId('custom-icon'));
      expect(separator.querySelector('svg')).not.toBeInTheDocument();
    });

    it('applies the md size by default', () => {
      renderSeparator();
      expect(screen.getByTestId('separator')).toHaveClass('w-4', 'h-4', 'text-muted-foreground', 'shrink-0');
    });

    it.each([
      ['sm', ['w-[15px]', 'h-[15px]']],
      ['md', ['w-4', 'h-4']],
    ] as const)('applies size=%s classes', (size, classNames) => {
      renderSeparator({ size });
      expect(screen.getByTestId('separator')).toHaveClass(...classNames);
    });

    it('merges a custom className', () => {
      renderSeparator({ className: 'custom-separator' });
      expect(screen.getByTestId('separator')).toHaveClass('custom-separator', 'shrink-0');
    });
  });

  describe('BreadcrumbEllipsis', () => {
    it('is presentational with a screen-reader-only label', () => {
      render(<BreadcrumbEllipsis data-testid="ellipsis" />);

      const ellipsis = screen.getByTestId('ellipsis');
      expect(ellipsis.tagName).toBe('SPAN');
      expect(ellipsis).toHaveAttribute('role', 'presentation');
      expect(ellipsis).toHaveAttribute('aria-hidden', 'true');
      expect(ellipsis).toHaveClass('flex', 'h-9', 'w-9', 'items-center', 'justify-center');
      expect(ellipsis.querySelector('svg.lucide-ellipsis')).toBeInTheDocument();
      expect(screen.getByText('More')).toHaveClass('sr-only');
    });

    it('merges a custom className', () => {
      render(<BreadcrumbEllipsis data-testid="ellipsis" className="custom-ellipsis" />);
      expect(screen.getByTestId('ellipsis')).toHaveClass('custom-ellipsis', 'h-9');
    });

    it('collapses a trail inside a non-interactive item', () => {
      render(
        <Breadcrumb>
          <BreadcrumbItem href="/">Home</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem variant="ellipsis">
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem variant="current">Page</BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      expect(screen.getByRole('link')).toHaveAttribute('href', '/');
      expect(screen.getByText('More')).toBeInTheDocument();
    });
  });

  describe('BreadcrumbPage', () => {
    it('marks the current page as a disabled link', () => {
      render(<BreadcrumbPage>Current</BreadcrumbPage>);

      const page = screen.getByRole('link', { name: 'Current' });
      expect(page.tagName).toBe('SPAN');
      expect(page).toHaveAttribute('aria-current', 'page');
      expect(page).toHaveAttribute('aria-disabled', 'true');
      expect(page).toHaveClass('font-normal', 'text-foreground');
    });

    it('merges a custom className', () => {
      render(<BreadcrumbPage className="custom-page">Current</BreadcrumbPage>);
      expect(screen.getByRole('link')).toHaveClass('custom-page', 'text-foreground');
    });
  });

  describe('Accessibility', () => {
    it('maintains keyboard navigation', () => {
      const handleClick = vi.fn();
      render(
        <Breadcrumb>
          <BreadcrumbItem onClick={handleClick}>Clickable</BreadcrumbItem>
        </Breadcrumb>,
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();

      // Buttons are keyboard accessible by default
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalled();
    });
  });
});
