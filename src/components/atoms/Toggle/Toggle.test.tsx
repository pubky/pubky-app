import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  it('renders with default props', () => {
    render(<Toggle>Toggle</Toggle>);

    const toggle = screen.getByRole('button');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent('Toggle');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Toggle onClick={handleClick}>Toggle</Toggle>);

    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Toggle ref={ref}>Toggle</Toggle>);

    expect(ref).toHaveBeenCalled();
  });
});

describe('Toggle - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Toggle>Default Toggle</Toggle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for default variant', () => {
    const { container } = render(<Toggle variant="default">Default</Toggle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for outline variant', () => {
    const { container } = render(<Toggle variant="outline">Outline</Toggle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for small size', () => {
    const { container } = render(<Toggle size="sm">Small</Toggle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for default size', () => {
    const { container } = render(<Toggle>Default Size</Toggle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for large size', () => {
    const { container } = render(<Toggle size="lg">Large</Toggle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for pressed state', () => {
    const { container } = render(<Toggle pressed>Pressed</Toggle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for disabled state', () => {
    const { container } = render(<Toggle disabled>Disabled</Toggle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Toggle className="custom-class">Custom</Toggle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with all props combined', () => {
    const { container } = render(
      <Toggle variant="outline" size="lg" pressed className="custom-toggle">
        Combined Props
      </Toggle>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
