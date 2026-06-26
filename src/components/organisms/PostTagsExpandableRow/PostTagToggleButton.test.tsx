import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { PostTagToggleButton } from './PostTagToggleButton';

vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: vi.fn(),
}));

const mockUsePostCounts = vi.mocked(usePostCounts);
const POST_ID = 'author:post-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePostCounts.mockReturnValue({
    postCounts: {
      id: POST_ID,
      tags: 5,
      unique_tags: 3,
      reposts: 0,
      replies: 0,
    },
    isLoading: false,
  });
});

describe('PostTagToggleButton', () => {
  it('renders the tag count and expanded state', () => {
    render(<PostTagToggleButton postId={POST_ID} expanded={false} onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Tag post (3)' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<PostTagToggleButton postId={POST_ID} expanded={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tag post (3)' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders a loading skeleton while counts load', () => {
    mockUsePostCounts.mockReturnValue({ postCounts: undefined, isLoading: true });

    const { container } = render(<PostTagToggleButton postId={POST_ID} expanded={false} onToggle={vi.fn()} />);

    expect(container.querySelector('[data-cy="post-tag-btn-skeleton"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tag post/ })).not.toBeInTheDocument();
  });

  it('renders zero when counts are unavailable after loading', () => {
    mockUsePostCounts.mockReturnValue({ postCounts: undefined, isLoading: false });

    render(<PostTagToggleButton postId={POST_ID} expanded={false} onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Tag post (0)' })).toHaveTextContent('0');
  });

  it('respects disabled state', () => {
    const onToggle = vi.fn();
    render(<PostTagToggleButton postId={POST_ID} expanded={false} onToggle={onToggle} disabled />);

    const button = screen.getByRole('button', { name: 'Tag post (3)' });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('PostTagToggleButton - Snapshots', () => {
  it('matches the default snapshot', () => {
    const { container } = render(<PostTagToggleButton postId={POST_ID} expanded={false} onToggle={vi.fn()} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
