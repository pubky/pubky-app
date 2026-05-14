import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThreadExpandToggle } from './ThreadExpandToggle';

describe('ThreadExpandToggle', () => {
  it('renders with expand label when collapsed', () => {
    render(<ThreadExpandToggle expanded={false} onToggle={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Expand all replies');
  });

  it('renders with collapse label when expanded', () => {
    render(<ThreadExpandToggle expanded={true} onToggle={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Collapse all replies');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<ThreadExpandToggle expanded={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders an icon element', () => {
    render(<ThreadExpandToggle expanded={false} onToggle={vi.fn()} />);

    const button = screen.getByRole('button');
    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});

describe('ThreadExpandToggle - Snapshots', () => {
  it('matches snapshot in collapsed state', () => {
    const { container } = render(<ThreadExpandToggle expanded={false} onToggle={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in expanded state', () => {
    const { container } = render(<ThreadExpandToggle expanded={true} onToggle={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
