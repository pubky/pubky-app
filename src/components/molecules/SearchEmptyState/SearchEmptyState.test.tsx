import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchReach } from '@/hooks/useSearchReach/useSearchReach';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, REACH } from '@/stores/home/home.types';
import { useSearchStore } from '@/stores/search/search.store';
import { SearchEmptyState } from './SearchEmptyState';

function Results({
  loading = false,
  error = null,
  hasMore = false,
}: {
  loading?: boolean;
  error?: string | null;
  hasMore?: boolean;
}) {
  const { reach, setReach } = useSearchReach();
  return (
    <>
      <p>{'People matches'}</p>
      <p>{'Collections matches'}</p>
      <TimelineStateWrapper
        loading={loading}
        error={error}
        hasItems={false}
        hasMore={hasMore}
        emptyComponent={
          <SearchEmptyState
            variant="results"
            isCollections={false}
            onSearchAll={reach === REACH.ALL ? undefined : () => setReach(REACH.ALL)}
          />
        }
      >
        <span>{'Load more'}</span>
      </TimelineStateWrapper>
    </>
  );
}

describe('Search empty results', () => {
  beforeEach(() => {
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    useSearchStore.getState().reset();
    useSearchStore.getState().setReach(REACH.FRIENDS);
    useSearchStore.getState().setActiveTags(['bitcoin', 'pubky']);
    useHomeStore.setState({ reach: REACH.NETWORK, content: CONTENT.IMAGES });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('offers All for empty posts alongside other matches and preserves the filters', () => {
    render(<Results />);
    expect(screen.getByText('People matches')).toBeInTheDocument();
    expect(screen.getByText('Collections matches')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search in All' }));
    expect(useSearchStore.getState().reach).toBe(REACH.ALL);
    expect(useSearchStore.getState().activeTags).toEqual(['bitcoin', 'pubky']);
    expect(useHomeStore.getState()).toMatchObject({ reach: REACH.NETWORK, content: CONTENT.IMAGES });
    expect(screen.queryByRole('button', { name: 'Search in All' })).not.toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it.each([{ loading: true }, { hasMore: true }, { error: 'Could not load search results' }])(
    'does not offer All for an unsettled or failed search: %j',
    (state) => {
      render(<Results {...state} />);
      expect(screen.queryByRole('button', { name: 'Search in All' })).not.toBeInTheDocument();
    },
  );

  it('names collections when searching the Collections content filter', () => {
    render(<SearchEmptyState variant="results" isCollections onSearchAll={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'No collections match your search' })).toBeInTheDocument();
  });
});

describe('SearchEmptyState - Snapshots', () => {
  it('shows the scoped results action', () => {
    const { container } = render(<SearchEmptyState variant="results" isCollections={false} onSearchAll={vi.fn()} />);
    expect(container).toMatchSnapshot();
  });
});
