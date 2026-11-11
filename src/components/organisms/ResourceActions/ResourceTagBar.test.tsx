import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMergedTag } from '@/hooks/useOtherLinkTags/useOtherLinkTags.types';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { ResourceTagBar } from './ResourceTagBar';
import { MAX_OTHER_TAGS } from './ResourceTagBar.utils';

const LABEL = 'Tags on this city';

const mocks = vi.hoisted(() => ({
  isSignedIn: true,
  isMobile: false,
  signInRequests: 0,
  inputProps: [] as {
    autoFocus?: boolean;
    showCloseButton?: boolean;
    onClick?: () => void;
    onBlur?: () => void;
    onClose?: () => void;
  }[],
  tags: [] as NexusTag[],
  addTag: vi.fn(),
  toggleTag: vi.fn(),
  onAddingChange: vi.fn(),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: mocks.isSignedIn,
    requireAuth: (action: () => unknown) => {
      if (mocks.isSignedIn) return action();
      mocks.signInRequests += 1;
      return undefined;
    },
  }),
}));
vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: (tags: unknown[]) => ({ enrichedTags: tags, isLoading: false }),
}));
// The hover detail as the content it is given (the default avatars when none).
vi.mock('@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper', () => ({
  PostTagPopoverWrapper: ({ children, content }: { children: ReactNode; content?: ReactNode }) => (
    <>
      {children}
      {content && <div data-testid="tag-detail">{content}</div>}
    </>
  ),
}));
vi.mock('@/molecules/TaggedList/TaggedList', () => ({
  TaggedList: ({
    tags,
    onTagToggle,
    renderExpandedTaggers,
  }: {
    tags: TagWithAvatars[];
    onTagToggle: (tag: TagWithAvatars) => unknown;
    renderExpandedTaggers?: (tag: TagWithAvatars) => ReactNode;
  }) => (
    <div data-testid="tagged-list">
      {tags.map((tag) => (
        <div key={tag.label} data-secondary={tag.isSecondary ?? false} data-total={tag.total ?? 'none'}>
          <button type="button" onClick={() => void onTagToggle(tag)}>
            {tag.label}
            {tag.taggers_count}
          </button>
          {renderExpandedTaggers?.(tag)}
        </div>
      ))}
    </div>
  ),
}));
// Who tagged it, as the groups and row ends it is given.
vi.mock('@/molecules/WhoTaggedExpandedList/WhoTaggedExpandedList', () => ({
  WhoTaggedExpandedList: ({
    taggerIds,
    secondaryTaggerIds = [],
    groupNames,
    moreCount,
    renderTaggerAside,
  }: {
    taggerIds: string[];
    secondaryTaggerIds?: string[];
    groupNames?: readonly string[];
    moreCount?: number;
    renderTaggerAside?: (id: string) => ReactNode;
  }) => (
    <div data-testid="tag-people" data-groups={groupNames?.join('|')} data-more={moreCount}>
      {[taggerIds, secondaryTaggerIds].map((ids, group) => (
        <div key={group} data-testid={`tag-people-${group}`}>
          {ids.map((id) => (
            <div key={id} data-testid="tag-person" data-id={id}>
              {renderTaggerAside?.(id)}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
}));
vi.mock('@/molecules/ResourceCard/ResourceSourceIcon', () => ({
  ResourceSourceIcon: ({ uri }: { uri: string }) => <i data-testid="source-icon" data-uri={uri} />,
}));
vi.mock('@/molecules/TagInput/TagInput', () => ({
  TagInput: ({
    onTagAdd,
    ...props
  }: {
    onTagAdd: (label: string) => unknown;
    autoFocus?: boolean;
    showCloseButton?: boolean;
    onClick?: () => void;
    onBlur?: () => void;
    onClose?: () => void;
  }) => {
    mocks.inputProps.push(props);
    return (
      <button type="button" data-testid="tag-input" onClick={() => void onTagAdd('funk')}>
        input
      </button>
    );
  },
}));

// The tags of a Nexus `GET /v1/resource/by-uri` answer for an OSM node (taggers shortened).
const NEXUS_TAGS: NexusTag[] = [
  { label: 'berlin', taggers: ['a', 'b', 'c'], taggers_count: 3, relationship: false, tag_uri: null },
  { label: 'travel', taggers: ['viewer', 'b'], taggers_count: 2, relationship: true, tag_uri: 'pubky://viewer/x' },
  { label: 'city', taggers: ['a'], taggers_count: 1, relationship: false, tag_uri: null },
];

// A link with more tags than the post footer shows (the YouTube video of "Never Gonna Give You Up" had 7).
const MANY_TAGS: NexusTag[] = ['music', '80s', 'rickroll', 'pop', 'meme', 'classic', 'dance'].map((label) => ({
  label,
  taggers: ['a'],
  taggers_count: 1,
  relationship: false,
  tag_uri: null,
}));

const chipLabels = () =>
  within(screen.getByTestId('resource-tag-bar'))
    .queryAllByRole('button')
    .filter((button) => button.dataset.cy !== 'post-tag-add-button' && button.dataset.testid !== 'tag-input')
    .map((chip) => chip.textContent);

/** The bar as the zone renders it: the tags it read once, whether they are expanded, whether "+" shows the input. */
function TagBar({
  isExpanded = false,
  isAdding = false,
  ...other
}: { isExpanded?: boolean; isAdding?: boolean } & Pick<
  React.ComponentProps<typeof ResourceTagBar>,
  'otherTags' | 'uri'
>) {
  return (
    <ResourceTagBar
      resourceTags={{
        tags: mocks.tags,
        isLoading: false,
        isError: false,
        isAtReadLimit: false,
        addTag: mocks.addTag,
        toggleTag: mocks.toggleTag,
      }}
      label={LABEL}
      isExpanded={isExpanded}
      isAdding={isAdding}
      onAddingChange={mocks.onAddingChange}
      {...other}
    />
  );
}

const LINK = 'https://www.openstreetmap.org/node/240109189';
const service = (name: string, taggers: string[]) => ({
  uri: `https://${name.toLowerCase()}.example/x`,
  name,
  count: taggers.length,
  taggers,
});
// The other services' tags of the same thing, merged (`mergeOtherLinkTags`): `travel` is on the link too
// (`b` tagged it here and on Wikipedia), `capital` and `europe` are only there.
const OTHER_TAGS: TMergedTag[] = [
  {
    label: 'travel',
    taggers: ['b', 'c', 'd'],
    count: 3,
    isComplete: true,
    sources: [service('Wikipedia', ['b', 'c']), service('Wikidata', ['d', 'b'])],
  },
  { label: 'capital', taggers: ['e', 'f'], count: 2, isComplete: true, sources: [service('Wikidata', ['e', 'f'])] },
  { label: 'europe', taggers: ['e'], count: 1, isComplete: true, sources: [service('Wikipedia', ['e'])] },
];
const TWO_TAGS = NEXUS_TAGS.slice(0, 2);
const secondaryChips = () =>
  within(screen.getByTestId('resource-tag-bar'))
    .getAllByRole('button')
    .filter((button) => button.dataset.variant === 'secondary');

describe('ResourceTagBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSignedIn = true;
    mocks.isMobile = false;
    mocks.signInRequests = 0;
    mocks.inputProps = [];
    mocks.tags = NEXUS_TAGS;
    mocks.addTag.mockResolvedValue({ success: true });
  });

  it('shows each tag with its count, the viewer’s own selected, then "+"', () => {
    render(<TagBar />);

    const bar = screen.getByTestId('resource-tag-bar');
    const chips = within(bar)
      .getAllByRole('button')
      .filter((button) => button.dataset.cy !== 'post-tag-add-button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['berlin3', 'travel2', 'city1']);
    expect(chips[1]).toHaveAttribute('aria-pressed', 'true');
    expect(chips[0]).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Add new tag' })).toBeInTheDocument();
  });

  it('shows only the first tags that fit the post footer’s budget, in order, then "+"', () => {
    mocks.tags = MANY_TAGS;
    render(<TagBar />);

    expect(chipLabels()).toEqual(['music1', '80s1', 'rickroll1']);
    expect(screen.getByRole('button', { name: 'Add new tag' })).toBeInTheDocument();
    expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument();
  });

  it('is the post’s tags panel when expanded: the input on top, then every tag on its own line', async () => {
    mocks.tags = MANY_TAGS;
    render(<TagBar isExpanded />);

    const input = await screen.findByTestId('tag-input');
    const list = screen.getByTestId('tagged-list');
    expect(input.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chipLabels()).toEqual(MANY_TAGS.map((tag) => `${tag.label}1`));
    expect(within(list).getAllByRole('button')).toHaveLength(MANY_TAGS.length);
    expect(screen.queryByRole('button', { name: 'Add new tag' })).not.toBeInTheDocument();
    // It stays open until the Tags button collapses the tags (no close button), and focuses only off a phone.
    expect(mocks.inputProps.at(-1)?.showCloseButton).toBeUndefined();
    expect(mocks.inputProps.at(-1)).toMatchObject({ autoFocus: true });
  });

  it('follows the Tags button like the post’s: panel with the input, then a few chips and "+", then the panel', async () => {
    mocks.tags = MANY_TAGS;
    const { rerender } = render(<TagBar />);
    expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument();

    rerender(<TagBar isExpanded />);
    expect(await screen.findByTestId('tag-input')).toBeInTheDocument();
    expect(screen.getByTestId('tagged-list')).toBeInTheDocument();

    rerender(<TagBar />);
    await waitFor(() => expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument());
    expect(screen.queryByTestId('tagged-list')).not.toBeInTheDocument();
    expect(chipLabels()).toEqual(['music1', '80s1', 'rickroll1']);
    expect(screen.getByRole('button', { name: 'Add new tag' })).toBeInTheDocument();

    rerender(<TagBar isExpanded />);
    expect(await screen.findByTestId('tag-input')).toBeInTheDocument();
    expect(screen.getByTestId('tagged-list')).toBeInTheDocument();
  });

  it('toggles the viewer’s tag from the expanded list, asking to sign in when signed out', async () => {
    const { unmount } = render(<TagBar isExpanded />);
    fireEvent.click(within(await screen.findByTestId('tagged-list')).getByRole('button', { name: 'travel2' }));
    expect(mocks.toggleTag).toHaveBeenCalledWith(expect.objectContaining({ label: 'travel', relationship: true }));
    unmount();

    mocks.isSignedIn = false;
    render(<TagBar isExpanded />);
    fireEvent.click(within(await screen.findByTestId('tagged-list')).getByRole('button', { name: 'berlin3' }));
    expect(mocks.toggleTag).toHaveBeenCalledTimes(1);
    expect(mocks.signInRequests).toBe(1);
  });

  it('does not pop the phone keyboard when expanded, only from "+"', async () => {
    mocks.isMobile = true;
    const { rerender } = render(<TagBar isExpanded />);
    await screen.findByTestId('tag-input');
    expect(mocks.inputProps.at(-1)).toMatchObject({ autoFocus: false });

    rerender(<TagBar isAdding />);

    expect(mocks.inputProps.at(-1)).toMatchObject({ autoFocus: true, showCloseButton: true });
  });

  it('shows a few tags again once collapsed', async () => {
    mocks.tags = MANY_TAGS;
    const { rerender } = render(<TagBar isExpanded />);
    await screen.findByTestId('tag-input');

    rerender(<TagBar />);

    expect(chipLabels()).toEqual(['music1', '80s1', 'rickroll1']);
    await waitFor(() => expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument());
  });

  it('keeps every tag and the input after a tag is added while expanded', async () => {
    mocks.tags = MANY_TAGS;
    render(<TagBar isExpanded />);

    fireEvent.click(await screen.findByTestId('tag-input'));

    await waitFor(() => expect(mocks.addTag).toHaveBeenCalledWith('funk'));
    expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    expect(chipLabels()).toHaveLength(MANY_TAGS.length);
  });

  it('names what is tagged as the list’s accessible name, not as visible text', () => {
    render(<TagBar />);

    expect(screen.getByRole('group', { name: LABEL })).toBe(screen.getByTestId('resource-tag-bar'));
    expect(screen.queryByText(LABEL)).not.toBeInTheDocument();
  });

  it('shows only "+" for a link nobody tagged', () => {
    mocks.tags = [];
    render(<TagBar />);

    const bar = screen.getByTestId('resource-tag-bar');
    expect(within(bar).getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add new tag' })).toBeInTheDocument();
  });

  it('toggles the viewer’s tag on a click', () => {
    render(<TagBar />);

    fireEvent.click(screen.getByText('travel'));

    expect(mocks.toggleTag).toHaveBeenCalledWith(expect.objectContaining({ label: 'travel', relationship: true }));
  });

  it('asks to open the tag input from "+"', () => {
    render(<TagBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Add new tag' }));

    expect(mocks.onAddingChange).toHaveBeenCalledWith(true);
  });

  it('adds the typed tag and keeps the input open for the next, like the post’s', async () => {
    render(<TagBar isAdding />);

    fireEvent.click(await screen.findByTestId('tag-input'));

    await waitFor(() => expect(mocks.addTag).toHaveBeenCalledWith('funk'));
    expect(mocks.onAddingChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('tag-input')).toBeInTheDocument();
  });

  it('closes the input on blur and on its close button', async () => {
    render(<TagBar isAdding />);
    await screen.findByTestId('tag-input');
    const input = mocks.inputProps.at(-1);

    input?.onBlur?.();
    input?.onClose?.();

    expect(mocks.onAddingChange.mock.calls).toEqual([[false], [false]]);
  });

  it('asks to sign in before tagging when signed out', () => {
    mocks.isSignedIn = false;
    render(<TagBar />);

    fireEvent.click(screen.getByText('berlin'));
    fireEvent.click(screen.getByRole('button', { name: 'Add new tag' }));

    expect(mocks.toggleTag).not.toHaveBeenCalled();
    expect(mocks.onAddingChange).not.toHaveBeenCalled();
    expect(mocks.signInRequests).toBe(2);
  });

  it('does not focus the expanded input when signed out, and a click on it asks to sign in', async () => {
    mocks.isSignedIn = false;
    render(<TagBar isExpanded />);
    await screen.findByTestId('tag-input');

    const input = mocks.inputProps.at(-1);
    expect(input).toMatchObject({ autoFocus: false });
    input?.onClick?.();

    expect(mocks.signInRequests).toBe(1);
  });

  it('counts on an own chip the people across services too, muted after its own count', () => {
    render(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);

    // Own tags fill the three places: no secondary chip.
    expect(chipLabels()).toEqual(['berlin3', 'travel2(4)', 'city1']);
    expect(secondaryChips()).toHaveLength(0);
    const travel = screen.getByText('travel').closest('button');
    expect(travel).toHaveAccessibleName('travel, 2 here, 4 across services');
    expect(within(travel!).getByTestId('tag-total')).toHaveTextContent('(4)');
    // A label only on this link keeps the post tag's own name and count.
    expect(screen.getByText('berlin').closest('button')).toHaveAccessibleName('berlin tag (3 posts)');
  });

  it('fills the places the own tags leave free with the other services’ tags, most popular first, as secondary chips', () => {
    mocks.tags = TWO_TAGS;
    render(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);

    expect(chipLabels()).toEqual(['berlin3', 'travel2(4)', 'capital2']);
    const [capital] = secondaryChips();
    expect(capital).toHaveTextContent('capital2');
    expect(capital).toHaveAccessibleName('capital, 2 on other services, add it here');
    expect(capital).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows no total when the other services add nobody: one person on two services counts once', () => {
    mocks.tags = [{ label: 'travel', taggers: ['c', 'd'], taggers_count: 2, relationship: false, tag_uri: null }];
    render(<TagBar otherTags={[{ ...OTHER_TAGS[0], taggers: ['c', 'd'], count: 2 }]} uri={LINK} />);

    expect(chipLabels()).toEqual(['travel2']);
    expect(screen.getByText('travel').closest('button')).toHaveAccessibleName('travel, 2 here, 2 across services');
  });

  it('shows the own tags alone when no other service has tags', () => {
    mocks.tags = TWO_TAGS;
    render(<TagBar otherTags={[]} uri={LINK} />);

    expect(chipLabels()).toEqual(['berlin3', 'travel2']);
    expect(screen.queryByTestId('tag-detail')).not.toBeInTheDocument();
  });

  it('adds a secondary chip’s tag to this link, asking to sign in when signed out', () => {
    mocks.tags = TWO_TAGS;
    const { unmount } = render(<TagBar otherTags={OTHER_TAGS} />);
    fireEvent.click(secondaryChips()[0]);
    expect(mocks.addTag).toHaveBeenCalledWith('capital');
    expect(mocks.toggleTag).not.toHaveBeenCalled();
    unmount();

    mocks.isSignedIn = false;
    render(<TagBar otherTags={OTHER_TAGS} />);
    fireEvent.click(secondaryChips()[0]);
    expect(mocks.addTag).toHaveBeenCalledTimes(1);
    expect(mocks.signInRequests).toBe(1);
  });

  it('details who tagged a label once each: this link’s taggers, then the others, with the icons of where they tagged it', () => {
    mocks.tags = TWO_TAGS;
    render(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);

    // Only the chips whose label is on other services get the detail: travel (own) and capital (secondary).
    const [travel, capital] = screen.getAllByTestId('tag-detail');
    expect(screen.getAllByTestId('tag-detail')).toHaveLength(2);
    const people = within(travel).getByTestId('tag-people');
    expect(people).toHaveAttribute('data-groups', 'Tagged on this link|Tagged only on other services');
    expect(people).toHaveAttribute('data-more', '0');
    const ids = (group: number) =>
      within(within(travel).getByTestId(`tag-people-${group}`))
        .getAllByTestId('tag-person')
        .map((person) => person.dataset.id);
    expect(ids(0)).toEqual(['viewer', 'b']);
    expect(ids(1)).toEqual(['c', 'd']);
    const icons = (id: string) =>
      within(
        within(travel)
          .getAllByTestId('tag-person')
          .find((person) => person.dataset.id === id)!,
      )
        .queryAllByTestId('source-icon')
        .map((icon) => icon.dataset.uri);
    expect(icons('b')).toEqual([LINK, 'https://wikipedia.example/x', 'https://wikidata.example/x']);
    expect(icons('viewer')).toEqual([LINK]);
    expect(icons('c')).toEqual(['https://wikipedia.example/x']);
    expect(within(travel).getByText('Tagged here and on Wikipedia, Wikidata')).toHaveClass('sr-only');
    expect(within(travel).getByText('Tagged on Wikipedia')).toHaveClass('sr-only');

    expect(within(within(capital).getByTestId('tag-people-0')).queryAllByTestId('tag-person')).toHaveLength(0);
    expect(
      within(within(capital).getByTestId('tag-people-1'))
        .getAllByTestId('tag-person')
        .map((person) => person.dataset.id),
    ).toEqual(['e', 'f']);
  });

  it('keeps "+N" for the people Nexus counts but does not list', () => {
    mocks.tags = [{ ...TWO_TAGS[1], taggers_count: 6 }];
    render(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);

    // viewer and b here (6 counted), c and d elsewhere: at least 6 people, 4 listed.
    const [travel] = screen.getAllByTestId('tag-detail');
    expect(within(travel).getByTestId('tag-people')).toHaveAttribute('data-more', '2');
    expect(screen.getByText('travel').closest('button')).toHaveAccessibleName(
      'travel, 6 here, at least 6 across services',
    );
  });

  it('lists every other services’ tag after the own ones once expanded, secondary, with the same detail', async () => {
    render(<TagBar isExpanded otherTags={OTHER_TAGS} uri={LINK} />);

    const list = await screen.findByTestId('tagged-list');
    expect(chipLabels()).toEqual(['berlin3', 'travel2', 'city1', 'capital2', 'europe1']);
    const rows = [...list.children] as HTMLElement[];
    expect(rows.map((row) => row.dataset.secondary)).toEqual(['false', 'false', 'false', 'true', 'true']);
    expect(rows.map((row) => row.dataset.total)).toEqual(['none', '4', 'none', 'none', 'none']);
    expect(within(rows[1]).getByTestId('tag-people')).toBeInTheDocument();
    expect(within(rows[0]).queryByTestId('tag-people')).not.toBeInTheDocument();

    fireEvent.click(within(rows[3]).getByRole('button', { name: 'capital2' }));
    expect(mocks.addTag).toHaveBeenCalledWith('capital');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'travel2' }));
    expect(mocks.toggleTag).toHaveBeenCalledWith(expect.objectContaining({ label: 'travel', relationship: true }));
  });

  it('turns a secondary chip into an own one once the viewer added its tag, with no second chip', () => {
    mocks.tags = TWO_TAGS;
    const { rerender } = render(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);
    fireEvent.click(secondaryChips()[0]);
    expect(mocks.addTag).toHaveBeenCalledWith('capital');

    // The write is applied to the link's own tags (`useResourceTags`): `capital` is now the viewer's here.
    mocks.tags = [
      ...TWO_TAGS,
      { label: 'capital', taggers: ['viewer'], taggers_count: 1, relationship: true, tag_uri: 'pubky://viewer/c' },
    ];
    rerender(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);

    expect(chipLabels()).toEqual(['berlin3', 'travel2(4)', 'capital1(3)']);
    expect(secondaryChips()).toHaveLength(0);
    expect(screen.getByText('capital').closest('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('lists at most MAX_OTHER_TAGS other services’ tags once expanded', async () => {
    mocks.tags = [];
    const many = Array.from({ length: MAX_OTHER_TAGS + 5 }, (_, index) => ({
      label: `t${String(index).padStart(2, '0')}`,
      taggers: ['e'],
      count: 1,
      isComplete: true,
      sources: [service('Wikidata', ['e'])],
    }));
    render(<TagBar isExpanded otherTags={many} uri={LINK} />);

    const rows = [...(await screen.findByTestId('tagged-list')).children] as HTMLElement[];
    expect(rows).toHaveLength(MAX_OTHER_TAGS);
    expect(rows.every((row) => row.dataset.secondary === 'true')).toBe(true);
  });

  it('shows one icon for this link’s own site when a person also tagged another spelling there', () => {
    mocks.tags = [TWO_TAGS[1]];
    // Named like another service (a mislabelled entry): dropping it must not drop that service's icon.
    const sameSite = { uri: 'https://www.openstreetmap.org/way/1', name: 'Wikipedia', count: 1, taggers: ['b'] };
    render(<TagBar otherTags={[{ ...OTHER_TAGS[0], sources: [sameSite, ...OTHER_TAGS[0].sources] }]} uri={LINK} />);

    const [detail] = screen.getAllByTestId('tag-detail');
    const b = within(detail)
      .getAllByTestId('tag-person')
      .find((person) => person.dataset.id === 'b')!;
    expect(
      within(b)
        .getAllByTestId('source-icon')
        .map((icon) => icon.dataset.uri),
    ).toEqual([LINK, 'https://wikipedia.example/x', 'https://wikidata.example/x']);
  });

  it('compares labels as Nexus stores them, case-folded', () => {
    mocks.tags = [{ ...TWO_TAGS[1], label: 'Travel' }];
    render(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);

    expect(chipLabels()).toEqual(['Travel2(4)', 'capital2', 'europe1']);
  });
});
