import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import type { TOtherLink, TOtherLinkTags } from '@/hooks/useOtherLinkTags/useOtherLinkTags.types';
import { useResourceTags } from '@/hooks/useResourceTags/useResourceTags';
import { ResourceTagBar } from '@/organisms/ResourceActions/ResourceTagBar';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { OTHER_TAGS_LABEL, ResourceOtherTags } from './ResourceOtherTags';
import { MAX_OTHER_TAGS, mergeOtherLinkTags } from './ResourceOtherTags.utils';

const mocks = vi.hoisted(() => ({
  reads: [] as TOtherLinkTags[],
  ownTags: [] as NexusTag[],
  ownTagsUri: null as string | null,
}));
vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: (tags: unknown[]) => ({ enrichedTags: tags, isLoading: false }),
}));
vi.mock('@/molecules/PostTagPopoverWrapper/TaggerAvatar/TaggerAvatar', () => ({
  TaggerAvatar: ({ tagger }: { tagger: { id: string } }) => <span data-testid="tagger-avatar">{tagger.id}</span>,
}));
// The own tag bar's dependencies, for the two groups side by side.
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ isAuthenticated: true, requireAuth: (action: () => unknown) => action() }),
}));
vi.mock('@/hooks/useResourceTags/useResourceTags', () => ({
  useResourceTags: (uri: string) => {
    mocks.ownTagsUri = uri;
    return { tags: mocks.ownTags, isLoading: false, isError: false, addTag: vi.fn(), toggleTag: vi.fn() };
  },
}));
// The own bar's hover avatars, as the taggers it is given.
vi.mock('@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper', () => ({
  PostTagPopoverWrapper: ({ taggers, children }: { taggers: { id: string }[]; children: ReactNode }) => (
    <span data-testid="own-tag-taggers" data-ids={taggers.map((tagger) => tagger.id).join(',')}>
      {children}
    </span>
  ),
}));
vi.mock('@/molecules/TagInput/TagInput', () => ({ TagInput: () => null }));

const NETFLIX: TOtherLink = { uri: 'https://www.netflix.com/title/20557937', name: 'Netflix' };
const TMDB: TOtherLink = { uri: 'https://www.themoviedb.org/movie/603', name: 'TMDB' };

const tag = (label: string, taggers: string[]): NexusTag => ({
  label,
  taggers,
  taggers_count: taggers.length,
  relationship: false,
  tag_uri: null,
});

// Shaped like Nexus `GET /v0/resource/by-uri` for The Matrix's Netflix and TMDB links (taggers
// shortened; the TMDB `film` count trimmed to the taggers listed).
const MATRIX_READS: TOtherLinkTags[] = [
  { link: NETFLIX, tags: [tag('film', ['ann']), tag('movie', ['ann']), tag('netflix', ['ann'])] },
  {
    link: TMDB,
    tags: [tag('film', ['ann', 'bob', 'cy', 'dee', 'eve']), tag('scifi', ['bob', 'cy']), tag('tmdb', ['bob'])],
  },
];

/** The row as the page gives it: the other links' reads merged (`mergeOtherLinkTags`). */
const renderTags = (props: Partial<React.ComponentProps<typeof ResourceOtherTags>> = {}) =>
  render(<ResourceOtherTags tags={mergeOtherLinkTags(mocks.reads)} {...props} />);

const chips = () => within(screen.getByTestId('resource-other-tags')).getAllByTestId('resource-other-tag');

describe('ResourceOtherTags', () => {
  beforeEach(() => {
    mocks.reads = MATRIX_READS;
  });

  it('shows one chip per label, each tagger counted once, all of them once the tags are expanded', () => {
    renderTags({ isExpanded: true });

    expect(screen.getByTestId('resource-other-tags-label')).toHaveTextContent(OTHER_TAGS_LABEL);
    expect(screen.getByRole('group', { name: OTHER_TAGS_LABEL })).toBeInTheDocument();
    expect(chips().map((chip) => chip.textContent)).toEqual(['film5', 'scifi2', 'movie1', 'netflix1', 'tmdb1']);
    expect(chips()[0]).toHaveAccessibleName('film, tagged by 5 people on TMDB, Netflix');
    expect(chips()[2]).toHaveAccessibleName('movie, tagged by 1 person on Netflix');
  });

  it('says when the count is a lower bound: Nexus listed fewer taggers than it counts', () => {
    mocks.reads = [{ link: TMDB, tags: [{ ...tag('film', ['ann', 'bob']), taggers_count: 9 }] }];
    renderTags({ isExpanded: true });

    expect(chips()[0]).toHaveAccessibleName('film, tagged by at least 9 people on TMDB');
  });

  it('is display only: no add control, and a chip opens a popover rather than toggling', () => {
    renderTags({ isExpanded: true });

    expect(screen.queryByRole('button', { name: 'Add new tag' })).not.toBeInTheDocument();
    for (const chip of chips()) {
      expect(chip).not.toHaveAttribute('aria-pressed');
      expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
      expect(chip).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('gives focus back to the chip when its popover is closed with Escape', async () => {
    renderTags({ isExpanded: true });

    const chip = chips()[0];
    chip.focus();
    fireEvent.click(chip);
    const menu = screen.getByTestId('resource-other-tag-menu');
    fireEvent.keyDown(menu, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('resource-other-tag-menu')).not.toBeInTheDocument());
    expect(chip).toHaveFocus();
    expect(chip).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens who tagged a chip and the services it is on, each opening that link’s page', () => {
    renderTags({ isExpanded: true });

    fireEvent.click(chips()[0]);
    const menu = screen.getByTestId('resource-other-tag-menu');
    expect(chips()[0]).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(menu)
        .getAllByTestId('tagger-avatar')
        .map((avatar) => avatar.textContent),
    ).toEqual(['ann', 'bob', 'cy', 'dee']);
    expect(within(menu).getByText('+1')).toBeInTheDocument();
    const sources = within(within(menu).getByTestId('resource-other-tag-sources')).getAllByRole('link');
    expect(sources.map((link) => link.textContent)).toEqual(['TMDB5', 'Netflix1']);
    expect(sources[0]).toHaveAttribute('href', getResourceRoute(TMDB.uri));
  });

  it('shows in a chip’s menu only the taggers and links of that label on the other links', () => {
    mocks.reads = [
      { link: NETFLIX, tags: [tag('film', ['ann']), tag('movie', ['dan'])] },
      { link: TMDB, tags: [tag('movie', ['eve'])] },
    ];
    renderTags({ isExpanded: true });

    fireEvent.click(chips().find((chip) => chip.textContent === 'film1')!);
    const menu = screen.getByTestId('resource-other-tag-menu');
    expect(
      within(menu)
        .getAllByTestId('tagger-avatar')
        .map((avatar) => avatar.textContent),
    ).toEqual(['ann']);
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Netflix1']);
  });

  it('shows nothing when the other links have no tags', () => {
    mocks.reads = [];
    const { container } = renderTags();
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves out the labels the link already has and shows the most popular few, then Show all / Show less', () => {
    renderTags({ ownLabels: ['scifi'] });

    expect(chips().map((chip) => chip.textContent)).toEqual(['film5', 'movie1', 'netflix1']);
    const toggle = screen.getByTestId('resource-other-tags-toggle');
    expect(toggle).toHaveTextContent('Show all (4)');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(chips().map((chip) => chip.textContent)).toEqual(['film5', 'movie1', 'netflix1', 'tmdb1']);
    expect(toggle).toHaveTextContent('Show less');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('no Show all when the few are all, nor once the Tags button expanded every tag', () => {
    const { rerender } = renderTags({ ownLabels: ['film', 'scifi'] });
    expect(chips()).toHaveLength(3);
    expect(screen.queryByTestId('resource-other-tags-toggle')).not.toBeInTheDocument();

    rerender(<ResourceOtherTags tags={mergeOtherLinkTags(mocks.reads)} isExpanded />);
    expect(chips()).toHaveLength(5);
    expect(screen.queryByTestId('resource-other-tags-toggle')).not.toBeInTheDocument();
  });

  it('shows nothing when every label is already the link’s own', () => {
    const { container } = renderTags({ ownLabels: ['film', 'scifi', 'movie', 'netflix', 'tmdb'] });
    expect(container).toBeEmptyDOMElement();
  });

  it('caps the row at MAX_OTHER_TAGS after leaving out the link’s own labels', () => {
    const labels = Array.from({ length: MAX_OTHER_TAGS + 5 }, (_, index) => `t${String(index).padStart(2, '0')}`);
    mocks.reads = [{ link: NETFLIX, tags: labels.map((label) => tag(label, ['ann'])) }];
    renderTags({ ownLabels: labels.slice(0, 5), isExpanded: true });

    expect(chips()).toHaveLength(MAX_OTHER_TAGS);
    expect(chips()[0]).toHaveTextContent('t05');
  });
});

// The page's two tag groups side by side, with the same label on both: each decorates its chips
// with its own taggers only, never the other group's.
describe('ResourceOtherTags beside the link’s own ResourceTagBar', () => {
  const LETTERBOXD = 'https://letterboxd.com/film/the-matrix/';

  function OwnTagBar() {
    return (
      <ResourceTagBar
        resourceTags={useResourceTags(LETTERBOXD)}
        label="Tags on this movie"
        isExpanded={false}
        isAdding={false}
        onAddingChange={vi.fn()}
      />
    );
  }

  it('decorates the same label with each group’s own taggers', () => {
    mocks.ownTags = [tag('film', ['ann', 'ann2'])];
    mocks.reads = [{ link: NETFLIX, tags: [tag('film', ['bob'])] }];
    render(
      <>
        <OwnTagBar />
        <ResourceOtherTags tags={mergeOtherLinkTags(mocks.reads)} />
      </>,
    );

    expect(mocks.ownTagsUri).toBe(LETTERBOXD);
    const own = within(screen.getByTestId('resource-tag-bar'));
    expect(own.getByTestId('own-tag-taggers')).toHaveAttribute('data-ids', 'ann,ann2');
    expect(own.getByRole('button', { name: /^film tag/ })).toHaveTextContent('film2');

    const other = screen.getByTestId('resource-other-tags');
    expect(within(other).queryByTestId('own-tag-taggers')).not.toBeInTheDocument();
    const chip = within(other).getByTestId('resource-other-tag');
    expect(chip).toHaveTextContent('film1');
    fireEvent.click(chip);
    const menu = screen.getByTestId('resource-other-tag-menu');
    expect(
      within(menu)
        .getAllByTestId('tagger-avatar')
        .map((avatar) => avatar.textContent),
    ).toEqual(['bob']);
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Netflix1']);
  });
});
