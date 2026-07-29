import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IllustratedCard } from './IllustratedCard';

describe('IllustratedCard', () => {
  it('uses the shared card shell with a fixed visual column and flexible content column', () => {
    const { container } = render(
      <IllustratedCard visual={<span>Illustration</span>}>
        <span>Content</span>
      </IllustratedCard>,
    );

    expect(container.firstChild).toHaveClass('gap-0', 'p-6', 'lg:p-12');
    expect(screen.getByText('Illustration').parentElement).toHaveClass('w-48', 'shrink-0');
    expect(screen.getByText('Content').parentElement).toHaveClass('min-w-0', 'max-w-xl', 'flex-1');
  });

  it('supports a column layout', () => {
    const { container } = render(
      <IllustratedCard layout="column">
        <span>Content</span>
      </IllustratedCard>,
    );

    expect(container.querySelector('[data-slot="card-content"]')).toHaveClass('flex-col', 'p-0');
    expect(container.querySelector('[data-slot="card-content"]')).not.toHaveClass('lg:flex-row');
  });

  it('supports medium-breakpoint card padding', () => {
    const { container } = render(
      <IllustratedCard paddingBreakpoint="md">
        <span>Content</span>
      </IllustratedCard>,
    );

    expect(container.firstChild).toHaveClass('md:p-12');
    expect(container.firstChild).not.toHaveClass('lg:p-12');
  });

  it('supports intrinsic visual sizing without forcing the fixed illustration column', () => {
    render(
      <IllustratedCard visualSizing="intrinsic" visual={<span>Intrinsic illustration</span>}>
        <span>Content</span>
      </IllustratedCard>,
    );

    expect(screen.getByText('Intrinsic illustration').parentElement).toHaveClass('contents');
    expect(screen.getByText('Intrinsic illustration').parentElement).not.toHaveClass('w-48', 'shrink-0');
  });
});

describe('IllustratedCard - Snapshots', () => {
  it('matches snapshot for the default row layout', () => {
    const { container } = render(
      <IllustratedCard visual={<span>Illustration</span>}>
        <span>Content</span>
      </IllustratedCard>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for the column layout', () => {
    const { container } = render(
      <IllustratedCard layout="column">
        <span>Column content</span>
      </IllustratedCard>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for intrinsic visual sizing', () => {
    const { container } = render(
      <IllustratedCard visualSizing="intrinsic" visual={<span>Intrinsic illustration</span>}>
        <span>Intrinsic content</span>
      </IllustratedCard>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
