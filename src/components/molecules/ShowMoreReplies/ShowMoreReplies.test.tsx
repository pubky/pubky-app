import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShowMoreReplies } from './ShowMoreReplies';

describe('ShowMoreReplies', () => {
  it('renders with correct count text for plural', () => {
    const onClick = vi.fn();
    render(<ShowMoreReplies count={5} onClick={onClick} />);

    expect(screen.getByText('{count, plural, one {# more reply} other {# more replies}}')).toBeInTheDocument();
  });

  it('renders with correct count text for singular', () => {
    const onClick = vi.fn();
    render(<ShowMoreReplies count={1} onClick={onClick} />);

    expect(screen.getByText('{count, plural, one {# more reply} other {# more replies}}')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ShowMoreReplies count={3} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks button as keyboard-navigable thread item', () => {
    render(<ShowMoreReplies count={3} onClick={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveAttribute('data-post-list-card', 'true');
  });

  it('renders left connector structure', () => {
    const { container } = render(<ShowMoreReplies count={2} onClick={vi.fn()} />);

    expect(container.querySelectorAll('.border-l').length).toBeGreaterThan(0);
  });

  it('renders RoundedCorner connector', () => {
    const { container } = render(<ShowMoreReplies count={2} onClick={vi.fn()} />);

    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses last variant when isLast=true', () => {
    const { container } = render(<ShowMoreReplies count={2} onClick={vi.fn()} isLast={true} />);

    const connectorColumn = container.querySelector('[data-variant="last"]');
    expect(connectorColumn).toBeInTheDocument();
  });

  it('uses regular variant when isLast=false', () => {
    const { container } = render(<ShowMoreReplies count={2} onClick={vi.fn()} isLast={false} />);

    const connectorColumn = container.querySelector('[data-variant="regular"]');
    expect(connectorColumn).toBeInTheDocument();
  });
});

describe('ShowMoreReplies - Snapshots', () => {
  it('matches snapshot with count of 5', () => {
    const { container } = render(<ShowMoreReplies count={5} onClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with count of 1', () => {
    const { container } = render(<ShowMoreReplies count={1} onClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with isLast=true', () => {
    const { container } = render(<ShowMoreReplies count={3} onClick={vi.fn()} isLast={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
