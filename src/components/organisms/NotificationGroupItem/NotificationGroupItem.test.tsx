import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { NotificationType, PostChangedSource } from '@/models/notification/notification.types';
import type { GroupableNotification } from '@/organisms/NotificationsList/NotificationsList.types';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { NotificationGroupItem } from './NotificationGroupItem';

const mockUseNotificationPostContent = vi.hoisted(() =>
  vi.fn<(options: { compositeId: string | null }) => { content: string | null; isResolving: boolean }>(() => ({
    content: 'Apple releases the new iPhone',
    isResolving: false,
  })),
);

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(() => ({ profile: { name: 'Oliver', avatarUrl: undefined }, isLoading: false })),
}));

vi.mock('@/hooks/useNotificationPostContent/useNotificationPostContent', () => ({
  useNotificationPostContent: mockUseNotificationPostContent,
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({ name, avatarUrl }: { name: string; avatarUrl?: string }) => (
    <div data-testid="avatar-with-fallback" data-name={name} data-avatar={avatarUrl} />
  ),
}));

function render(ui: ReactElement) {
  return rtlRender(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

/** Titles are tagged with data-cy (Cypress hooks), not data-testid. */
const groupTitles = () => [...document.querySelectorAll('[data-cy="notification-group-item"]')];

const unreadDot = () => document.querySelector('[data-cy="notification-unread-dot"]');

/**
 * The distinct posts whose titles have been asked for. Counting calls would instead count
 * re-renders, which says nothing about how many posts were fetched.
 */
const requestedPosts = () => new Set(mockUseNotificationPostContent.mock.calls.map(([options]) => options.compositeId));

/** Fixed so fixtures do not shift when tests are added or reordered. */
const NOW = new Date('2026-01-01T12:00:00Z').getTime();

function member(
  type: NotificationType.PostDeleted | NotificationType.PostEdited,
  index: number,
  postKind?: string,
): GroupableNotification {
  // 37 minutes back, matching the design's example row, then one minute per member.
  const timestamp = NOW - 37 * 60_000 - index * 60_000;
  const postUri = `pubky://oliver/pub/pubky.app/posts/post-${timestamp}`;
  const shared = {
    id: `${type}:${timestamp}:oliver`,
    timestamp,
    linked_uri: `pubky://viewer/pub/pubky.app/posts/linked-${timestamp}`,
    post_kind: postKind,
  };

  return type === NotificationType.PostDeleted
    ? {
        ...shared,
        type: NotificationType.PostDeleted,
        delete_source: PostChangedSource.Reply,
        deleted_by: 'oliver',
        deleted_uri: postUri,
      }
    : {
        ...shared,
        type: NotificationType.PostEdited,
        edit_source: PostChangedSource.Reply,
        edited_by: 'oliver',
        edited_uri: postUri,
      };
}

function buildGroup(
  type: NotificationType.PostDeleted | NotificationType.PostEdited,
  size: number,
  kindBucket: 'collection' | 'long' | 'post' = 'post',
): GroupableNotification[] {
  const postKind = kindBucket === 'post' ? 'short' : kindBucket;
  return Array.from({ length: size }, (_, index) => member(type, index, postKind));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  mockUseNotificationPostContent.mockReturnValue({ content: 'Apple releases the new iPhone', isResolving: false });
  vi.mocked(useUserProfile).mockReturnValue({
    profile: { name: 'Oliver', avatarUrl: undefined },
    isLoading: false,
  } as ReturnType<typeof useUserProfile>);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotificationGroupItem - deleted groups', () => {
  it('renders the total as a single flat row', () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 8)} isUnread={false} />);

    expect(screen.getByText('deleted 8 posts you interacted with')).toBeInTheDocument();
  });

  it('renders no post titles, no toggle and no post link', () => {
    const { container } = render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 8)} isUnread={false} />,
    );

    expect(groupTitles()).toHaveLength(0);
    expect(document.querySelector('[data-cy="notification-group-toggle"]')).not.toBeInTheDocument();
    expect(mockUseNotificationPostContent).not.toHaveBeenCalled();

    // The only links are the avatar and the username, both pointing at the actor's profile.
    const hrefs = [...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'));
    expect(hrefs).toEqual(['/profile/oliver', '/profile/oliver']);
  });

  it('uses kind-specific copy for a collection group', () => {
    render(
      <NotificationGroupItem
        notifications={buildGroup(NotificationType.PostDeleted, 3, 'collection')}
        isUnread={false}
      />,
    );

    expect(screen.getByText('deleted 3 collections you interacted with')).toBeInTheDocument();
  });

  it('uses kind-specific copy for an article group', () => {
    render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 4, 'long')} isUnread={false} />,
    );

    expect(screen.getByText('deleted 4 articles you interacted with')).toBeInTheDocument();
  });
});

describe('NotificationGroupItem - edited groups', () => {
  it('hides every title behind a Show toggle while collapsed', () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} />);

    expect(screen.getByText('edited 3 posts you interacted with')).toBeInTheDocument();
    expect(groupTitles()).toHaveLength(0);
    expect(screen.getByRole('button')).toHaveTextContent('Show');
  });

  it('does not resolve any title until expanded, keeping the fetches lazy', async () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 5)} isUnread={false} />);

    expect(mockUseNotificationPostContent).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button'));

    // Every title is fetched only once it is actually on screen — this is what
    // regresses if the collapsed titles are ever force-mounted.
    expect(groupTitles()).toHaveLength(5);
    expect(requestedPosts().size).toBe(5);
  });

  it('uses kind-specific copy for a collection group', () => {
    render(
      <NotificationGroupItem
        notifications={buildGroup(NotificationType.PostEdited, 3, 'collection')}
        isUnread={false}
      />,
    );

    expect(screen.getByText('updated 3 collections')).toBeInTheDocument();
  });

  it('uses kind-specific copy for an article group', () => {
    render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3, 'long')} isUnread={false} />,
    );

    expect(screen.getByText('updated 3 articles')).toBeInTheDocument();
  });

  it('names the toggle for screen readers by the group it belongs to', async () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} />);

    expect(screen.getByRole('button')).toHaveAccessibleName('Show the 3 posts edited by Oliver');

    await userEvent.click(screen.getByRole('button'));

    // The toggle relocates below the list on expand, so it must be queried afresh.
    expect(screen.getByRole('button')).toHaveAccessibleName('Hide the posts edited by Oliver');
  });

  it('counts every post in the toggle name, including for the smallest group', () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 2)} isUnread={false} />);

    expect(screen.getByRole('button')).toHaveAccessibleName('Show the 2 posts edited by Oliver');
  });

  it.each([
    ['collection', 'Show the 3 collections updated by Oliver', 'Hide the collections updated by Oliver'],
    ['long', 'Show the 3 articles updated by Oliver', 'Hide the articles updated by Oliver'],
  ])('matches the toggle name to the %s copy, which says updated', async (kindBucket, showLabel, hideLabel) => {
    render(
      <NotificationGroupItem
        notifications={buildGroup(NotificationType.PostEdited, 3, kindBucket as 'collection' | 'long')}
        isUnread={false}
      />,
    );

    expect(screen.getByRole('button')).toHaveAccessibleName(showLabel);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveAccessibleName(hideLabel);
  });

  it('mounts no titles before the first expand, keeping every fetch lazy', () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 5)} isUnread={false} />);

    expect(groupTitles()).toHaveLength(0);
    expect(requestedPosts().size).toBe(0);
  });

  it('renders nothing for an empty run instead of crashing', () => {
    const { container } = render(<NotificationGroupItem notifications={[]} isUnread={false} />);

    expect(container.querySelector('[data-cy="notification-group"]')).toBeNull();
  });

  it('expands to every title and swaps the toggle to Hide, then collapses again', async () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(screen.getByRole('button'));

    // The toggle relocates below the list on expand, so it must be queried afresh.
    expect(groupTitles()).toHaveLength(3);
    expect(screen.getByRole('button')).toHaveTextContent('Hide');
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByRole('button'));

    // Collapsing unmounts the titles again — the local-first cache makes a re-expand a
    // cheap local re-read, so nothing needs to stay mounted while hidden.
    expect(groupTitles()).toHaveLength(0);
    expect(screen.getByRole('button')).toHaveTextContent('Show');
  });

  it('never fetches new posts across collapse and re-expand cycles', async () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} />);

    await userEvent.click(screen.getByRole('button'));
    const postsAfterFirstExpand = requestedPosts();
    expect(postsAfterFirstExpand.size).toBe(3);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button'));

    // Re-expanding re-reads the same three posts — no additional post is ever requested.
    expect(groupTitles()).toHaveLength(3);
    expect(requestedPosts()).toEqual(postsAfterFirstExpand);
  });

  it('renders each title truncated to 40 characters and wrapped in double quotes', async () => {
    mockUseNotificationPostContent.mockReturnValue({
      content: 'Apple releases the new iPhone and everybody rushes to buy it',
      isResolving: false,
    });

    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 2)} isUnread={false} />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getAllByText('"Apple releases the new iPhone and everyb..."')).toHaveLength(2);
  });

  it('links each title to its post', async () => {
    const notifications = buildGroup(NotificationType.PostEdited, 2);
    const firstPostId = `post-${notifications[0].timestamp}`;

    render(<NotificationGroupItem notifications={notifications} isUnread={false} />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getAllByText('"Apple releases the new iPhone"')[0].closest('a')).toHaveAttribute(
      'href',
      `/post/oliver/${firstPostId}`,
    );
  });

  it('shows a skeleton rather than empty quotes while a title is still loading', async () => {
    mockUseNotificationPostContent.mockReturnValue({ content: null, isResolving: true });

    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 2)} isUnread={false} />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('""')).not.toBeInTheDocument();
    expect(groupTitles()).toHaveLength(2);
    expect(groupTitles()[0].querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it('falls back to a placeholder once a title has settled with nothing, never a stuck skeleton', async () => {
    mockUseNotificationPostContent.mockReturnValue({ content: null, isResolving: false });

    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 2)} isUnread={false} />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getAllByText('Untitled post')).toHaveLength(2);
    expect(groupTitles()[0].querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
  });

  it('keeps the row count in step with the group size, not with resolved titles', async () => {
    mockUseNotificationPostContent.mockReturnValue({ content: null, isResolving: false });

    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 4)} isUnread={false} />);

    expect(screen.getByText('edited 4 posts you interacted with')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));

    expect(groupTitles()).toHaveLength(4);
  });
});

describe('NotificationGroupItem - toggle placement and focus', () => {
  const header = () => document.querySelector('[data-cy="notification-group-header"]') as HTMLElement;
  // The disclosure block is the header's sibling; the collapsible content inside it is
  // not rendered at all before the first expand, so it cannot anchor the query.
  const disclosureBlock = () => header().nextElementSibling as HTMLElement;

  it('sits inline in the header row while collapsed on desktop, with the list block hidden', () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} />);

    expect(within(header()).getByRole('button')).toHaveTextContent('Show');
    expect(disclosureBlock()).toHaveClass('hidden');
  });

  it('moves below the expanded list on desktop while keeping Tab order into the titles', async () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} />);

    await userEvent.click(screen.getByRole('button'));

    expect(within(header()).queryByRole('button')).not.toBeInTheDocument();
    expect(disclosureBlock()).not.toHaveClass('hidden');
    // The toggle precedes the titles in the DOM (so Tab moves from it into the links it
    // just revealed) and order-last renders it visually below the list.
    expect(disclosureBlock().firstElementChild).toHaveAttribute('data-cy', 'notification-group-toggle');
    expect(within(disclosureBlock()).getByRole('button')).toHaveClass('order-last');
  });

  it('moves focus with the toggle as it relocates on desktop', async () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('Hide');
    expect(screen.getByRole('button')).toHaveFocus();

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('Show');
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('always renders every title without any toggle on mobile', () => {
    render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} isMobile />,
    );

    // The list stacks vertically anyway, so mobile keeps the expanded state permanently.
    expect(groupTitles()).toHaveLength(3);
    expect(requestedPosts().size).toBe(3);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(disclosureBlock()).not.toHaveClass('hidden');
  });
});

describe('NotificationGroupItem - shared row chrome', () => {
  it('shows the unread badge when the group is unread', () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 2)} isUnread={true} />);

    expect(unreadDot()).toBeInTheDocument();
  });

  it('hides the unread badge when the group is read', () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 2)} isUnread={false} />);

    expect(unreadDot()).toBeNull();
  });

  it('uses the trash icon for a deleted group', () => {
    const { container } = render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 2)} isUnread={false} />,
    );

    expect(container.querySelector('.lucide-trash-2')).toBeInTheDocument();
  });

  it('keeps the notification-type icon for a plain post group', () => {
    const { container } = render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 2)} isUnread={false} />,
    );

    expect(container.querySelector('.lucide-sticky-note')).toBeInTheDocument();
    expect(container.querySelector('.lucide-library')).not.toBeInTheDocument();
  });

  it('uses the collection icon for a collection group', () => {
    const { container } = render(
      <NotificationGroupItem
        notifications={buildGroup(NotificationType.PostEdited, 2, 'collection')}
        isUnread={false}
      />,
    );

    expect(container.querySelector('.lucide-library')).toBeInTheDocument();
  });

  it('keeps the media kind icon when every member shares one kind', () => {
    const { container } = render(
      <NotificationGroupItem
        notifications={[
          member(NotificationType.PostEdited, 0, 'image'),
          member(NotificationType.PostEdited, 1, 'image'),
        ]}
        isUnread={false}
      />,
    );

    // The same two notifications rendered as single rows would show the Image icon too.
    expect(container.querySelector('.lucide-image')).toBeInTheDocument();
    expect(container.querySelector('.lucide-sticky-note')).not.toBeInTheDocument();
  });

  it('falls back to the notification-type icon when members mix media kinds', () => {
    const { container } = render(
      <NotificationGroupItem
        notifications={[
          member(NotificationType.PostEdited, 0, 'image'),
          member(NotificationType.PostEdited, 1, 'video'),
        ]}
        isUnread={false}
      />,
    );

    expect(container.querySelector('.lucide-sticky-note')).toBeInTheDocument();
    expect(container.querySelector('.lucide-image')).not.toBeInTheDocument();
  });

  it('shows the newest member timestamp', () => {
    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 3)} isUnread={false} />);

    // Members are one minute apart, so only the head's 37m may show.
    expect(screen.getByText('37m')).toBeInTheDocument();
    expect(screen.queryByText('38m')).not.toBeInTheDocument();
  });

  it('falls back to the generic user label when the profile is missing', () => {
    vi.mocked(useUserProfile).mockReturnValue({ profile: null, isLoading: false } as ReturnType<typeof useUserProfile>);

    render(<NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 2)} isUnread={false} />);

    expect(screen.getByText('User')).toBeInTheDocument();
  });
});

describe('NotificationGroupItem - Snapshots', () => {
  it('matches snapshot for a deleted group', () => {
    const { container } = render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 8)} isUnread={true} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for a collapsed edited group', () => {
    const { container } = render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for an expanded edited group', async () => {
    const { container } = render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} />,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('NotificationGroupItem - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostDeleted, 8)} isUnread isMobile />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for an always-expanded edited group on mobile viewport', () => {
    const { container } = render(
      <NotificationGroupItem notifications={buildGroup(NotificationType.PostEdited, 3)} isUnread={false} isMobile />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
