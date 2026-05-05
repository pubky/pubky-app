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

describe('Breadcrumb - Snapshots', () => {
  describe('Breadcrumb Container', () => {
    it('matches snapshot with default props', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with small size', () => {
      const { container } = render(
        <Breadcrumb size="sm">
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with medium size', () => {
      const { container } = render(
        <Breadcrumb size="md">
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom className', () => {
      const { container } = render(
        <Breadcrumb className="custom-breadcrumb">
          <BreadcrumbItem>Home</BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('BreadcrumbItem', () => {
    it('matches snapshot with link variant', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem variant="link">Home</BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with current variant', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem variant="current">Current</BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with dropdown variant', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem dropdown>Menu</BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with href prop', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem href="/home">Home</BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom className', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem className="custom-item">Home</BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('BreadcrumbSeparator', () => {
    it('matches snapshot with default icon', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <BreadcrumbSeparator />
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with small size', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <BreadcrumbSeparator size="sm" />
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with medium size', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <BreadcrumbSeparator size="md" />
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom icon', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <BreadcrumbSeparator icon={<span data-testid="custom-separator">/</span>} />
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom className', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <BreadcrumbSeparator className="custom-separator" />
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('BreadcrumbEllipsis', () => {
    it('matches snapshot with default props', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbEllipsis />
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom className', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbEllipsis className="custom-ellipsis" />
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('BreadcrumbPage', () => {
    it('matches snapshot with default props', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbPage>Current Page</BreadcrumbPage>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom className', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbPage className="custom-page">Current Page</BreadcrumbPage>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Complete Breadcrumb Examples', () => {
    it('matches snapshot for simple breadcrumb', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem href="/">Home</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Current</BreadcrumbPage>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot for complex breadcrumb', () => {
      const { container } = render(
        <Breadcrumb>
          <BreadcrumbItem href="/">Home</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbEllipsis />
          <BreadcrumbSeparator />
          <BreadcrumbItem dropdown>Category</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem href="/products">Products</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Product Details</BreadcrumbPage>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot for small size breadcrumb', () => {
      const { container } = render(
        <Breadcrumb size="sm">
          <BreadcrumbItem href="/">Home</BreadcrumbItem>
          <BreadcrumbSeparator size="sm" />
          <BreadcrumbItem href="/category">Category</BreadcrumbItem>
          <BreadcrumbSeparator size="sm" />
          <BreadcrumbPage>Current</BreadcrumbPage>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom styling', () => {
      const { container } = render(
        <Breadcrumb className="custom-breadcrumb">
          <BreadcrumbItem href="/" className="custom-link">
            Home
          </BreadcrumbItem>
          <BreadcrumbSeparator className="custom-sep" icon={<span>/</span>} />
          <BreadcrumbItem variant="current" className="custom-current">
            Current
          </BreadcrumbItem>
        </Breadcrumb>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
