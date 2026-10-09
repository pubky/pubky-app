import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Container } from './Container';

describe('Container', () => {
  it('renders with default props', () => {
    render(<Container>Default Container</Container>);
    const container = screen.getByText('Default Container');
    expect(container).toBeInTheDocument();
  });

  describe('Variants', () => {
    it('applies the default flex column classes without a size cap', () => {
      render(<Container>Default</Container>);

      const container = screen.getByTestId('container');
      expect(container.tagName).toBe('DIV');
      expect(container).toHaveClass('mx-auto', 'w-full', 'flex-col', 'flex');
      expect(container.className).not.toMatch(/max-w-/);
    });

    it.each([
      ['sm', 'max-w-screen-sm'],
      ['md', 'max-w-screen-md'],
      ['lg', 'max-w-screen-lg'],
      ['xl', 'max-w-screen-xl'],
      ['container', 'container'],
    ] as const)('applies size=%s class', (size, className) => {
      render(<Container size={size}>Sized</Container>);
      expect(screen.getByTestId('container')).toHaveClass(className);
    });

    it.each([
      ['flex', 'flex'],
      ['grid', 'grid'],
      ['block', 'block'],
    ] as const)('applies display=%s class', (display, className) => {
      render(<Container display={display}>Displayed</Container>);
      expect(screen.getByTestId('container')).toHaveClass(className);
    });

    it('renders the requested element when as is set', () => {
      render(<Container as="section">Section</Container>);
      expect(screen.getByTestId('container').tagName).toBe('SECTION');
    });

    it('drops the default classes when overrideDefaults is set', () => {
      render(
        <Container overrideDefaults className="custom-class">
          Override
        </Container>,
      );

      const container = screen.getByTestId('container');
      expect(container).toHaveClass('custom-class');
      expect(container).not.toHaveClass('mx-auto', 'w-full', 'flex-col', 'flex');
    });
  });

  describe('Accessibility Props', () => {
    it('renders with aria-modal attribute', () => {
      render(
        <Container aria-modal={true} data-testid="modal-container">
          Modal Container
        </Container>,
      );
      const container = screen.getByTestId('modal-container');
      expect(container).toHaveAttribute('aria-modal', 'true');
    });

    it('renders with aria-label attribute', () => {
      render(
        <Container aria-label="Test Label" data-testid="labeled-container">
          Labeled Container
        </Container>,
      );
      const container = screen.getByTestId('labeled-container');
      expect(container).toHaveAttribute('aria-label', 'Test Label');
    });

    it('renders with tabIndex attribute', () => {
      render(
        <Container tabIndex={-1} data-testid="focusable-container">
          Focusable Container
        </Container>,
      );
      const container = screen.getByTestId('focusable-container');
      expect(container).toHaveAttribute('tabIndex', '-1');
    });

    it('renders with combined ARIA attributes for dialog', () => {
      render(
        <Container
          role="dialog"
          aria-modal={true}
          aria-label="Dialog Title"
          tabIndex={-1}
          data-testid="dialog-container"
        >
          Dialog Content
        </Container>,
      );
      const container = screen.getByTestId('dialog-container');
      expect(container).toHaveAttribute('role', 'dialog');
      expect(container).toHaveAttribute('aria-modal', 'true');
      expect(container).toHaveAttribute('aria-label', 'Dialog Title');
      expect(container).toHaveAttribute('tabIndex', '-1');
    });
  });
});
