import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Container } from './Container';

describe('Container', () => {
  it('renders with default props', () => {
    render(<Container>Default Container</Container>);
    const container = screen.getByText('Default Container');
    expect(container).toBeInTheDocument();
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
