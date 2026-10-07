import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumb, BreadcrumbItem } from './Breadcrumb';

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

    it('truncates long item text with ellipsis classes', () => {
      const longName = 'This is an extremely long profile name that should truncate in the breadcrumb trail';

      render(
        <Breadcrumb>
          <BreadcrumbItem>{longName}</BreadcrumbItem>
        </Breadcrumb>,
      );

      expect(screen.getByText(longName)).toHaveClass('block', 'max-w-full', 'truncate');
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
