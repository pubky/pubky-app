import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThreadExpandToggle } from './ThreadExpandToggle';
import { ThreadTreeProvider } from '@/components/organisms/ThreadTree/ThreadTreeProvider';

describe('ThreadExpandToggle', () => {
  it('renders with expand label when collapsed', () => {
    render(
      <ThreadTreeProvider>
        <ThreadExpandToggle />
      </ThreadTreeProvider>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Expand all replies');
  });

  it('toggles expand/collapse state on click', () => {
    render(
      <ThreadTreeProvider>
        <ThreadExpandToggle />
      </ThreadTreeProvider>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Expand all replies');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', 'Collapse all replies');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', 'Expand all replies');
  });

  it('renders an icon element', () => {
    render(
      <ThreadTreeProvider>
        <ThreadExpandToggle />
      </ThreadTreeProvider>,
    );

    const button = screen.getByRole('button');
    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});

describe('ThreadExpandToggle - Snapshots', () => {
  it('matches snapshot in collapsed state', () => {
    const { container } = render(
      <ThreadTreeProvider>
        <ThreadExpandToggle />
      </ThreadTreeProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in expanded state', () => {
    const { container } = render(
      <ThreadTreeProvider>
        <ThreadExpandToggle />
      </ThreadTreeProvider>,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(container.firstChild).toMatchSnapshot();
  });
});
