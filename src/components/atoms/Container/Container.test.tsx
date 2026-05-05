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

describe('Container - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Container>Default Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for div element', () => {
    const { container } = render(<Container as="div">Div Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for section element', () => {
    const { container } = render(<Container as="section">Section Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for main element', () => {
    const { container } = render(<Container as="main">Main Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for article element', () => {
    const { container } = render(<Container as="article">Article Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for header element', () => {
    const { container } = render(<Container as="header">Header Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for footer element', () => {
    const { container } = render(<Container as="footer">Footer Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for default size', () => {
    const { container } = render(<Container size="default">Default Size</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for small size', () => {
    const { container } = render(<Container size="sm">Small Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for medium size', () => {
    const { container } = render(<Container size="md">Medium Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for large size', () => {
    const { container } = render(<Container size="lg">Large Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for extra large size', () => {
    const { container } = render(<Container size="xl">Extra Large Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for container size', () => {
    const { container } = render(<Container size="container">Container Size</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for flex display', () => {
    const { container } = render(<Container display="flex">Flex Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for grid display', () => {
    const { container } = render(<Container display="grid">Grid Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for block display', () => {
    const { container } = render(<Container display="block">Block Container</Container>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshots for combined props', () => {
    const { container: combinedContainer } = render(
      <Container as="article" size="lg" display="grid" className="custom-class">
        Combined Props Container
      </Container>,
    );
    expect(combinedContainer.firstChild).toMatchSnapshot();
  });
});
