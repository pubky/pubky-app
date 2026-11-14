import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { toEventInstance } from '@/pipes/resource/resource.events';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import eventsFixture from '@/services/pinakes/fixtures/search.events.json';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { ResourceInstanceCard } from './ResourceInstanceCard';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));
// The footer (tags, actions) has its own tests: here, which link it acts on
vi.mock('@/organisms/ResourceActions/ResourceActions', () => ({
  ResourceActions: (props: {
    uri: string;
    spellings?: readonly string[];
    postUri?: string | null;
    collectionsCount?: number | null;
    tagsLabel: string;
    linkUrl?: string | null;
    title?: string | null;
    card?: TPinakesCard | null;
  }) => (
    <div
      data-testid="resource-actions"
      data-uri={props.uri}
      data-spellings={(props.spellings ?? []).join(' ')}
      data-post-uri={props.postUri ?? 'none'}
      data-collections={props.collectionsCount ?? 'none'}
      data-tags-label={props.tagsLabel}
      data-link-url={props.linkUrl ?? 'none'}
      data-title={props.title ?? 'none'}
      data-card={props.card?.id ?? 'none'}
    />
  ),
}));

const ROWS: TPinakesCard[] = eventsFixture.items;
const [HOLIDAY, CONCERT] = ROWS;
const FEED_LINK =
  'https://calendar.google.com/calendar/ical/en.german%23holiday%40group.v.calendar.google.com/public/basic.ics';

describe('ResourceInstanceCard', () => {
  it('shows a search row as the app’s card of it, with its tag bar and actions on the card’s own link', () => {
    render(<ResourceInstanceCard card={CONCERT} />);

    expect(screen.getByTestId('resource-card-title')).toHaveTextContent('Annett Louisan @ Volkshaus');
    expect(screen.getByTestId('resource-card-title')).toHaveAttribute('href', getResourceRoute(CONCERT.uri));
    const actions = screen.getByTestId('resource-actions');
    expect(actions).toHaveAttribute('data-uri', CONCERT.uri);
    expect(actions).toHaveAttribute('data-post-uri', CONCERT.uri);
    expect(actions).toHaveAttribute('data-link-url', CONCERT.uri);
    expect(actions).toHaveAttribute('data-title', 'Annett Louisan @ Volkshaus');
    expect(actions).toHaveAttribute('data-collections', '1');
    expect(actions).toHaveAttribute('data-tags-label', 'Tags on this music event');
  });

  it('hands the footer the row’s card, so its other links’ tags show as on a feed’s card', () => {
    render(<ResourceInstanceCard card={CONCERT} />);

    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-card', CONCERT.id);
  });

  it('shows a calendar occurrence as itself (its own name and times), its tags and actions those of the calendar people tagged', () => {
    render(<ResourceInstanceCard card={toEventInstance(HOLIDAY, null)} />);

    expect(screen.getByTestId('resource-card-title')).toHaveTextContent('National Day of Mourning');
    // Its own start and end, in UTC and saying so: an occurrence names no time zone, and nothing
    // says it lasts all day
    expect(screen.getByTestId('resource-card-dates').textContent).toMatch(/15, 2026.*UTC.*16, 2026.*UTC/);
    const actions = screen.getByTestId('resource-actions');
    // The card's link, and the spelling people wrote for it read along
    expect(actions).toHaveAttribute('data-uri', HOLIDAY.uri);
    expect(actions).toHaveAttribute('data-spellings', FEED_LINK);
    expect(actions).toHaveAttribute('data-post-uri', FEED_LINK);
  });

  it('shows the details read for an event: its time in its own zone, its venue and its map', () => {
    const instance = toEventInstance({ ...CONCERT, id: eventFixture.id }, { ...eventFixture, uri: CONCERT.uri });
    render(<ResourceInstanceCard card={{ ...instance, start: '2026-11-16T19:00:00Z', end: null }} />);

    expect(screen.getByTestId('resource-card-dates').textContent).toMatch(/2026.*CST/);
    expect(screen.getByTestId('resource-card-venue')).toHaveTextContent('Hilton Austin');
    expect(screen.getByRole('group', { name: 'Map of Hilton Austin' })).toBeInTheDocument();
  });
});
