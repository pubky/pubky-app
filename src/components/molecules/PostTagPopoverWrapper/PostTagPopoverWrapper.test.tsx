import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PostTagPopoverWrapper } from './PostTagPopoverWrapper';
import { POPOVER_HOVER_DELAY } from './PostTagPopoverWrapper.constants';
import { DEFAULT_HOVER_CLOSE_DELAY } from '@/atoms/Popover/Popover.constants';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

const mockRouterPush = vi.fn();
const mockFetchAllTaggers = vi.fn();
let mockTaggersByLabel = new Map<string, string[]>();
let mockTaggerStates = new Map<
  string,
  { ids: string[]; skip: number; isLoading: boolean; hasMore: boolean; totalCount?: number }
>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useIsTouchDevice: () => false,
    useIsMobile: () => false,
    usePostTaggers: () => ({
      taggersByLabel: mockTaggersByLabel,
      taggerStates: mockTaggerStates,
      fetchAllTaggers: mockFetchAllTaggers,
    }),
  };
});

vi.mock('@/organisms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms')>();
  return {
    ...actual,
    AvatarWithFallback: ({ name }: { name: string }) => <div data-testid={`avatar-${name}`}>Avatar</div>,
  };
});

vi.mock('../PostHeaderUserInfoPopoverWrapper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../PostHeaderUserInfoPopoverWrapper')>();
  return {
    ...actual,
    PostHeaderUserInfoPopoverContent: () => <div data-testid="user-info-content">User Info</div>,
  };
});

vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
  return { ...actual, formatPublicKey: () => 'formatted-key' };
});

const mockTaggers: TaggerWithAvatar[] = [
  { id: 'user1', avatarUrl: 'https://example.com/1.png', name: 'Alice' },
  { id: 'user2', avatarUrl: 'https://example.com/2.png', name: 'Bob' },
  { id: 'user3', avatarUrl: 'https://example.com/3.png', name: 'Charlie' },
];

describe('PostTagPopoverWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockTaggersByLabel = new Map();
    mockTaggerStates = new Map();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children without popover when no taggers', () => {
    render(
      <PostTagPopoverWrapper taggers={[]} taggersCount={0}>
        <button data-testid="trigger">Tag</button>
      </PostTagPopoverWrapper>,
    );

    expect(screen.getByTestId('trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('popover')).not.toBeInTheDocument();
  });

  it('shows avatars on hover after delay', async () => {
    render(
      <PostTagPopoverWrapper taggers={mockTaggers} taggersCount={3}>
        <button data-testid="trigger">Tag</button>
      </PostTagPopoverWrapper>,
    );

    fireEvent.mouseEnter(screen.getByTestId('trigger'));
    await act(async () => {
      vi.advanceTimersByTime(POPOVER_HOVER_DELAY);
    });

    expect(screen.getByTestId('avatar-Alice')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-Bob')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-Charlie')).toBeInTheDocument();
  });

  it('shows overflow counter when more taggers than visible', async () => {
    render(
      <PostTagPopoverWrapper taggers={mockTaggers} taggersCount={10}>
        <button data-testid="trigger">Tag</button>
      </PostTagPopoverWrapper>,
    );

    fireEvent.mouseEnter(screen.getByTestId('trigger'));
    await act(async () => {
      vi.advanceTimersByTime(POPOVER_HOVER_DELAY);
    });

    expect(screen.getByText('+7')).toBeInTheDocument();
  });

  it('hides popover on mouse leave', async () => {
    render(
      <PostTagPopoverWrapper taggers={mockTaggers} taggersCount={3}>
        <button data-testid="trigger">Tag</button>
      </PostTagPopoverWrapper>,
    );

    fireEvent.mouseEnter(screen.getByTestId('trigger'));
    await act(async () => {
      vi.advanceTimersByTime(POPOVER_HOVER_DELAY);
    });

    expect(screen.getByTestId('avatar-Alice')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByTestId('trigger'));
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_HOVER_CLOSE_DELAY);
    });

    expect(screen.queryByTestId('avatar-Alice')).not.toBeInTheDocument();
  });

  it('fetches all taggers when overflow popover opens for post tags', async () => {
    render(
      <PostTagPopoverWrapper taggers={mockTaggers} taggersCount={10} postId="author:post-id" tagLabel="bitcoin">
        <button data-testid="trigger">Tag</button>
      </PostTagPopoverWrapper>,
    );

    fireEvent.mouseEnter(screen.getByTestId('trigger'));
    await act(async () => {
      vi.advanceTimersByTime(POPOVER_HOVER_DELAY);
    });

    fireEvent.click(screen.getByText('+7'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchAllTaggers).toHaveBeenCalledWith('bitcoin', ['user1', 'user2', 'user3'], 10);
  });
});

describe('PostTagPopoverWrapper - Snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches snapshot with taggers (trigger only, closed state)', () => {
    const { container } = render(
      <PostTagPopoverWrapper taggers={mockTaggers} taggersCount={3}>
        <button>Tag</button>
      </PostTagPopoverWrapper>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with taggers (open state: avatars + overflow)', async () => {
    const { container } = render(
      <PostTagPopoverWrapper taggers={mockTaggers} taggersCount={10}>
        <button data-testid="trigger">Tag</button>
      </PostTagPopoverWrapper>,
    );
    fireEvent.mouseEnter(screen.getByTestId('trigger'));
    await act(async () => {
      vi.advanceTimersByTime(POPOVER_HOVER_DELAY);
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with no taggers', () => {
    const { container } = render(
      <PostTagPopoverWrapper taggers={[]} taggersCount={0}>
        <button>Tag</button>
      </PostTagPopoverWrapper>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
