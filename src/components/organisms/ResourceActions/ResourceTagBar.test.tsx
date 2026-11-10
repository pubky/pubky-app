import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMergedTag } from '@/hooks/useOtherLinkTags/useOtherLinkTags.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { ResourceTagBar } from './ResourceTagBar';

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
vi.mock('@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper', () => ({
  PostTagPopoverWrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/molecules/TaggedList/TaggedList', () => ({
  TaggedList: ({ tags, onTagToggle }: { tags: NexusTag[]; onTagToggle: (tag: NexusTag) => unknown }) => (
    <div data-testid="tagged-list">
      {tags.map((tag) => (
        <button key={tag.label} type="button" onClick={() => void onTagToggle(tag)}>
          {tag.label}
          {tag.taggers_count}
        </button>
      ))}
    </div>
  ),
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
}: { isExpanded?: boolean; isAdding?: boolean } & Pick<React.ComponentProps<typeof ResourceTagBar>, 'otherTags'>) {
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

const service = (name: string, count = 1) => ({ uri: `https://${name.toLowerCase()}.example/x`, name, count });
// The other services' tags of the same thing, merged (`mergeOtherLinkTags`): `travel` is on the link too.
const OTHER_TAGS: TMergedTag[] = [
  { label: 'travel', taggers: ['c', 'd'], count: 2, isComplete: true, sources: [service('Wikipedia', 2)] },
  { label: 'capital', taggers: ['e'], count: 1, isComplete: true, sources: [service('Wikidata')] },
];

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

  it('says on an own chip that its label is on other services too, and shows no second chip', () => {
    render(<TagBar otherTags={OTHER_TAGS} />);

    expect(chipLabels()).toEqual(['berlin3', 'travel2', 'city1']);
    expect(screen.getByText('travel').closest('button')).toHaveAccessibleName(
      'travel tag (2 posts), also on Wikipedia',
    );
    expect(screen.getByText('berlin').closest('button')).toHaveAccessibleName('berlin tag (3 posts)');
  });
});
