import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_BUSY, IMAGE_UNAVAILABLE } from '@/application/image/image.types';
import type {
  TPinakesCard,
  TPinakesEpisodePage,
  TPinakesGroupDetail,
  TPinakesResourceDetail,
} from '@/services/pinakes/pinakes.types';
import {
  IMAGE_CACHE_ENTRIES,
  IMAGE_MAX_IN_FLIGHT,
  IMAGE_PAGE_BURST,
  IMAGE_PAGE_RESERVE,
  IMAGE_PINAKES_BURST,
  IMAGE_PINAKES_PAUSE_MS,
  IMAGE_PINAKES_RESERVE,
  IMAGE_READS_PER_SITE,
  IMAGE_SITE_WAIT_MS,
  IMAGE_THUMBNAIL_BURST,
  ImageApplication,
} from './image';

const { mockImageFetch, mockCard, mockGroup, mockEpisodes, mockOg, transientPreviews } = vi.hoisted(() => ({
  mockImageFetch: vi.fn(),
  mockCard: vi.fn(),
  mockGroup: vi.fn(),
  mockEpisodes: vi.fn(),
  mockOg: vi.fn(),
  transientPreviews: new Set<unknown>(),
}));

vi.mock('@/services/nextjs/image/image', () => ({ NextJsImageService: { fetch: mockImageFetch } }));
vi.mock('@/services/nextjs/og-metadata/og-metadata', () => ({
  NextJsOgMetadataService: { fetch: mockOg },
  isTransientOgFallback: (preview: unknown) => transientPreviews.has(preview),
  SAFE_OG_METADATA_DISPATCHER: { guarded: true },
}));
vi.mock('@/services/pinakes/pinakes', () => ({
  isPinakesBusy: (value: unknown) => typeof value === 'object' && value !== null && 'busy' in value,
  PinakesService: { readCardForImage: mockCard, readGroupForImage: mockGroup, readEpisodesForImage: mockEpisodes },
}));

const URI = 'https://open.spotify.com/album/1';
const COVER = 'https://i.scdn.co/image/cover';
const IMAGE = { body: new Uint8Array([0xff, 0xd8, 0xff]).buffer, contentType: 'image/jpeg' };

function card(overrides: Partial<TPinakesResourceDetail> = {}): TPinakesResourceDetail {
  return {
    id: 'c',
    uri: URI,
    status: 'ok',
    type_path: [],
    also_on: [],
    open_in: [],
    refs: [],
    collections: 0,
    aliases: [],
    keys: [],
    image: COVER,
    ...overrides,
  };
}

const member = (image: string, status = 'ok'): TPinakesCard => ({
  ...card({ id: 'm', image, status }),
  uri: 'https://www.wikidata.org/wiki/Q1',
});
const group = (members: TPinakesCard[]): TPinakesGroupDetail => ({ id: 'g', curated: false, keys: [], members });
const episodesPage = (images: string[]): TPinakesEpisodePage => ({
  items: images.map((image, index) => ({ uri: `https://feeds.example/?guid=${index}`, guid: `${index}`, image })),
});
const readImages = () => mockImageFetch.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  ImageApplication.clearCache();
  for (const mock of [mockImageFetch, mockCard, mockGroup, mockEpisodes, mockOg]) mock.mockReset();
  transientPreviews.clear();
  mockImageFetch.mockResolvedValue(IMAGE);
});

afterEach(() => vi.useRealTimers());

describe('ImageApplication.fetchCardImage', () => {
  it('reads the card and serves the image it carries', async () => {
    mockCard.mockResolvedValue(card());

    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);

    expect(mockCard).toHaveBeenCalledWith(URI);
    expect(readImages()).toEqual([COVER]);
    expect(mockGroup).not.toHaveBeenCalled();
  });

  it('serves a latest episode’s art the show’s card carries', async () => {
    const art = 'https://feeds.example/1.jpg';
    mockCard.mockResolvedValue(card({ episodes: [{ uri: 'https://feeds.example/?guid=1', guid: '1', image: art }] }));
    await expect(ImageApplication.fetchCardImage(URI, art)).resolves.toBe(IMAGE);
  });

  it('serves an older episode’s art found by its title among the show’s episodes', async () => {
    const art = 'https://feeds.example/old.jpg';
    mockCard.mockResolvedValue(card({ id: 'show' }));
    mockEpisodes.mockResolvedValue(episodesPage([art]));

    await expect(ImageApplication.fetchCardImage(URI, art, { episode: '12: Old episode' })).resolves.toBe(IMAGE);
    await expect(
      ImageApplication.fetchCardImage(URI, 'https://evil.example/x.jpg', { episode: '12: Old episode' }),
    ).resolves.toBeNull();

    expect(mockEpisodes).toHaveBeenCalledTimes(1);
    expect(mockEpisodes).toHaveBeenCalledWith('show', '12: Old episode');
    expect(readImages()).toEqual([art]);
  });

  it('reads no image the card does not carry', async () => {
    mockCard.mockResolvedValue(card({ group: { id: 'g', size: 1 } }));

    await expect(ImageApplication.fetchCardImage(URI, 'https://evil.example/x.jpg')).resolves.toBeNull();

    expect(mockImageFetch).not.toHaveBeenCalled();
    expect(mockGroup).not.toHaveBeenCalled();
  });

  it('serves nothing of a card Pinakes is still reading, not even its own image', async () => {
    mockCard.mockResolvedValue(card({ status: 'pending', group: { id: 'g', size: 3 } }));

    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBeNull();

    expect(mockImageFetch).not.toHaveBeenCalled();
    expect(mockGroup).not.toHaveBeenCalled();
  });

  it.each(['missing', 'unreachable', 'error'])(
    'serves a %s card’s own image and the one it borrows',
    async (status) => {
      const borrowed = 'https://upload.wikimedia.org/a.jpg';
      mockCard.mockResolvedValue(card({ status, group: { id: 'g', size: 3 } }));
      mockGroup.mockResolvedValue(group([member(borrowed)]));

      await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
      await expect(ImageApplication.fetchCardImage(URI, borrowed)).resolves.toBe(IMAGE);
    },
  );

  it('serves a settled group member’s image to a card in a group, reading the group only for it', async () => {
    const borrowed = 'https://upload.wikimedia.org/a.jpg';
    mockCard.mockResolvedValue(card({ image: null, group: { id: 'g', size: 3 } }));
    mockGroup.mockResolvedValue(group([member(borrowed), member('https://pending.example/b.jpg', 'pending')]));

    await expect(ImageApplication.fetchCardImage(URI, borrowed)).resolves.toBe(IMAGE);
    await expect(ImageApplication.fetchCardImage(URI, 'https://pending.example/b.jpg')).resolves.toBeNull();

    expect(mockGroup).toHaveBeenCalledTimes(1);
    expect(mockGroup).toHaveBeenCalledWith('g');
    expect(readImages()).toEqual([borrowed]);
  });

  it('reads no image for a card Pinakes does not know, or without a Pinakes', async () => {
    mockCard.mockResolvedValue(null);
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBeNull();
    expect(mockImageFetch).not.toHaveBeenCalled();
  });

  it('answers unavailable when Pinakes fails, reading no image, then asks Pinakes nothing for a while', async () => {
    vi.useFakeTimers();
    // The service reports its own failures (an AppError); the application only answers them.
    mockCard.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(card());
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE_UNAVAILABLE);
    expect(mockImageFetch).not.toHaveBeenCalled();

    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE_BUSY);
    expect(mockCard).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(IMAGE_PINAKES_PAUSE_MS);
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
  });

  it('answers busy when Pinakes is busy, and asks it nothing until its Retry-After has passed', async () => {
    vi.useFakeTimers();
    mockCard.mockResolvedValueOnce({ busy: true, retryAfterMs: 60_000 }).mockResolvedValue(card());
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE_BUSY);
    vi.advanceTimersByTime(59_000);
    await expect(ImageApplication.fetchCardImage('https://other.example/', COVER)).resolves.toBe(IMAGE_BUSY);
    expect(mockCard).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
    expect(mockCard).toHaveBeenCalledTimes(2);
  });

  it('pauses Pinakes for thirty seconds after a 429 without Retry-After', async () => {
    vi.useFakeTimers();
    mockCard.mockResolvedValueOnce({ busy: true, retryAfterMs: null }).mockResolvedValue(card());
    await ImageApplication.fetchCardImage(URI, COVER);
    vi.advanceTimersByTime(IMAGE_PINAKES_PAUSE_MS - 1);
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE_BUSY);
    vi.advanceTimersByTime(1);
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
  });

  it('serves an image read for one card to another card only when that card carries it too', async () => {
    const OTHER = 'https://www.deezer.com/album/2';
    mockCard.mockImplementation(async (uri: string) => (uri === URI ? card() : card({ uri: OTHER, image: null })));

    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
    await expect(ImageApplication.fetchCardImage(OTHER, COVER)).resolves.toBeNull();
    expect(mockImageFetch).toHaveBeenCalledTimes(1);
  });

  it('answers busy for a new card without asking Pinakes once its budget, past the reserve, is spent', async () => {
    mockCard.mockResolvedValue(null);
    const newReads = IMAGE_PINAKES_BURST - IMAGE_PINAKES_RESERVE;
    for (let index = 0; index < newReads; index++) {
      await ImageApplication.fetchCardImage(`https://a.example/${index}`, COVER);
    }
    expect(mockCard).toHaveBeenCalledTimes(newReads);

    await expect(ImageApplication.fetchCardImage('https://a.example/more', COVER)).resolves.toBe(IMAGE_BUSY);
    expect(mockCard).toHaveBeenCalledTimes(newReads);
  });

  it('keeps the reserve for a card it knows, and answers from that card when nothing is left', async () => {
    vi.useFakeTimers();
    mockCard.mockResolvedValue(card());
    await ImageApplication.fetchCardImage(URI, COVER);
    mockCard.mockResolvedValue(null);
    for (let index = 0; index < IMAGE_PINAKES_BURST; index++) {
      await ImageApplication.fetchCardImage(`https://a.example/${index}`, COVER);
    }
    expect(mockCard).toHaveBeenCalledTimes(1 + IMAGE_PINAKES_BURST - 1 - IMAGE_PINAKES_RESERVE);

    // The known card's entry ran out: its re-read takes from the reserve.
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    mockCard.mockResolvedValue(card());
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
    expect(mockCard).toHaveBeenLastCalledWith(URI);
  });

  it('counts a card Pinakes did not know as unknown: its re-read takes nothing from the reserve', async () => {
    vi.useFakeTimers();
    mockCard.mockResolvedValue(null);
    await ImageApplication.fetchCardImage('https://junk.example/1', COVER);
    // Its "not known" has run out, and the budget is back to full.
    vi.advanceTimersByTime(31_000);
    const newReads = IMAGE_PINAKES_BURST - IMAGE_PINAKES_RESERVE;
    for (let index = 0; index < newReads; index++) {
      await ImageApplication.fetchCardImage(`https://a.example/${index}`, COVER);
    }

    await expect(ImageApplication.fetchCardImage('https://junk.example/1', COVER)).resolves.toBe(IMAGE_BUSY);
    expect(mockCard).toHaveBeenCalledTimes(1 + newReads);
  });

  it('answers from the card it knew, expired, while Pinakes is paused', async () => {
    vi.useFakeTimers();
    mockCard.mockResolvedValueOnce(card()).mockResolvedValueOnce({ busy: true, retryAfterMs: 60_000 });
    await ImageApplication.fetchCardImage(URI, COVER);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    // Another card's read finds Pinakes busy: it is paused for a minute.
    await expect(ImageApplication.fetchCardImage('https://other.example/', COVER)).resolves.toBe(IMAGE_BUSY);

    // The expired card still answers, and nobody asks Pinakes.
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
    expect(mockCard).toHaveBeenCalledTimes(2);
  });

  it('keeps the card it knew when its re-read for a missing image comes back busy, answering "not on the card"', async () => {
    vi.useFakeTimers();
    mockCard.mockResolvedValueOnce(card()).mockResolvedValue({ busy: true, retryAfterMs: null });
    await ImageApplication.fetchCardImage(URI, COVER);
    vi.advanceTimersByTime(30_001);

    await expect(ImageApplication.fetchCardImage(URI, 'https://evil.example/x.jpg')).resolves.toBeNull();
    expect(mockCard).toHaveBeenCalledTimes(2);
    // The card is still known: its own image is served without asking Pinakes.
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
    expect(mockCard).toHaveBeenCalledTimes(2);
  });

  it('serves a card’s own link’s preview image when it has none of its own (`og`), reading that link only', async () => {
    const OG = 'https://cdn.example/og.jpg';
    mockCard.mockResolvedValue(card({ image: null, uri: 'https://www.example.com/page' }));
    mockOg.mockResolvedValue({ url: 'https://www.example.com/page', type: 'website', title: 'A page', image: OG });

    await expect(ImageApplication.fetchCardImage(URI, OG, { og: true })).resolves.toBe(IMAGE);
    await expect(ImageApplication.fetchCardImage(URI, 'https://evil.example/x.jpg', { og: true })).resolves.toBeNull();

    expect(mockOg.mock.calls.map(([url]) => String(url))).toEqual(['https://www.example.com/page']);
    expect(readImages()).toEqual([OG]);
  });

  it('reads no preview for a card with an image of its own, or one Pinakes is still reading', async () => {
    mockCard.mockResolvedValueOnce(card()).mockResolvedValueOnce(card({ image: null, status: 'pending' }));
    await expect(ImageApplication.fetchCardImage(URI, 'https://cdn.example/og.jpg', { og: true })).resolves.toBeNull();
    await expect(
      ImageApplication.fetchCardImage('https://other.example/', 'https://cdn.example/og.jpg', { og: true }),
    ).resolves.toBeNull();
    expect(mockOg).not.toHaveBeenCalled();
  });

  it('reads a card and an image once for many requests, together or after each other', async () => {
    mockCard.mockResolvedValue(card());

    await Promise.all([ImageApplication.fetchCardImage(URI, COVER), ImageApplication.fetchCardImage(URI, COVER)]);
    await ImageApplication.fetchCardImage(URI, COVER);

    expect(mockCard).toHaveBeenCalledTimes(1);
    expect(mockImageFetch).toHaveBeenCalledTimes(1);
  });

  it('asks Pinakes again after thirty seconds for a card it did not know or was still reading', async () => {
    vi.useFakeTimers();
    mockCard
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(card({ status: 'pending', image: null }))
      .mockResolvedValue(card());
    await ImageApplication.fetchCardImage(URI, COVER);
    vi.advanceTimersByTime(30_001);
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBeNull();
    await ImageApplication.fetchCardImage(URI, COVER);
    expect(mockCard).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30_001);
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
    expect(mockCard).toHaveBeenCalledTimes(3);
  });

  it('reads a card again once, for an image it lacked, when it was read more than thirty seconds ago', async () => {
    vi.useFakeTimers();
    const added = 'https://i.scdn.co/image/new';
    mockCard.mockResolvedValueOnce(card()).mockResolvedValue(card({ image: added }));
    await ImageApplication.fetchCardImage(URI, COVER);

    await expect(ImageApplication.fetchCardImage(URI, added)).resolves.toBeNull();
    expect(mockCard).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_001);
    await expect(ImageApplication.fetchCardImage(URI, added)).resolves.toBe(IMAGE);
    expect(mockCard).toHaveBeenCalledTimes(2);
  });

  it('reads no card again for a group image its cached group carries, however old the card is', async () => {
    vi.useFakeTimers();
    const borrowed = 'https://upload.wikimedia.org/a.jpg';
    mockCard.mockResolvedValue(card({ image: null, group: { id: 'g', size: 3 } }));
    mockGroup.mockResolvedValue(group([member(borrowed)]));
    await ImageApplication.fetchCardImage(URI, borrowed);
    vi.advanceTimersByTime(60_000);

    await expect(ImageApplication.fetchCardImage(URI, borrowed)).resolves.toBe(IMAGE);
    expect(mockCard).toHaveBeenCalledTimes(1);
  });

  it('answers unavailable for an image host that failed for now, remembering nothing', async () => {
    mockCard.mockResolvedValue(card());
    mockImageFetch.mockResolvedValueOnce('failed').mockResolvedValue(IMAGE);
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE_UNAVAILABLE);
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
  });

  it('keeps at most its count of images, the oldest used out first', async () => {
    const images = Array.from(
      { length: IMAGE_CACHE_ENTRIES + 1 },
      (_, index) => `https://cdn${index % 7}.example/${index}.jpg`,
    );
    mockCard.mockResolvedValue(
      card({ image: null, episodes: images.map((image, index) => ({ uri: `u${index}`, guid: `${index}`, image })) }),
    );

    for (const image of images) await ImageApplication.fetchCardImage(URI, image);
    await ImageApplication.fetchCardImage(URI, images[images.length - 1]);
    expect(mockImageFetch).toHaveBeenCalledTimes(images.length);
    await ImageApplication.fetchCardImage(URI, images[0]);
    expect(mockImageFetch).toHaveBeenCalledTimes(images.length + 1);
  });

  it('answers busy for a new image while too many others are read, reading and remembering nothing', async () => {
    const images = Array.from({ length: IMAGE_MAX_IN_FLIGHT + 1 }, (_, index) => `https://cdn${index}.example/x.jpg`);
    mockCard.mockResolvedValue(
      card({ image: null, episodes: images.map((image, index) => ({ uri: `u${index}`, guid: `${index}`, image })) }),
    );
    mockImageFetch.mockImplementation(() => new Promise(() => {}));
    await ImageApplication.fetchCardImage(URI, 'https://not-on-card.example/x.jpg');

    for (const image of images.slice(0, IMAGE_MAX_IN_FLIGHT)) void ImageApplication.fetchCardImage(URI, image);
    await vi.waitFor(() => expect(mockImageFetch).toHaveBeenCalledTimes(IMAGE_MAX_IN_FLIGHT));
    await expect(ImageApplication.fetchCardImage(URI, images[IMAGE_MAX_IN_FLIGHT])).resolves.toBe(IMAGE_BUSY);
    expect(mockImageFetch).toHaveBeenCalledTimes(IMAGE_MAX_IN_FLIGHT);
  });

  it('reads at most a few images of one site at once, any of its hosts, the next waiting briefly, then busy', async () => {
    vi.useFakeTimers();
    // Each image on its own subdomain: one site all the same.
    const images = Array.from(
      { length: IMAGE_READS_PER_SITE + 1 },
      (_, index) => `https://h${index}.slow.example/x.jpg`,
    );
    mockCard.mockResolvedValue(
      card({ image: null, episodes: images.map((image, index) => ({ uri: `u${index}`, guid: `${index}`, image })) }),
    );
    // The service asks the read's slot for each hop, as the real one does.
    mockImageFetch.mockImplementation(
      async (url: URL, { enterHop }: { enterHop: (url: URL) => Promise<(() => void) | null> }) => {
        const release = await enterHop(url);
        return release ? new Promise(() => {}) : 'busy';
      },
    );

    for (const image of images.slice(0, IMAGE_READS_PER_SITE)) void ImageApplication.fetchCardImage(URI, image);
    const waiting = ImageApplication.fetchCardImage(URI, images[IMAGE_READS_PER_SITE]);
    await vi.advanceTimersByTimeAsync(IMAGE_SITE_WAIT_MS);

    await expect(waiting).resolves.toBe(IMAGE_BUSY);
  });

  it('counts each redirect hop for its own site, a site once per read', async () => {
    mockCard.mockResolvedValue(card());
    const sites: string[] = [];
    mockImageFetch.mockImplementation(
      async (_url: URL, { enterHop }: { enterHop: (url: URL) => Promise<(() => void) | null> }) => {
        for (const hop of ['https://coverartarchive.org/a', 'https://archive.org/b', 'https://ia8.us.archive.org/c']) {
          const release = await enterHop(new URL(hop));
          sites.push(release ? new URL(hop).hostname : 'none');
        }
        return IMAGE;
      },
    );
    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
    expect(sites).toEqual(['coverartarchive.org', 'archive.org', 'ia8.us.archive.org']);
  });
});

describe('ImageApplication.fetchLinkImage', () => {
  const LINK = new URL('https://www.example.com/article');
  const OG_IMAGE = 'https://cdn.example.com/og.jpg';

  it('serves the image the link’s own preview names, as the link preview reads it', async () => {
    mockOg.mockResolvedValue({ url: LINK.href, type: 'website', title: 'A page', image: OG_IMAGE });

    await expect(ImageApplication.fetchLinkImage(LINK, OG_IMAGE)).resolves.toBe(IMAGE);
    await expect(ImageApplication.fetchLinkImage(LINK, 'https://evil.example/x.jpg')).resolves.toBeNull();

    expect(mockOg).toHaveBeenCalledTimes(1);
    expect(String(mockOg.mock.calls[0][0])).toBe(LINK.href);
    expect(readImages()).toEqual([OG_IMAGE]);
    expect(mockCard).not.toHaveBeenCalled();
  });

  it('reads no image for a link whose preview names none', async () => {
    mockOg.mockResolvedValue({ url: LINK.href, type: 'website', title: 'A page', image: null });
    await expect(ImageApplication.fetchLinkImage(LINK, OG_IMAGE)).resolves.toBeNull();
    expect(mockImageFetch).not.toHaveBeenCalled();
  });

  it('answers unavailable, remembering nothing, when the page could not be read for now', async () => {
    const timedOut = { url: LINK.href, type: 'website', title: null, image: null };
    transientPreviews.add(timedOut);
    mockOg.mockResolvedValueOnce(timedOut).mockResolvedValue({ url: LINK.href, type: 'website', image: OG_IMAGE });

    await expect(ImageApplication.fetchLinkImage(LINK, OG_IMAGE)).resolves.toBe(IMAGE_UNAVAILABLE);
    await expect(ImageApplication.fetchLinkImage(LINK, OG_IMAGE)).resolves.toBe(IMAGE);
  });

  it('answers busy without reading a page once the page budget, past what it leaves to cards, is spent', async () => {
    mockOg.mockResolvedValue({ url: LINK.href, type: 'website', image: null });
    const linkReads = IMAGE_PAGE_BURST - IMAGE_PAGE_RESERVE;
    for (let index = 0; index < linkReads; index++) {
      await ImageApplication.fetchLinkImage(new URL(`https://www.example.com/${index}`), OG_IMAGE);
    }
    await expect(ImageApplication.fetchLinkImage(new URL('https://www.example.com/more'), OG_IMAGE)).resolves.toBe(
      IMAGE_BUSY,
    );
    expect(mockOg).toHaveBeenCalledTimes(linkReads);

    // A card's own link still gets its preview read from the reserve.
    mockCard.mockResolvedValue(card({ image: null, uri: 'https://www.example.com/card' }));
    mockOg.mockResolvedValue({ url: 'https://www.example.com/card', type: 'website', image: OG_IMAGE });
    await expect(ImageApplication.fetchCardImage(URI, OG_IMAGE, { og: true })).resolves.toBe(IMAGE);
  });

  it('answers from the preview it knew, expired, when the page is not read now', async () => {
    vi.useFakeTimers();
    mockOg.mockResolvedValueOnce({ url: LINK.href, type: 'website', image: OG_IMAGE });
    await ImageApplication.fetchLinkImage(LINK, OG_IMAGE);
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    const timedOut = { url: LINK.href, type: 'website', title: null, image: null };
    transientPreviews.add(timedOut);
    mockOg.mockResolvedValue(timedOut);

    await expect(ImageApplication.fetchLinkImage(LINK, OG_IMAGE)).resolves.toBe(IMAGE);
  });

  it('answers unavailable when the link preview fails unexpectedly', async () => {
    mockOg.mockRejectedValue(new TypeError('redirect loop'));
    await expect(ImageApplication.fetchLinkImage(LINK, OG_IMAGE)).resolves.toBe(IMAGE_UNAVAILABLE);
    expect(mockImageFetch).not.toHaveBeenCalled();
  });
});

describe('ImageApplication.fetchYouTubeThumbnail', () => {
  it('keeps thumbnails apart from card images: a flood of missing ones pushes no cover out', async () => {
    vi.useFakeTimers();
    mockCard.mockResolvedValue(card());
    await ImageApplication.fetchCardImage(URI, COVER);
    mockImageFetch.mockResolvedValue(null);
    for (let index = 0; index < IMAGE_CACHE_ENTRIES + 1; index++) {
      // Past its burst, the thumbnail budget refills by the second.
      vi.advanceTimersByTime(1_000);
      await ImageApplication.fetchYouTubeThumbnail({ id: `id${String(index).padStart(9, '0')}`, variant: 'hq720' });
    }
    mockImageFetch.mockClear();

    await expect(ImageApplication.fetchCardImage(URI, COVER)).resolves.toBe(IMAGE);
    expect(mockImageFetch).not.toHaveBeenCalled();
  });

  it('answers busy for a new thumbnail once its own budget is spent', async () => {
    for (let index = 0; index < IMAGE_THUMBNAIL_BURST; index++) {
      await ImageApplication.fetchYouTubeThumbnail({ id: `id${String(index).padStart(9, '0')}`, variant: 'mqdefault' });
    }
    await expect(ImageApplication.fetchYouTubeThumbnail({ id: 'idmore00000', variant: 'mqdefault' })).resolves.toBe(
      IMAGE_BUSY,
    );
  });

  it('reads the thumbnail from i.ytimg.com only, at the address the ID and size make', async () => {
    await expect(ImageApplication.fetchYouTubeThumbnail({ id: 'dQw4w9WgXcQ', variant: 'hq720' })).resolves.toBe(IMAGE);
    expect(readImages()).toEqual(['https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg']);
    expect(mockCard).not.toHaveBeenCalled();
  });
});
