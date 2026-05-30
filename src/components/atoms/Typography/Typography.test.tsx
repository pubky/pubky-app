import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Typography } from './Typography';

describe('Typography', () => {
  it('renders with default props', () => {
    render(<Typography>Default text</Typography>);
    const typography = screen.getByText('Default text');
    expect(typography).toBeInTheDocument();
  });
});

describe('Typography - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Typography>Default text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h1 element', () => {
    const { container } = render(<Typography as="h1">H1 heading</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h2 element', () => {
    const { container } = render(<Typography as="h2">H2 heading</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for span element', () => {
    const { container } = render(<Typography as="span">Span text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for strong element', () => {
    const { container } = render(<Typography as="strong">Strong text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for em element', () => {
    const { container } = render(<Typography as="em">Emphasized text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for extra small size', () => {
    const { container } = render(<Typography size="xs">Extra small text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for small size', () => {
    const { container } = render(<Typography size="sm">Small text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for medium size', () => {
    const { container } = render(<Typography size="md">Medium text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for large size', () => {
    const { container } = render(<Typography size="lg">Large text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for extra large size', () => {
    const { container } = render(<Typography size="xl">Extra large text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for 2xl size', () => {
    const { container } = render(<Typography size="2xl">2XL text</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Typography className="custom-typography">Custom typography</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with combined props', () => {
    const { container } = render(
      <Typography as="h2" size="lg">
        Large heading
      </Typography>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex children', () => {
    const { container } = render(
      <Typography>
        <span>Complex</span> <em>typography</em> content
      </Typography>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<Typography id="typography-id">Typography with ID</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with data-testid prop', () => {
    const { container } = render(<Typography data-testid="custom-typography">Typography with test ID</Typography>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
