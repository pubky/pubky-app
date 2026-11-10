import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useResourceTags } from '@/hooks/useResourceTags/useResourceTags';
import type { NexusTag } from '@/services/nexus/nexus.types';
import relatedFixture from '@/services/pinakes/fixtures/search.related.because.json';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { ResourceSimilarBecause } from './ResourceSimilarBecause';
import { becauseLabel, topTags } from './ResourceSimilarBecause.utils';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/useResourceTags/useResourceTags', () => ({ useResourceTags: vi.fn() }));
vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({ useBulkUserAvatars: vi.fn() }));
// The app's who-tagged list as it is; only the ids it is given are checked here.
vi.mock('@/molecules/WhoTaggedExpandedList/WhoTaggedExpandedList', () => ({
  WhoTaggedExpandedList: ({ taggerIds }: { taggerIds: string[] }) => (
    <ul data-testid="who-tagged-expanded-list">
      {taggerIds.map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  ),
}));

// A row of a real related search (candidate Pinakes, seed: the Bitcoin article).
const ROW: TPinakesCard = relatedFixture.items[0];
const BECAUSE = ROW.because!;
const [A, B, C] = BECAUSE.taggers;
const tag = (label: string, taggers: string[]): NexusTag => ({
  label,
  taggers,
  taggers_count: taggers.length,
  relationship: false,
  tag_uri: null,
});
const tagsResult = (tags: NexusTag[]) => ({
  tags,
  isLoading: false,
  isAtReadLimit: false,
  isError: false,
  addTag: vi.fn(),
  toggleTag: vi.fn(),
});

describe('ResourceSimilarBecause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useResourceTags).mockReturnValue(
      tagsResult([tag('music', [A]), tag('classic', [A, B, C]), tag('popular', ['x', 'y', 'z', 'w'])]),
    );
    vi.mocked(useBulkUserAvatars).mockReturnValue({
      usersMap: new Map(),
      getUsersWithAvatars: (ids: string[]) => ids.map((id) => ({ id, name: id === A ? 'Alice' : undefined })),
      isLoading: false,
    });
  });

  it('shows the shared taggers as an avatar group with the rest counted, and their top tag as a chip that searches it', async () => {
    const user = userEvent.setup();
    render(<ResourceSimilarBecause because={BECAUSE} tagUri={ROW.uri} name="Never Gonna Give You Up" />);
    const people = screen.getByTestId('resource-similar-because-people');
    expect(people).toHaveAccessibleName(
      `${BECAUSE.shared} people who tagged this also tagged Never Gonna Give You Up. Its top tags: classic. Show who`,
    );
    expect(people).toHaveTextContent(`+${BECAUSE.shared - 3}`);
    const line = screen.getByTestId('resource-similar-because');
    // The shared people's tag before the link's most used one.
    expect(
      within(line)
        .getAllByTestId('tag-name')
        .map((t) => t.textContent),
    ).toEqual(['classic']);
    await user.click(within(line).getByTestId('tag'));
    expect(push).toHaveBeenCalledWith('/search?tags=classic');
    expect(useResourceTags).toHaveBeenCalledWith(ROW.uri);
    expect(useBulkUserAvatars).toHaveBeenCalledWith(BECAUSE.taggers);
  });

  it('opens the who-tagged list of the named people, with the keyboard too, and gives focus back', async () => {
    const user = userEvent.setup();
    render(<ResourceSimilarBecause because={BECAUSE} tagUri={ROW.uri} name="X" />);
    await user.tab();
    const people = screen.getByTestId('resource-similar-because-people');
    expect(people).toHaveFocus();
    await user.keyboard('{Enter}');
    const list = await screen.findByTestId('who-tagged-expanded-list');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([A, B, C]);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('who-tagged-expanded-list')).not.toBeInTheDocument();
    expect(people).toHaveFocus();
  });

  it('shows nothing when nobody is named', () => {
    const { container } = render(
      <ResourceSimilarBecause because={{ shared: 2, taggers: [] }} tagUri={ROW.uri} name="Y" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names its preview', async () => {
    const user = userEvent.setup();
    render(<ResourceSimilarBecause because={BECAUSE} tagUri={ROW.uri} name="X" />);
    await user.click(screen.getByTestId('resource-similar-because-people'));
    expect(await screen.findByRole('dialog', { name: 'Who tagged this and X' })).toBeInTheDocument();
  });
});

describe('ResourceSimilarBecause.utils', () => {
  it("ranks the shared people's tags first, then by taggers, then label", () => {
    expect(topTags([tag('b', [A]), tag('a', [B]), tag('c', [A, B])], [], 2)).toEqual(['c', 'a']);
    expect(topTags([tag('b', [A]), tag('c', ['x', 'y'])], [A], 2)).toEqual(['b', 'c']);
  });

  it('writes the sentence without tags', () => {
    expect(becauseLabel({ shared: 1, name: 'Y', top: [] })).toBe('1 person who tagged this also tagged Y. Show who');
  });
});
