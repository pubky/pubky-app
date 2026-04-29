import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TagInputToggle } from './TagInputToggle';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: {
      children: React.ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

describe('TagInputToggle', () => {
  it('renders input content when showInput is true', () => {
    render(
      <TagInputToggle
        showInput={true}
        inputContent={<div data-testid="input-content">Input</div>}
        addButtonContent={<button data-testid="button-content">Add</button>}
      />,
    );

    expect(screen.getByTestId('input-content')).toBeInTheDocument();
    expect(screen.queryByTestId('button-content')).not.toBeInTheDocument();
  });

  it('renders add button content when showInput is false', () => {
    render(
      <TagInputToggle
        showInput={false}
        inputContent={<div data-testid="input-content">Input</div>}
        addButtonContent={<button data-testid="button-content">Add</button>}
      />,
    );

    expect(screen.getByTestId('button-content')).toBeInTheDocument();
    expect(screen.queryByTestId('input-content')).not.toBeInTheDocument();
  });

  it('applies wrapper class hooks for both states', () => {
    const { rerender } = render(
      <TagInputToggle
        showInput={true}
        inputContent={<div data-testid="input-content">Input</div>}
        addButtonContent={<button data-testid="button-content">Add</button>}
        inputWrapperClassName="input-wrapper"
        addButtonWrapperClassName="button-wrapper"
      />,
    );

    expect(screen.getByTestId('input-content').parentElement).toHaveClass('input-wrapper');

    rerender(
      <TagInputToggle
        showInput={false}
        inputContent={<div data-testid="input-content">Input</div>}
        addButtonContent={<button data-testid="button-content">Add</button>}
        inputWrapperClassName="input-wrapper"
        addButtonWrapperClassName="button-wrapper"
      />,
    );

    expect(screen.getByTestId('button-content').parentElement).toHaveClass('button-wrapper');
  });

  it('returns null when selected state has no content', () => {
    const { container } = render(
      <TagInputToggle
        showInput={true}
        inputContent={null}
        addButtonContent={<button data-testid="button-content">Add</button>}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders an outer wrapper when width animation is enabled', () => {
    render(
      <TagInputToggle
        showInput={false}
        inputContent={<div data-testid="input-content">Input</div>}
        addButtonContent={<button data-testid="button-content">Add</button>}
        widthByState={{ input: 128, addButton: 32 }}
        containerClassName="animated-width-container"
      />,
    );

    expect(screen.getByTestId('button-content').parentElement?.parentElement).toHaveClass('animated-width-container');
  });
});

describe('TagInputToggle - Snapshots', () => {
  it('matches snapshot in button state', () => {
    const { container } = render(
      <TagInputToggle
        showInput={false}
        inputContent={<div data-testid="input-content">Input</div>}
        addButtonContent={<button data-testid="button-content">Add</button>}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in input state', () => {
    const { container } = render(
      <TagInputToggle
        showInput={true}
        inputContent={<div data-testid="input-content">Input</div>}
        addButtonContent={<button data-testid="button-content">Add</button>}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
