import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Heading } from './Heading';

describe('Heading', () => {
  it('renders with default props', () => {
    render(<Heading>Default Heading</Heading>);
    const heading = screen.getByText('Default Heading');
    expect(heading).toBeInTheDocument();
  });
});

describe('Heading - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Heading>Default Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h1 level', () => {
    const { container } = render(<Heading level={1}>H1 Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h2 level', () => {
    const { container } = render(<Heading level={2}>H2 Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h3 level', () => {
    const { container } = render(<Heading level={3}>H3 Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h4 level', () => {
    const { container } = render(<Heading level={4}>H4 Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h5 level', () => {
    const { container } = render(<Heading level={5}>H5 Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for h6 level', () => {
    const { container } = render(<Heading level={6}>H6 Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for small size', () => {
    const { container } = render(<Heading size="sm">Small Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for medium size', () => {
    const { container } = render(<Heading size="md">Medium Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for large size', () => {
    const { container } = render(<Heading size="lg">Large Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for extra large size', () => {
    const { container } = render(<Heading size="xl">Extra Large Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for 2xl size', () => {
    const { container } = render(<Heading size="2xl">2XL Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for combined level and size', () => {
    const { container } = render(
      <Heading level={3} size="2xl">
        H3 2XL Heading
      </Heading>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Heading className="custom-heading-class">Custom Heading</Heading>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex children', () => {
    const { container } = render(
      <Heading>
        <span>Part 1</span> and <strong>Part 2</strong>
      </Heading>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
