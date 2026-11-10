import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { usePinakesGroup } from '@/hooks/usePinakesGroup/usePinakesGroup';
import mbArtistSparseFixture from '@/services/pinakes/fixtures/by-uri.mb-artist-sparse.json';
import mbGroupEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-group.enriched.json';
import musicRecordingFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import type { TPinakesCard, TPinakesGroupDetail, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceCard } from './ResourceCard';

vi.mock('@/hooks/usePinakesGroup/usePinakesGroup', () => ({ usePinakesGroup: vi.fn() }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({ useOgMetadata: vi.fn() }));

const GROUP_ID = 'g1';
const SPARSE: TPinakesResourceDetail = { ...mbArtistSparseFixture, group: { id: GROUP_ID, size: 3 } };

function member(overrides: Partial<TPinakesCard>): TPinakesCard {
  return {
    id: 'm',
    uri: 'https://tidal.com/artist/7429906',
    status: 'ok',
    type: 'Person',
    type_path: ['Thing', 'Person'],
    site: 'TIDAL',
    also_on: [],
    open_in: [],
    refs: [],
    collections: 0,
    ...overrides,
  };
}

/** Members on general databases: the only ones a card borrows from. */
const WIKIDATA = { uri: 'https://www.wikidata.org/wiki/Q00000', site: 'Wikidata' };
const WIKIPEDIA = { uri: 'https://en.wikipedia.org/wiki/Sefa', site: 'Wikipedia (en)' };
const COMMONS_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/a/a.jpg';

function group(members: TPinakesCard[]): TPinakesGroupDetail {
  return { id: GROUP_ID, curated: false, keys: [], members: [SPARSE, ...members] };
}

describe('ResourceCard: a sparse card borrows from its group', () => {
  const mockGroup = vi.mocked(usePinakesGroup);

  const mockOg = vi.mocked(useOgMetadata);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGroup.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mockOg.mockReturnValue({ metadata: null, isLoading: false, error: null });
  });

  it('never shows less than the link’s own preview: its image and title fill what the card lacks', () => {
    mockOg.mockReturnValue({
      metadata: {
        url: 'musicbrainz.org',
        title: 'Sefa - MusicBrainz',
        image: 'https://example.org/og.png',
        type: 'website',
      },
      isLoading: false,
      error: null,
    });
    render(<ResourceCard card={{ ...SPARSE, group: null, name: null }} />);

    expect(mockOg).toHaveBeenCalledWith(SPARSE.uri);
    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', 'https://example.org/og.png');
    expect(screen.getByTestId('resource-card-title')).toHaveTextContent('Sefa - MusicBrainz');
  });

  const OG_IMAGE = 'https://example.org/og.png';
  const withOg = (title: string | null = 'Sefa - MusicBrainz') =>
    mockOg.mockReturnValue({
      metadata: { url: 'musicbrainz.org', title, image: OG_IMAGE, type: 'website' },
      isLoading: false,
      error: null,
    });

  it('prefers a group member’s image to the OG one, and waits for the group before asking for OG', () => {
    withOg();
    mockGroup.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { rerender } = render(<ResourceCard card={SPARSE} />);
    expect(mockOg).not.toHaveBeenCalledWith(expect.any(String));

    mockGroup.mockReturnValue({
      data: group([member({ ...WIKIDATA, id: 'b', image: COMMONS_IMAGE })]),
      isLoading: false,
      isError: false,
    });
    rerender(<ResourceCard card={SPARSE} />);
    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', COMMONS_IMAGE);
    expect(mockOg).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('shows the type icon when the OG image fails to load', () => {
    withOg();
    render(<ResourceCard card={{ ...SPARSE, group: null }} />);

    fireEvent.error(screen.getByTestId('resource-card-image'));

    expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-card-type-tile')).toBeInTheDocument();
  });

  it('attaches no credit or “Image:” note to the OG image', () => {
    withOg();
    render(<ResourceCard card={{ ...SPARSE, group: null, credits: [] }} />);

    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', OG_IMAGE);
    expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
  });

  it('titles a nameless card with its link when there is no OG title', () => {
    withOg(null);
    render(<ResourceCard card={{ ...SPARSE, group: null, name: '  ' }} />);

    expect(screen.getByTestId('resource-card-title')).toHaveTextContent(
      'musicbrainz.org/artist/b5416a54-4941-4fcf-b2a0-7f98da6f9344',
    );
  });

  it('shows its own Wikimedia image without a credit, reading no link preview for it', () => {
    const image = 'https://upload.wikimedia.org/wikipedia/commons/4/46/Bitcoin.svg';
    withOg(null);
    render(<ResourceCard card={{ ...SPARSE, group: null, image, credits: [] }} />);

    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', image);
    expect(mockOg).toHaveBeenLastCalledWith(null);
  });

  it('does not read the preview of a card that has its title and image, or of a gone link', () => {
    const { unmount } = render(<ResourceCard card={{ ...musicRecordingFixture }} />);
    expect(mockOg).toHaveBeenLastCalledWith(null);
    unmount();

    render(<ResourceCard card={{ ...SPARSE, group: null, status: 'missing' }} />);
    expect(mockOg).toHaveBeenLastCalledWith(null);
  });

  it.each(['default', 'large'] as const)(
    'shows another member’s image and description without naming its service (%s)',
    (size) => {
      mockGroup.mockReturnValue({
        data: group([
          member({ ...WIKIPEDIA, id: 'a', type: 'Article', description: 'Dutch DJ.' }),
          member({ ...WIKIDATA, id: 'b', image: COMMONS_IMAGE }),
        ]),
        isLoading: false,
        isError: false,
      });
      render(<ResourceCard card={SPARSE} size={size} />);

      expect(mockGroup).toHaveBeenCalledWith(GROUP_ID);
      expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', COMMONS_IMAGE);
      expect(screen.getByTestId('resource-card-description')).toHaveTextContent('Dutch DJ.');
      expect(screen.getByTestId('resource-card-description')).toHaveAttribute('data-borrowed', 'true');
      expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/Image:|Text:/);
      expect(screen.queryByRole('link', { name: 'Wikidata' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Wikipedia (en)' })).not.toBeInTheDocument();
    },
  );

  it.each(['default', 'large'] as const)('keeps the credit a borrowed Commons image comes with (%s)', (size) => {
    const commons = (mbGroupEnrichedFixture.credits ?? []).find((credit) => credit.field === 'image');
    if (!commons) throw new Error('fixture has no image credit');
    mockGroup.mockReturnValue({
      data: group([member({ ...WIKIDATA, id: 'w', image: COMMONS_IMAGE, credits: [commons] })]),
      isLoading: false,
      isError: false,
    });
    render(<ResourceCard card={SPARSE} size={size} />);

    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', COMMONS_IMAGE);
    expect(screen.getByTestId('resource-credits')).toHaveTextContent('Wikimedia Commons');
    expect(screen.getByTestId('resource-credits')).not.toHaveTextContent('Wikidata');
  });

  it('prefers a member of its own type, and skips members that are not ok', () => {
    mockGroup.mockReturnValue({
      data: group([
        member({
          id: 'x',
          uri: 'https://musicbrainz.org/release-group/x',
          site: 'MusicBrainz',
          type: 'MusicAlbum',
          image: 'https://coverartarchive.org/release-group/x/front-500',
        }),
        member({ ...WIKIDATA, id: 'y', status: 'missing', image: 'https://upload.wikimedia.org/gone.jpg' }),
        member({ ...WIKIDATA, id: 'z', image: COMMONS_IMAGE }),
      ]),
      isLoading: false,
      isError: false,
    });
    render(<ResourceCard card={SPARSE} />);

    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', COMMONS_IMAGE);
  });

  it('borrows a Wikimedia image without a credit too, and names no service for it', () => {
    mockGroup.mockReturnValue({
      data: group([member({ ...WIKIDATA, id: 'w', image: COMMONS_IMAGE })]),
      isLoading: false,
      isError: false,
    });
    render(<ResourceCard card={SPARSE} />);

    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', COMMONS_IMAGE);
    expect(screen.queryByTestId('resource-card-type-tile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
  });

  it('takes a member’s image when its own fails to load, and the next one when that fails too', () => {
    mockGroup.mockReturnValue({
      data: group([
        member({ ...WIKIDATA, id: 'a', image: 'https://upload.wikimedia.org/one.jpg' }),
        member({ ...WIKIPEDIA, id: 'b', image: 'https://upload.wikimedia.org/two.jpg' }),
      ]),
      isLoading: false,
      isError: false,
    });
    const own = { ...SPARSE, image: 'https://example.org/own.jpg', description: 'Own text.' };
    render(<ResourceCard card={own} />);

    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', own.image);
    fireEvent.error(screen.getByTestId('resource-card-image'));
    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', 'https://upload.wikimedia.org/one.jpg');
    fireEvent.error(screen.getByTestId('resource-card-image'));
    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', 'https://upload.wikimedia.org/two.jpg');
    fireEvent.error(screen.getByTestId('resource-card-image'));
    expect(screen.getByTestId('resource-card-type-tile')).toBeInTheDocument();
  });

  it('borrows nothing from stores or streaming services: a MusicBrainz + Apple Music + TIDAL group leaves it empty', () => {
    mockGroup.mockReturnValue({
      data: group([
        member({
          id: 'a',
          uri: 'https://music.apple.com/artist/1',
          site: 'Apple Music',
          description: 'Listen to music by Sefa on Apple Music.',
          image: 'https://is1-ssl.mzstatic.com/image/thumb/sefa.jpg',
        }),
        member({ id: 't', description: 'Sefa on TIDAL.', image: 'https://resources.tidal.com/images/sefa.jpg' }),
      ]),
      isLoading: false,
      isError: false,
    });
    render(<ResourceCard card={SPARSE} />);

    expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-card-type-tile')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-card-description')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Apple Music|TIDAL/);
  });

  it.each([
    'https://open.spotify.com/artist/x',
    'https://tidal.com/artist/7429906',
    'https://www.deezer.com/artist/1',
    'https://music.apple.com/artist/1',
    'https://www.youtube.com/channel/x',
    'https://music.youtube.com/channel/x',
    'https://music.amazon.com/artists/B0041AOZUG',
    'https://open.qobuz.com/artist/1',
    'https://soundcloud.com/sefa',
    'https://sefa.bandcamp.com/',
    'https://evilwikipedia.org/wiki/Sefa',
    'https://wikipedia.org.example.com/wiki/Sefa',
    'https://musicbrainz.org.example.com/artist/x',
    'doi:10.1038/nature12373',
    'geo:52.1,4.3',
  ])('lends nothing from %s', (uri) => {
    mockGroup.mockReturnValue({
      data: group([member({ id: 's', uri, description: 'Store text.', image: 'https://example.org/store.jpg' })]),
      isLoading: false,
      isError: false,
    });
    render(<ResourceCard card={SPARSE} />);

    expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resource-card-description')).not.toBeInTheDocument();
  });

  it('skips a service listed first and borrows from the general database after it', () => {
    mockGroup.mockReturnValue({
      data: group([
        member({ id: 't', description: 'Sefa on TIDAL.', image: 'https://resources.tidal.com/images/sefa.jpg' }),
        member({ ...WIKIPEDIA, id: 'p', description: 'Dutch DJ.' }),
        member({ ...WIKIDATA, id: 'w', image: COMMONS_IMAGE }),
      ]),
      isLoading: false,
      isError: false,
    });
    render(<ResourceCard card={SPARSE} />);

    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', COMMONS_IMAGE);
    expect(screen.getByTestId('resource-card-description')).toHaveTextContent('Dutch DJ.');
  });

  it.each([
    'https://beta.musicbrainz.org/artist/x',
    'https://commons.wikimedia.org/wiki/File:Sefa.jpg',
    'https://de.wikipedia.org/wiki/Sefa',
    'https://www.openstreetmap.org/node/1',
    'https://openlibrary.org/works/OL1W',
    'isbn:9780140328721',
  ])('borrows from the general database %s', (uri) => {
    mockGroup.mockReturnValue({
      data: group([member({ id: 'g', uri, image: COMMONS_IMAGE })]),
      isLoading: false,
      isError: false,
    });
    render(<ResourceCard card={SPARSE} />);

    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', COMMONS_IMAGE);
  });

  it('does not read a group of one', () => {
    render(<ResourceCard card={{ ...SPARSE, group: { id: GROUP_ID, size: 1 } }} />);

    expect(mockGroup).toHaveBeenCalledWith(null);
  });

  it('does not read the group of a card that has its own description and image', () => {
    render(<ResourceCard card={{ ...musicRecordingFixture, group: { id: GROUP_ID, size: 2 } }} />);

    expect(mockGroup).toHaveBeenCalledWith(null);
    expect(mockGroup).not.toHaveBeenCalledWith(GROUP_ID);
  });

  it('reads neither its group nor the link’s preview before it has been on screen, and keeps them after', () => {
    mockGroup.mockReturnValue({
      data: group([member({ ...WIKIDATA, id: 'w', image: COMMONS_IMAGE })]),
      isLoading: false,
      isError: false,
    });
    const { rerender } = render(<ResourceCard card={SPARSE} isOnScreen={false} />);

    expect(mockGroup).not.toHaveBeenCalledWith(GROUP_ID);
    expect(mockOg).not.toHaveBeenCalledWith(expect.any(String));
    expect(screen.getByTestId('resource-card-type-tile')).toBeInTheDocument();

    rerender(<ResourceCard card={SPARSE} isOnScreen />);
    expect(mockGroup).toHaveBeenLastCalledWith(GROUP_ID);
    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', COMMONS_IMAGE);

    rerender(<ResourceCard card={SPARSE} isOnScreen={false} />);
    expect(mockGroup).toHaveBeenLastCalledWith(GROUP_ID);
    expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', COMMONS_IMAGE);
  });

  it('reads the group of the large card wherever it is', () => {
    render(<ResourceCard card={SPARSE} size="large" isOnScreen={false} />);

    expect(mockGroup).toHaveBeenCalledWith(GROUP_ID);
  });
});
