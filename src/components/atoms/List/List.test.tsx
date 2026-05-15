import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { List } from './List';

describe('List', () => {
  it('renders with default props', () => {
    render(<List>Default List</List>);
    const list = screen.getByText('Default List');
    expect(list).toBeInTheDocument();
  });
});

describe('List - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(
      <List>
        <li>Item 1</li>
        <li>Item 2</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ul element', () => {
    const { container } = render(
      <List as="ul">
        <li>Unordered item</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ol element', () => {
    const { container } = render(
      <List as="ol">
        <li>Ordered item</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for default variant', () => {
    const { container } = render(
      <List variant="default">
        <li>Default item</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for decimal variant', () => {
    const { container } = render(
      <List variant="decimal">
        <li>Decimal item</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for none variant', () => {
    const { container } = render(
      <List variant="none">
        <li>None item</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(
      <List className="custom-list-class">
        <li>Custom class item</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom data-testid', () => {
    const { container } = render(
      <List data-testid="custom-list">
        <li>Custom test ID item</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with single item', () => {
    const { container } = render(
      <List>
        <li>Single item</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple items', () => {
    const { container } = render(
      <List>
        <li>First item</li>
        <li>Second item</li>
        <li>Third item</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(
      <List id="test-list">
        <li>Item with ID</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with aria-label prop', () => {
    const { container } = render(
      <List aria-label="Test list">
        <li>Item with aria-label</li>
      </List>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
