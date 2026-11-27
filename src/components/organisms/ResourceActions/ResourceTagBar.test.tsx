import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { TMergedTag } from '@/hooks/useOtherLinkTags/useOtherLinkTags.types';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { ResourceTagBar, SUGGESTION_PRESS_GUARD_MS } from './ResourceTagBar';
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
  isLoading: false,
  addTag: vi.fn(),
  toggleTag: vi.fn(),
  onAddingChange: vi.fn(),
  enrichedInputs: [] as unknown[][],
  rowButton: vi.fn(),
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
  useEnrichedTags: (tags: unknown[]) => {
    mocks.enrichedInputs.push(tags);
    return { enrichedTags: tags, isLoading: false };
  },
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
          {/* A row's other controls, as its tag search link */}
          <a
            href={`/search?tags=${tag.label}`}
            aria-label={`Search ${tag.label}`}
            onClick={(event) => {
              event.preventDefault();
              mocks.rowButton(tag.label);
            }}
          />
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
  'otherTags' | 'uri' | 'scope' | 'control' | 'inline' | 'suggestedLabels'
>) {
  return (
    <ResourceTagBar
      resourceTags={{
        tags: mocks.tags,
        isLoading: mocks.isLoading,
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
    mocks.isLoading = false;
    mocks.addTag.mockResolvedValue({ success: true });
  });

  it('hands the tagger lookup one list while the tags stay the same, a new one once they change', () => {
    // A new list on every render made useEnrichedTags look up the taggers again (a Dexie live query) and its
    // answer render the bar again: a page with cards kept a CPU core busy for as long as it was open.
    mocks.enrichedInputs = [];
    const { rerender } = render(<TagBar />);
    rerender(<TagBar />);
    rerender(<TagBar />);
    expect(new Set(mocks.enrichedInputs).size).toBe(1);

    mocks.tags = TWO_TAGS;
    rerender(<TagBar />);
    const changed = mocks.enrichedInputs[mocks.enrichedInputs.length - 1];
    expect(changed).not.toBe(mocks.enrichedInputs[0]);
    expect(changed).toHaveLength(2);

    // The resource page: the other services' tags join the list, the same while they stay the same.
    mocks.enrichedInputs = [];
    rerender(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);
    rerender(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);
    rerender(<TagBar otherTags={[...OTHER_TAGS]} uri={LINK} />);
    expect(new Set(mocks.enrichedInputs).size).toBe(1);
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

  it('shows inline the same chips, right-aligned from sm up, with no "+"', () => {
    mocks.tags = MANY_TAGS;
    render(<TagBar inline />);

    expect(chipLabels()).toEqual(['music1', '80s1', 'rickroll1']);
    expect(screen.getByTestId('resource-tag-bar')).toHaveClass('sm:justify-end');
    expect(screen.queryByRole('button', { name: 'Add new tag' })).not.toBeInTheDocument();
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

    expect(chipLabels()).toEqual(['berlin3', 'travel2(4)', 'capital0(2)']);
    const [capital] = secondaryChips();
    expect(capital).toHaveTextContent('capital0(2)');
    expect(capital).toHaveAccessibleName('capital, 0 here, 2 on other services, add it here');
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
    expect(chipLabels()).toEqual(['berlin3', 'travel2', 'city1', 'capital0', 'europe0']);
    const rows = [...list.children] as HTMLElement[];
    expect(rows.map((row) => row.dataset.secondary)).toEqual(['false', 'false', 'false', 'true', 'true']);
    expect(rows.map((row) => row.dataset.total)).toEqual(['none', '4', 'none', '2', '1']);
    expect(within(rows[1]).getByTestId('tag-people')).toBeInTheDocument();
    expect(within(rows[0]).queryByTestId('tag-people')).not.toBeInTheDocument();

    fireEvent.click(within(rows[3]).getByRole('button', { name: 'capital0' }));
    expect(mocks.addTag).toHaveBeenCalledWith('capital');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'travel2' }));
    expect(mocks.toggleTag).toHaveBeenCalledWith(expect.objectContaining({ label: 'travel', relationship: true }));
  });

  it('turns a secondary chip into an own one once the viewer added its tag, with no second chip', () => {
    mocks.tags = TWO_TAGS;
    const { rerender } = render(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);
    expect(secondaryChips()[0]).toHaveTextContent('capital0(2)');
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

  it('shows a secondary chip as "0 (n)": nobody here, n counted like an own chip’s total', () => {
    mocks.tags = TWO_TAGS;
    render(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);

    const [capital] = secondaryChips();
    expect(within(capital).getByTestId('tag-count')).toHaveTextContent('0');
    expect(within(capital).getByTestId('tag-total')).toHaveTextContent('(2)');
    // The own chip next to it keeps its count and total.
    const travel = screen.getByText('travel').closest('button')!;
    expect(within(travel).getByTestId('tag-count')).toHaveTextContent('2');
    expect(within(travel).getByTestId('tag-total')).toHaveTextContent('(4)');
  });

  it('says "at least" on a secondary chip when Nexus did not list every tagger, and after a press', () => {
    mocks.tags = TWO_TAGS;
    // Spotify counts 5 people and lists 2.
    const album: TMergedTag = {
      label: 'album',
      taggers: ['x', 'y'],
      count: 5,
      isComplete: false,
      sources: [{ ...service('Spotify', ['x', 'y']), count: 5 }],
    };
    const { rerender } = render(<TagBar otherTags={[album]} uri={LINK} />);
    const [chip] = secondaryChips();
    expect(chip).toHaveTextContent('album0(5)');
    expect(chip).toHaveAccessibleName('album, 0 here, at least 5 on other services, add it here');
    fireEvent.click(chip);
    expect(mocks.addTag).toHaveBeenCalledWith('album');

    mocks.tags = [
      ...TWO_TAGS,
      { label: 'album', taggers: ['viewer'], taggers_count: 1, relationship: true, tag_uri: 'pubky://viewer/a' },
    ];
    rerender(<TagBar otherTags={[album]} uri={LINK} />);
    // The viewer may be one of the 3 Spotify does not list: still at least 5 across services.
    const own = screen.getByText('album').closest('button')!;
    expect(own).toHaveTextContent('album1(5)');
    expect(own).toHaveAccessibleName('album, 1 here, at least 5 across services');
    expect(secondaryChips()).toHaveLength(0);
  });

  it('counts the viewer once after a press when they already put the tag on another service', () => {
    mocks.tags = TWO_TAGS;
    const capital: TMergedTag = {
      label: 'capital',
      taggers: ['e', 'viewer'],
      count: 2,
      isComplete: true,
      sources: [service('Wikidata', ['e', 'viewer'])],
    };
    const { rerender } = render(<TagBar otherTags={[capital]} uri={LINK} />);
    expect(chipLabels()).toEqual(['berlin3', 'travel2', 'capital0(2)']);
    fireEvent.click(secondaryChips()[0]);
    expect(mocks.addTag).toHaveBeenCalledWith('capital');

    mocks.tags = [
      ...TWO_TAGS,
      { label: 'capital', taggers: ['viewer'], taggers_count: 1, relationship: true, tag_uri: 'pubky://viewer/c' },
    ];
    rerender(<TagBar otherTags={[capital]} uri={LINK} />);
    // 1 here, 2 in all: the viewer here and on Wikidata is one person.
    expect(chipLabels()).toEqual(['berlin3', 'travel2', 'capital1(2)']);
    expect(screen.getByText('capital').closest('button')).toHaveAccessibleName('capital, 1 here, 2 across services');
  });

  it('shows just "1" after a press when the viewer was the only one on the other services', () => {
    mocks.tags = TWO_TAGS;
    const mine: TMergedTag = {
      label: 'capital',
      taggers: ['viewer'],
      count: 1,
      isComplete: true,
      sources: [service('Wikidata', ['viewer'])],
    };
    const { rerender } = render(<TagBar otherTags={[mine]} uri={LINK} />);
    expect(chipLabels()).toEqual(['berlin3', 'travel2', 'capital0(1)']);

    mocks.tags = [
      ...TWO_TAGS,
      { label: 'capital', taggers: ['viewer'], taggers_count: 1, relationship: true, tag_uri: 'pubky://viewer/c' },
    ];
    rerender(<TagBar otherTags={[mine]} uri={LINK} />);
    // As on any own chip, no total when the other services add nobody.
    expect(chipLabels()).toEqual(['berlin3', 'travel2', 'capital1']);
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

  describe('the viewer’s tag across links', () => {
    beforeEach(() => {
      useAuthStore.setState({ currentUserPubky: 'viewer' });
      return () => useAuthStore.setState({ currentUserPubky: null });
    });
    const people = (detail: HTMLElement, group: number) =>
      within(within(detail).getByTestId(`tag-people-${group}`))
        .queryAllByTestId('tag-person')
        .map((person) => person.dataset.id);

    it('keeps the viewer among this link’s taggers when Nexus marks the tag theirs but left them out of its sample', () => {
      // Nexus counts 5 on this link, the viewer among them, and lists 2; the viewer also put it on Spotify.
      mocks.tags = [{ label: 'rock', taggers: ['a', 'b'], taggers_count: 5, relationship: true, tag_uri: null }];
      const spotify = { uri: 'https://open.spotify.com/album/1', name: 'Spotify' };
      const rock: TMergedTag = {
        label: 'rock',
        taggers: ['viewer', 'c'],
        count: 2,
        isComplete: true,
        sources: [{ ...spotify, count: 2, taggers: ['viewer', 'c'] }],
      };
      render(<TagBar otherTags={[rock]} uri={LINK} />);

      const [detail] = screen.getAllByTestId('tag-detail');
      expect(people(detail, 0)).toEqual(['viewer', 'a', 'b']);
      expect(people(detail, 1)).toEqual(['c']);
      // The viewer counts once: at least the 5 here, c may be one of the 3 not listed.
      expect(screen.getByText('rock').closest('button')).toHaveAccessibleName(
        'rock, 5 here, at least 5 across services',
      );
      expect(screen.getByText('rock').closest('button')).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows a label the viewer put only on another link as theirs, and a press adds it here, never removes it there', () => {
      mocks.tags = TWO_TAGS;
      const spotify = { uri: 'https://open.spotify.com/album/1', name: 'Spotify' };
      // Nexus marks it the viewer's on Spotify (`relationship`) though its sample of taggers left them out.
      const album: TMergedTag = {
        label: 'album',
        taggers: ['x', 'y'],
        count: 5,
        isComplete: false,
        relationship: true,
        sources: [{ ...spotify, count: 5, taggers: ['x', 'y'] }],
      };
      render(<TagBar otherTags={[album]} uri={LINK} />);

      const [chip] = secondaryChips();
      expect(chip).toHaveTextContent('album0(5)');
      expect(chip).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(chip);
      // The write is this link's own: an add here, whatever the chip shows.
      expect(mocks.addTag).toHaveBeenCalledWith('album');
      expect(mocks.toggleTag).not.toHaveBeenCalled();
    });

    it('shows an own label as the viewer’s when they hold it on another link, and a press writes by this link’s own tag', () => {
      // berlin is not the viewer's here; they put it on Spotify.
      mocks.tags = TWO_TAGS;
      const spotify = { uri: 'https://open.spotify.com/album/1', name: 'Spotify' };
      const berlin: TMergedTag = {
        label: 'berlin',
        taggers: ['viewer'],
        count: 1,
        isComplete: true,
        relationship: true,
        sources: [{ ...spotify, count: 1, taggers: ['viewer'] }],
      };
      render(<TagBar otherTags={[berlin]} uri={LINK} />);

      const chip = screen.getByText('berlin').closest('button')!;
      expect(chip).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(chip);
      // This link's own tag, unselected and with no file: the press adds it here, it removes nothing.
      expect(mocks.toggleTag).toHaveBeenCalledWith(TWO_TAGS[0]);
      expect(mocks.addTag).not.toHaveBeenCalled();
    });

    it('removes an own tag by its own file, also when the viewer holds the label elsewhere', async () => {
      mocks.tags = TWO_TAGS;
      const travel: TMergedTag = { ...OTHER_TAGS[0], relationship: true };
      render(<TagBar isExpanded otherTags={[travel]} uri={LINK} />);

      const list = await screen.findByTestId('tagged-list');
      fireEvent.click(within(list).getByRole('button', { name: 'travel2' }));
      expect(mocks.toggleTag).toHaveBeenCalledWith(TWO_TAGS[1]);
    });
  });

  it('compares labels as Nexus stores them, case-folded', () => {
    mocks.tags = [{ ...TWO_TAGS[1], label: 'Travel' }];
    render(<TagBar otherTags={OTHER_TAGS} uri={LINK} />);

    expect(chipLabels()).toEqual(['Travel2(4)', 'capital0(2)', 'europe0(1)']);
  });

  describe('a series date’s tag scope', () => {
    const FEED = 'https://www.meetup.com/bitcoin-meetup-switzerland/events/ical/';
    const allDates = (label: string, taggers: string[]): TMergedTag => ({
      label,
      taggers,
      count: taggers.length,
      isComplete: true,
      sources: [{ uri: FEED, name: 'All dates', count: taggers.length, taggers }],
    });

    it('starts with the scope’s switch, before the chips and before the expanded input', async () => {
      const control = <button type="button">This date</button>;
      const { unmount } = render(<TagBar control={control} />);
      expect(within(screen.getByTestId('resource-tag-bar')).getAllByRole('button')[0]).toHaveTextContent('This date');
      unmount();

      render(<TagBar isExpanded control={control} />);
      await screen.findByTestId('tag-input');
      const bar = screen.getByTestId('resource-tag-bar');
      expect(bar.firstElementChild?.firstElementChild).toHaveTextContent('This date');
    });

    it('says a tag on all dates is there, in the chip’s name and hover text', () => {
      mocks.tags = TWO_TAGS;
      render(
        <TagBar
          otherTags={[allDates('travel', ['b', 'x']), allDates('meetup', ['e', 'f'])]}
          uri={LINK}
          scope={{ name: 'all dates', uris: [FEED] }}
        />,
      );

      const [meetup] = secondaryChips();
      expect(meetup).toHaveAccessibleName('meetup, 0 here, 2 on all dates, add it here');
      expect(meetup).toHaveAttribute('title', 'On all dates');
      const travel = screen.getByText('travel').closest('button');
      expect(travel).toHaveAccessibleName('travel, 2 here, 3 with those on all dates');
      expect(travel).toHaveAttribute('title', 'On all dates');
      // A label only here says nothing of the other dates
      expect(screen.getByText('berlin').closest('button')).not.toHaveAttribute('title');
    });

    it('says a tag on this date is there when the bar is all dates’, with other services named apart', () => {
      mocks.tags = TWO_TAGS;
      const DATE = 'https://www.meetup.com/bitcoin-meetup-switzerland/events/frxnbvyjcqbmb/';
      const both: TMergedTag = {
        ...OTHER_TAGS[1],
        sources: [...OTHER_TAGS[1].sources, { uri: DATE, name: 'This date', count: 1, taggers: ['e'] }],
      };
      render(<TagBar otherTags={[both]} uri={FEED} scope={{ name: 'this date', uris: [DATE] }} />);

      const [capital] = secondaryChips();
      expect(capital).toHaveAccessibleName('capital, 0 here, 2 on this date and other services, add it here');
      expect(capital).toHaveAttribute('title', 'On this date');
    });
  });

  describe('suggested tags (a catalogue card’s labels)', () => {
    // A Wikidata card nobody shared (Pinakes search row: `refs: []`, `labels` from the catalogue)
    const LABELS = ['science-fiction', 'humourist', 'writer'];
    const suggestedChips = () => screen.queryAllByTestId('resource-suggested-tag');

    it('offers the labels as suggested chips, "tag +" in the look of a tag not here yet, then "+"', () => {
      mocks.tags = [];
      render(<TagBar suggestedLabels={LABELS} />);

      expect(chipLabels()).toEqual(LABELS.map((suggestion) => `${suggestion}+`));
      const [first] = suggestedChips();
      expect(first).toHaveAttribute('data-variant', 'suggested');
      expect(first.style.border).toBe('1px dashed var(--tag-edge)');
      expect(first.style.backgroundColor).toBe('color-mix(in oklab, var(--tag-edge) 12%, transparent)');
      expect(within(first).queryByTestId('tag-count')).not.toBeInTheDocument();
      expect(within(first).getByTestId('tag-suggested-mark')).toHaveTextContent('+');
      expect(first).toHaveAccessibleName('science-fiction, suggested tag, add it here');
      expect(screen.getByRole('button', { name: 'Add new tag' })).toBeInTheDocument();
    });

    it('puts them after the people’s tags, in the places the tags leave free', () => {
      mocks.tags = NEXUS_TAGS.slice(2);
      render(<TagBar suggestedLabels={LABELS} />);

      expect(chipLabels()).toEqual(['city1', 'science-fiction+', 'humourist+']);
    });

    it('shows none while the tags fill the budget', () => {
      mocks.tags = MANY_TAGS;
      render(<TagBar suggestedLabels={LABELS} />);

      expect(chipLabels()).toEqual(['music1', '80s1', 'rickroll1']);
      expect(suggestedChips()).toHaveLength(0);
    });

    it('leaves out a label a chip already shows, here or on another service, and invalid ones', () => {
      mocks.tags = TWO_TAGS;
      render(
        <TagBar
          isExpanded
          otherTags={OTHER_TAGS.slice(1, 2)}
          uri={LINK}
          suggestedLabels={['Travel', 'capital', 'has space', 'europe', 'europe']}
        />,
      );

      expect(suggestedChips().map((chip) => chip.textContent)).toEqual(['europe+']);
    });

    it('lists every suggestion under the tags once expanded, in a group named only for screen readers', async () => {
      mocks.tags = NEXUS_TAGS.slice(2);
      render(<TagBar isExpanded suggestedLabels={LABELS} />);

      const group = await screen.findByRole('group', { name: 'Suggested tags' });
      expect(
        within(group)
          .getAllByRole('button')
          .map((chip) => chip.textContent),
      ).toEqual(LABELS.map((suggestion) => `${suggestion}+`));
      expect(screen.getByTestId('resource-tag-bar')).not.toHaveTextContent('Suggested');
    });

    it('adds the viewer’s tag on a press, the input’s write; then it is their chip, no longer a suggestion', () => {
      mocks.tags = [];
      const { rerender } = render(<TagBar suggestedLabels={LABELS} />);

      fireEvent.click(screen.getByText('humourist'));
      expect(mocks.addTag).toHaveBeenCalledWith('humourist');
      expect(mocks.toggleTag).not.toHaveBeenCalled();

      // The write's optimistic state: the viewer's tag on the link
      mocks.tags = [{ label: 'humourist', taggers: ['viewer'], taggers_count: 1, relationship: true, tag_uri: null }];
      rerender(<TagBar suggestedLabels={LABELS} />);
      expect(chipLabels()).toEqual(['humourist1', 'science-fiction+', 'writer+']);
      expect(screen.getByText('humourist').closest('button')).toHaveAttribute('aria-pressed', 'true');
      expect(suggestedChips().map((chip) => chip.textContent)).toEqual(['science-fiction+', 'writer+']);
    });

    describe('a second press right after a suggestion’s', () => {
      let now: MockInstance<typeof Date.now>;
      beforeEach(() => {
        now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
      });
      afterEach(() => {
        now.mockRestore();
      });

      it('is ignored on the chip that moved there: an own, a secondary or a suggested one', () => {
        mocks.tags = [];
        const other = OTHER_TAGS.slice(2);
        const { rerender } = render(<TagBar otherTags={other} uri={LINK} suggestedLabels={LABELS} />);

        fireEvent.click(screen.getByText('science-fiction'));
        expect(mocks.addTag).toHaveBeenCalledTimes(1);
        // The added tag is the viewer's chip in front now; the next chips sit where it was.
        mocks.tags = [
          { label: 'science-fiction', taggers: ['viewer'], taggers_count: 1, relationship: true, tag_uri: null },
        ];
        rerender(<TagBar otherTags={other} uri={LINK} suggestedLabels={LABELS} />);

        now.mockReturnValue(10_000 + SUGGESTION_PRESS_GUARD_MS - 1);
        fireEvent.click(screen.getByText('humourist'));
        fireEvent.click(screen.getByText('europe'));
        fireEvent.click(screen.getByText('science-fiction'));
        expect(mocks.addTag).toHaveBeenCalledTimes(1);
        expect(mocks.toggleTag).not.toHaveBeenCalled();

        now.mockReturnValue(10_000 + SUGGESTION_PRESS_GUARD_MS);
        fireEvent.click(screen.getByText('humourist'));
        expect(mocks.addTag).toHaveBeenLastCalledWith('humourist');
      });

      it('is ignored on the expanded list’s row the added tag pushed there, its other buttons too', async () => {
        mocks.tags = [];
        const { rerender } = render(<TagBar isExpanded suggestedLabels={LABELS} />);

        const group = await screen.findByRole('group', { name: 'Suggested tags' });
        fireEvent.click(within(group).getByText('humourist'));
        expect(mocks.addTag).toHaveBeenCalledWith('humourist');
        mocks.tags = [{ label: 'humourist', taggers: ['viewer'], taggers_count: 1, relationship: true, tag_uri: null }];
        rerender(<TagBar isExpanded suggestedLabels={LABELS} />);

        now.mockReturnValue(10_000 + SUGGESTION_PRESS_GUARD_MS - 1);
        fireEvent.click(within(await screen.findByTestId('tagged-list')).getByRole('button', { name: 'humourist1' }));
        // `false`: the default was prevented, by the guard (the link's own handler does not run in the window)
        expect(fireEvent.click(screen.getByRole('link', { name: 'Search humourist' }))).toBe(false);
        fireEvent.click(within(screen.getByRole('group', { name: 'Suggested tags' })).getByText('writer'));
        expect(mocks.toggleTag).not.toHaveBeenCalled();
        expect(mocks.rowButton).not.toHaveBeenCalled();
        expect(mocks.addTag).toHaveBeenCalledTimes(1);

        now.mockReturnValue(10_000 + SUGGESTION_PRESS_GUARD_MS);
        fireEvent.click(within(screen.getByTestId('tagged-list')).getByRole('button', { name: 'humourist1' }));
        expect(mocks.toggleTag).toHaveBeenCalledWith(expect.objectContaining({ label: 'humourist' }));
        fireEvent.click(screen.getByRole('link', { name: 'Search humourist' }));
        expect(mocks.rowButton).toHaveBeenCalledWith('humourist');
      });
    });

    it('draws a suggestion like the other services’ chips in one row, after them', () => {
      mocks.tags = [];
      render(<TagBar otherTags={OTHER_TAGS.slice(1, 2)} uri={LINK} suggestedLabels={['europe']} />);

      expect(chipLabels()).toEqual(['capital0(2)', 'europe+']);
      const [secondary] = secondaryChips();
      const [suggested] = suggestedChips();
      for (const property of ['border', 'background-color', 'background-image'] as const) {
        expect(suggested.style.getPropertyValue(property)).toBe(secondary.style.getPropertyValue(property));
      }
      expect(suggested.style.backgroundColor).toBe('color-mix(in oklab, var(--tag-edge) 12%, transparent)');
    });

    it('asks to sign in on a press when signed out, writing nothing', () => {
      mocks.isSignedIn = false;
      mocks.tags = [];
      render(<TagBar suggestedLabels={LABELS} />);

      fireEvent.click(screen.getByText('science-fiction'));

      expect(mocks.addTag).not.toHaveBeenCalled();
      expect(mocks.signInRequests).toBe(1);

      // Nothing was added, so nothing moved: a second press asks again at once.
      fireEvent.click(screen.getByText('humourist'));
      expect(mocks.signInRequests).toBe(2);
    });

    it('shows none inline (an item’s row) and none without labels', () => {
      mocks.tags = [];
      const { unmount } = render(<TagBar inline suggestedLabels={LABELS} />);
      expect(suggestedChips()).toHaveLength(0);
      unmount();

      for (const suggestedLabels of [undefined, null, []]) {
        const view = render(<TagBar isExpanded suggestedLabels={suggestedLabels} />);
        expect(suggestedChips()).toHaveLength(0);
        expect(screen.queryByRole('group', { name: 'Suggested tags' })).not.toBeInTheDocument();
        view.unmount();
      }
    });

    it('shows none while the link’s tags are read, so they cannot move under a tap', () => {
      mocks.tags = [];
      mocks.isLoading = true;
      const { rerender } = render(<TagBar suggestedLabels={LABELS} />);
      expect(suggestedChips()).toHaveLength(0);

      mocks.isLoading = false;
      rerender(<TagBar suggestedLabels={LABELS} />);
      expect(suggestedChips()).toHaveLength(3);
    });

    it('offers a label past the other services’ chips shown, which no chip shows', async () => {
      mocks.tags = [];
      const many: TMergedTag[] = Array.from({ length: MAX_OTHER_TAGS + 1 }, (_, index) => ({
        label: `other-${index}`,
        taggers: ['e'],
        count: 1,
        isComplete: true,
        sources: [service('Wikidata', ['e'])],
      }));
      render(<TagBar isExpanded otherTags={many} uri={LINK} suggestedLabels={[`other-${MAX_OTHER_TAGS}`]} />);

      expect((await screen.findAllByTestId('resource-suggested-tag')).map((chip) => chip.textContent)).toEqual([
        `other-${MAX_OTHER_TAGS}+`,
      ]);
    });
  });
});
