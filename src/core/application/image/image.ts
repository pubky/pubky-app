import {
  IMAGE_BUSY,
  IMAGE_UNAVAILABLE,
  type TResourceImage,
  type TResourceImageRead,
} from '@/application/image/image.types';
import { getFaviconSite } from '@/libs/favicon/favicon';
import {
  getBorrowingGroupId,
  getCardImageUrls,
  getCardPreviewLink,
  getEpisodePageImageUrls,
  getGroupImageUrls,
  isSettledCard,
} from '@/pipes/image/image.cards';
import { getYouTubeThumbnailSource, normalizeImageSrc, type TYouTubeThumbnail } from '@/pipes/image/image.validators';
import { NextJsImageService } from '@/services/nextjs/image/image';
import { GUARDED_IMAGE_BUSY, GUARDED_IMAGE_FAILED } from '@/services/nextjs/nextjs.image';
import { isTransientOgFallback, NextJsOgMetadataService } from '@/services/nextjs/og-metadata/og-metadata';
import { isPinakesBusy, PinakesService, type TPinakesBusy } from '@/services/pinakes/pinakes';
import { PinakesStatus } from '@/services/pinakes/pinakes.types';
import { BOUNDED_READ_BUSY, BoundedReadCache } from '@/utils/bounded-cache';
import { KeyedSlots } from '@/utils/keyed-slots';
import { TokenBucket } from '@/utils/token-bucket';

/** What the route may read for one card: its own images, and where it may find more. */
type TCardImages = {
  images: string[];
  /** The group it may borrow an image from (`getBorrowingGroupId`). */
  groupId: string | null;
  /** Its Pinakes ID when it is settled: a show's episodes are searched by it. */
  id: string | null;
  /** A settled card with no image of its own: the web link whose preview image it may show. */
  previewLink: string | null;
  /** Pinakes is still reading it (`pending`): asked again after `CARD_UNSETTLED_TTL_MS`. */
  pending: boolean;
};

/** A read that was not made or may pass later: answered, never remembered. */
type TNotNow = typeof IMAGE_BUSY | typeof IMAGE_UNAVAILABLE;

/** Cards kept in memory at most, with or without images (a few hundred bytes each). */
export const IMAGE_CARD_ENTRIES = 1024;
/** Groups, episode searches and link previews kept in memory at most, each. */
export const IMAGE_LIST_ENTRIES = 256;
/** Images kept in memory at most. */
export const IMAGE_CACHE_ENTRIES = 512;
/** Bytes of images kept in memory at most, all together (each at most `IMAGE_MAX_BYTES`). */
export const IMAGE_CACHE_BYTES = 64 * 1024 * 1024;
/**
 * Reads of different images running at once at most. A read holds up to twice `IMAGE_MAX_BYTES` (the
 * body's parts and the joined copy) for up to its 8 s, so all reads together stay under 128 MB.
 */
export const IMAGE_MAX_IN_FLIGHT = 16;
/**
 * Reads of one site at once at most (`getFaviconSite`: every subdomain of a site counts as the site),
 * images and link pages together, each redirect hop counted for its own site: so no site, however
 * many hosts it names, holds every read.
 */
export const IMAGE_READS_PER_SITE = 2;
/** How long a read waits for its site's slot before the route answers busy. */
export const IMAGE_SITE_WAIT_MS = 2_000;
/** Pinakes reads (cards, groups, episode searches) running at once at most. */
export const IMAGE_MAX_CARD_READS = 32;
/**
 * This server instance's budget of Pinakes reads for the route, all viewers together: 30 at once, one
 * a second after that, half of Pinakes' default per-address budget (120 a minute), so the route never
 * spends what the app's other server reads need. `IMAGE_PINAKES_RESERVE` of it is kept for re-reads of
 * cards already known (a card whose kept answer ran out). Past it the route answers from what it knew
 * (an expired card), else busy, without asking Pinakes. Each instance has its own budget: a deployment
 * limits requests per client at its edge, keyed by the address its own proxy trusts.
 */
export const IMAGE_PINAKES_BURST = 30;
export const IMAGE_PINAKES_PER_SECOND = 1;
export const IMAGE_PINAKES_RESERVE = 10;
/**
 * This server instance's budget of page reads for link preview images (`?link=`, and a card's own
 * link when it has no image): 20 at once, one every two seconds after that.
 */
export const IMAGE_PAGE_BURST = 20;
export const IMAGE_PAGE_PER_SECOND = 0.5;
/** The part of the page budget `?link=` leaves to cards' own links (`og=1`). */
export const IMAGE_PAGE_RESERVE = 5;
/**
 * This server instance's budget of YouTube thumbnail reads, and their own cache, apart from card
 * images': any video ID can be asked for. A visual timeline asks two sizes per video at most, a card two sizes
 * twice each (`ResourceCard`, for a card image that is a YouTube thumbnail).
 */
export const IMAGE_THUMBNAIL_BURST = 60;
export const IMAGE_THUMBNAIL_PER_SECOND = 2;
export const IMAGE_THUMBNAIL_ENTRIES = 256;
export const IMAGE_THUMBNAIL_BYTES = 16 * 1024 * 1024;
/**
 * How long Pinakes is not asked after it answered 429 or a server error without a `Retry-After`, or did
 * not answer: the route answers from what it knew, else busy, meanwhile. A `Retry-After` is honoured up
 * to `IMAGE_PINAKES_MAX_PAUSE_MS`.
 */
export const IMAGE_PINAKES_PAUSE_MS = 30 * 1000;
export const IMAGE_PINAKES_MAX_PAUSE_MS = 5 * 60 * 1000;
/** How long a settled card's images are known without asking Pinakes again: as long as the app's card cache. */
const CARD_TTL_MS = 5 * 60 * 1000;
/** How long Pinakes not knowing a card, or still reading it, is remembered: it may read the link any moment. */
const CARD_UNSETTLED_TTL_MS = 30 * 1000;
/** A card read longer ago than this is read again once before answering that it lacks an image. */
const CARD_RECHECK_MS = 30 * 1000;
/** How long a link's preview image is known without reading its page again. */
const LINK_TTL_MS = 60 * 60 * 1000;
/** How long a link with no preview image is not read again. */
const LINK_MISS_TTL_MS = 10 * 60 * 1000;
/** How long a read image is served without reading it again. */
const IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
/** How long an image that cannot be served (refused, not an image, too large) is not read again. */
const IMAGE_MISS_TTL_MS = 10 * 60 * 1000;

/** A rough size of a list of addresses, for the caches' byte bounds. */
const sizeOfUrls = (urls: readonly string[]) => urls.reduce((total, url) => total + url.length * 2, 64);
const isNotNow = (value: unknown): value is TNotNow => value === IMAGE_BUSY || value === IMAGE_UNAVAILABLE;
const listCache = (maxInFlight: number, hitTtlMs: number, missTtlMs: number) =>
  new BoundedReadCache<string[] | TNotNow>({
    maxEntries: IMAGE_LIST_ENTRIES,
    maxBytes: IMAGE_LIST_ENTRIES * 16 * 1024,
    maxInFlight,
    hitTtlMs,
    missTtlMs,
    sizeOf: (urls) => (isNotNow(urls) ? 0 : sizeOfUrls(urls)),
    keeps: (urls) => !isNotNow(urls),
  });

/**
 * Image application service: one image of a Pinakes card, of a link's own preview, or a YouTube
 * video's thumbnail, for the `/api/image` route, so a viewer's browser never asks an image host.
 *
 * A request names what carries the image and the image. A card (`fetchCardImage`) is read from the
 * app's Pinakes (`GET /v1/resources/by-uri`, read-only) and its image is read (`NextJsImageService`)
 * only when the card is settled (anything but `pending`; a `missing` card keeps its last image) and
 * carries it: its own `image` or a latest episode's (`getCardImageUrls`), else, for a card in a group,
 * a settled member's (`GET /v1/groups/{id}`), else, for a show and an episode's title, the art of the
 * show's episodes by that title (`GET /v1/resources/{id}/episodes?q=`); with `og`, for a settled card
 * with no image of its own, the image its own web link's preview names (`getCardPreviewLink`). A link
 * with no card (`fetchLinkImage`) is read as `/api/og-metadata` reads it (`NextJsOgMetadataService`)
 * and only its `og:image` is served. A YouTube thumbnail (`fetchYouTubeThumbnail`) is read from
 * `i.ytimg.com` at the address the video's ID and a listed size make. Anything else is `null` with no
 * image read; Pinakes not configured or not knowing the card is `null` too.
 *
 * What remains: any public raster image that a real, settled card or a real page's preview names can
 * be read through the app (anyone can have Pinakes read a page of theirs), bounded by the caps below.
 *
 * Cards, groups and episode searches are remembered for five minutes (thirty seconds for a card
 * Pinakes does not know or is still reading; a card read longer ago than that is read again once
 * before the route answers that it lacks an image), link previews for an hour, images for a day (ten
 * minutes for one that cannot be served), each in a cache bounded by entry count, images also by bytes
 * (`BoundedReadCache`). Concurrent requests for one card, group, preview or image share one read.
 * Pinakes reads come from this instance's budget (`IMAGE_PINAKES_BURST`, part reserved for re-reads of
 * known cards) and page reads from their own (`IMAGE_PAGE_BURST`); there is no limit per client here,
 * whose forwarded address can be spoofed. After Pinakes answers 429 or 5xx (for its `Retry-After`, else
 * `IMAGE_PINAKES_PAUSE_MS`) or does not answer, it is not asked for a while. A read not made now (the
 * budget spent, Pinakes paused or busy, a re-read that failed) answers from the card, group or episodes
 * it knew, expired or not, else `IMAGE_BUSY` or `IMAGE_UNAVAILABLE`. A link Pinakes refuses (any other
 * client error) is a card it does not know. At most `IMAGE_MAX_IN_FLIGHT` images are read at once and
 * `IMAGE_READS_PER_SITE` per site, a read waiting up to `IMAGE_SITE_WAIT_MS` for each hop's site (a wait
 * given up on at the read's timeout takes no slot): else `IMAGE_BUSY`. A page read takes its first site's
 * slot only, the page budget bounding the redirects it follows; `?link=` leaves `IMAGE_PAGE_RESERVE` of
 * that budget to cards' own links, and a page not read now answers with its preview known before.
 * YouTube thumbnails have a budget and a cache of their own, apart from card images'. An image host
 * failing for now (a timeout, a server error), or a page whose preview could not be read for now, is
 * `IMAGE_UNAVAILABLE`; neither busy nor unavailable is remembered.
 */
export class ImageApplication {
  private constructor() {}

  private static readonly pinakesBudget = new TokenBucket(IMAGE_PINAKES_BURST, IMAGE_PINAKES_PER_SECOND);
  private static readonly pageBudget = new TokenBucket(IMAGE_PAGE_BURST, IMAGE_PAGE_PER_SECOND);
  private static readonly thumbnailBudget = new TokenBucket(IMAGE_THUMBNAIL_BURST, IMAGE_THUMBNAIL_PER_SECOND);
  /** Until when Pinakes is not asked (epoch ms): it answered 429 or 5xx, or did not answer. */
  private static pinakesPausedUntil = 0;
  private static readonly sites = new KeyedSlots(IMAGE_READS_PER_SITE);

  private static readonly cards = new BoundedReadCache<TCardImages | TNotNow>({
    maxEntries: IMAGE_CARD_ENTRIES,
    maxBytes: IMAGE_CARD_ENTRIES * 4096,
    maxInFlight: IMAGE_MAX_CARD_READS,
    hitTtlMs: CARD_TTL_MS,
    missTtlMs: CARD_UNSETTLED_TTL_MS,
    sizeOf: (card) => (isNotNow(card) ? 0 : sizeOfUrls(card.images)),
    ttlOf: (card) => (card && !isNotNow(card) && card.pending ? CARD_UNSETTLED_TTL_MS : undefined),
    keeps: (card) => !isNotNow(card),
  });

  private static readonly groups = listCache(IMAGE_MAX_CARD_READS, CARD_TTL_MS, CARD_UNSETTLED_TTL_MS);
  private static readonly episodes = listCache(IMAGE_MAX_CARD_READS, CARD_TTL_MS, CARD_UNSETTLED_TTL_MS);
  private static readonly links = listCache(IMAGE_MAX_IN_FLIGHT, LINK_TTL_MS, LINK_MISS_TTL_MS);

  private static readonly thumbnails = new BoundedReadCache<TResourceImage | TNotNow>({
    maxEntries: IMAGE_THUMBNAIL_ENTRIES,
    maxBytes: IMAGE_THUMBNAIL_BYTES,
    maxInFlight: IMAGE_MAX_IN_FLIGHT,
    hitTtlMs: IMAGE_TTL_MS,
    missTtlMs: IMAGE_MISS_TTL_MS,
    sizeOf: (image) => (isNotNow(image) ? 0 : image.body.byteLength),
    keeps: (image) => !isNotNow(image),
  });

  private static readonly images = new BoundedReadCache<TResourceImage | TNotNow>({
    maxEntries: IMAGE_CACHE_ENTRIES,
    maxBytes: IMAGE_CACHE_BYTES,
    maxInFlight: IMAGE_MAX_IN_FLIGHT,
    hitTtlMs: IMAGE_TTL_MS,
    missTtlMs: IMAGE_MISS_TTL_MS,
    sizeOf: (image) => (isNotNow(image) ? 0 : image.body.byteLength),
    keeps: (image) => !isNotNow(image),
  });

  /**
   * The image `src` of the card of `uri`, all validated (`ImageValidators`), when that card carries it.
   *
   * @param options.episode - An episode's title, for a show's episode art its card does not list
   * @param options.og - The card's own preview image: a settled card with no image of its own
   * @returns The image; `null` when the card is unknown or pending, does not carry `src`, or the image
   *   cannot be served; `IMAGE_BUSY` past the budgets and caps with nothing known; `IMAGE_UNAVAILABLE`
   *   when Pinakes, the page or the image host failed
   */
  static async fetchCardImage(
    uri: string,
    src: string,
    { episode, og = false }: { episode?: string; og?: boolean } = {},
  ): Promise<TResourceImageRead> {
    const carried = await ImageApplication.isOnCard(uri, src, { episode, og });
    if (carried !== true) return carried === false ? null : carried;
    return ImageApplication.readImage(src);
  }

  /**
   * The image `src` of a link with no card (validated as `/api/og-metadata` validates it), when that
   * link's own preview names it (`og:image`): the page `/api/og-metadata` reads anyway, nothing more.
   *
   * @returns As `fetchCardImage`
   */
  static async fetchLinkImage(link: URL, src: string): Promise<TResourceImageRead> {
    const images = await ImageApplication.readPreview(link);
    if (isNotNow(images)) return images;
    return images?.includes(src) ? ImageApplication.readImage(src) : null;
  }

  /** A YouTube video's thumbnail (`getYouTubeThumbnailSource`: `i.ytimg.com`, the ID and a listed size). */
  static async fetchYouTubeThumbnail(thumbnail: TYouTubeThumbnail): Promise<TResourceImageRead> {
    // Its own cache and budget: any video ID can be asked for, so neither card images nor their reads
    // are given up for thumbnails.
    return ImageApplication.readImage(getYouTubeThumbnailSource(thumbnail), {
      cache: ImageApplication.thumbnails,
      budget: ImageApplication.thumbnailBudget,
    });
  }

  /** Empties the caches and fills the budgets again (tests). */
  static clearCache(): void {
    for (const cache of [
      ImageApplication.cards,
      ImageApplication.groups,
      ImageApplication.episodes,
      ImageApplication.links,
      ImageApplication.images,
      ImageApplication.thumbnails,
    ]) {
      cache.clear();
    }
    ImageApplication.sites.clear();
    ImageApplication.pinakesBudget.reset();
    ImageApplication.pageBudget.reset();
    ImageApplication.thumbnailBudget.reset();
    ImageApplication.pinakesPausedUntil = 0;
  }

  /**
   * The image itself, read once its card or link is known to carry it, each hop of the read waiting for
   * a slot of its site (a site once per read). `cache` and `budget`: a mode's own (YouTube thumbnails).
   */
  private static async readImage(
    src: string,
    {
      cache = ImageApplication.images,
      budget,
    }: { cache?: BoundedReadCache<TResourceImage | TNotNow>; budget?: TokenBucket } = {},
  ): Promise<TResourceImageRead> {
    const image = await cache.read(src, async () => {
      if (budget && !budget.take()) return IMAGE_BUSY;
      const entered = new Set<string>();
      const read = await NextJsImageService.fetch(new URL(src), {
        enterHop: async (url, signal) => {
          const site = getFaviconSite(url.hostname);
          if (entered.has(site)) return () => {};
          entered.add(site);
          return ImageApplication.sites.acquire(site, IMAGE_SITE_WAIT_MS, signal);
        },
      });
      if (read === GUARDED_IMAGE_BUSY) return IMAGE_BUSY;
      return read === GUARDED_IMAGE_FAILED ? IMAGE_UNAVAILABLE : read;
    });
    return image === BOUNDED_READ_BUSY ? IMAGE_BUSY : image;
  }

  /**
   * A page's preview image, as `/api/og-metadata` reads it, from the page budget (`reserved`: a card's
   * own link, which may take the part `?link=` leaves, `IMAGE_PAGE_RESERVE`) and its first site's slot
   * (redirects the page read follows to other sites take none: the page budget bounds them): `[image]`,
   * `null` without one, `IMAGE_UNAVAILABLE` when the page could not be read for now. A read not made now
   * answers with the preview known before, expired or not.
   */
  private static async readPreview(
    link: URL,
    { reserved = false }: { reserved?: boolean } = {},
  ): Promise<string[] | null | TNotNow> {
    const known = ImageApplication.links.stale(link.href);
    const images = await ImageApplication.links.read(link.href, async () => {
      if (!ImageApplication.pageBudget.take(reserved ? 0 : IMAGE_PAGE_RESERVE)) return IMAGE_BUSY;
      const release = await ImageApplication.sites.acquire(getFaviconSite(link.hostname), IMAGE_SITE_WAIT_MS);
      if (!release) return IMAGE_BUSY;
      try {
        const preview = await NextJsOgMetadataService.fetch(link);
        // A page that timed out or answered an error may have its image another time.
        if (isTransientOgFallback(preview)) return IMAGE_UNAVAILABLE;
        const image = preview.type === 'website' ? normalizeImageSrc(preview.image) : null;
        return image ? [image] : null;
      } catch {
        // The link preview reports what it does not expect; nothing more is said here.
        return IMAGE_UNAVAILABLE;
      } finally {
        release();
      }
    });
    if (images !== BOUNDED_READ_BUSY && !isNotNow(images)) return images;
    // Not read now: the preview known before, expired or not, answers.
    if (known !== undefined && !isNotNow(known)) return known;
    return images === BOUNDED_READ_BUSY ? IMAGE_BUSY : images;
  }

  /**
   * One Pinakes read from the instance's budget (a key not known yet leaves `IMAGE_PINAKES_RESERVE` to
   * known ones): `IMAGE_BUSY` without a read while Pinakes is paused or the budget is spent, and when
   * Pinakes is busy or failing (which pauses it); `IMAGE_UNAVAILABLE` when it did not answer (paused too).
   */
  private static async fromPinakes<V>(
    known: boolean,
    read: () => Promise<V | null | TPinakesBusy>,
  ): Promise<V | null | TNotNow> {
    if (Date.now() < ImageApplication.pinakesPausedUntil) return IMAGE_BUSY;
    if (!ImageApplication.pinakesBudget.take(known ? 0 : IMAGE_PINAKES_RESERVE)) return IMAGE_BUSY;
    let value: V | null | TPinakesBusy;
    try {
      value = await read();
    } catch {
      // The service has reported what it does not expect; the route answers without a detail.
      ImageApplication.pausePinakes(IMAGE_PINAKES_PAUSE_MS);
      return IMAGE_UNAVAILABLE;
    }
    if (isPinakesBusy(value)) {
      ImageApplication.pausePinakes(Math.min(value.retryAfterMs ?? IMAGE_PINAKES_PAUSE_MS, IMAGE_PINAKES_MAX_PAUSE_MS));
      return IMAGE_BUSY;
    }
    return value;
  }

  /** Asks Pinakes nothing for `ms` from now. */
  private static pausePinakes(ms: number): void {
    ImageApplication.pinakesPausedUntil = Math.max(ImageApplication.pinakesPausedUntil, Date.now() + ms);
  }

  /**
   * `key`'s value in `cache`, read from Pinakes when none fresh is kept; a read not made now (busy,
   * unavailable) answers with the value it kept before, expired or not, when there is one.
   */
  private static async readKnown<V>(
    cache: BoundedReadCache<V | TNotNow>,
    key: string,
    read: () => Promise<V | TPinakesBusy | null>,
    options: { maxAgeMs?: number } = {},
  ): Promise<V | null | TNotNow> {
    // Known: a value kept for the key. A kept "not known to Pinakes" (`null`) is not one: it neither
    // takes from the reserve nor answers in a read's place.
    const stale = cache.stale(key);
    const known = stale !== undefined && stale !== null && !isNotNow(stale) ? stale : null;
    const value = await cache.read(key, () => ImageApplication.fromPinakes(known !== null, read), options);
    if (value !== BOUNDED_READ_BUSY && !isNotNow(value)) return value;
    if (known !== null) return known;
    return value === BOUNDED_READ_BUSY ? IMAGE_BUSY : value;
  }

  /** Whether the card of `uri` carries `src`: of its own, from its group, its episodes or its preview. */
  private static async isOnCard(
    uri: string,
    src: string,
    { episode, og }: { episode?: string; og: boolean },
  ): Promise<boolean | TNotNow> {
    const readCard = (options?: { maxAgeMs?: number }) =>
      ImageApplication.readKnown<TCardImages>(
        ImageApplication.cards,
        uri,
        async () => {
          const card = await PinakesService.readCardForImage(uri);
          if (!card || isPinakesBusy(card)) return card;
          const images = getCardImageUrls(card);
          return {
            images,
            groupId: getBorrowingGroupId(card),
            id: isSettledCard(card) ? card.id : null,
            previewLink: isSettledCard(card) && !normalizeImageSrc(card.image) ? getCardPreviewLink(card) : null,
            pending: card.status === PinakesStatus.PENDING,
          };
        },
        options,
      );
    let card = await readCard();
    if (!card || isNotNow(card)) return card ?? false;
    const carried = await ImageApplication.carries(card, src, { episode, og });
    if (carried !== false) return carried;
    // Nothing the card names carries `src`. Read longer ago than a card may change in (an image added
    // since): read once more before saying no; a re-read not made now answers with the card known before.
    const known = card;
    card = await readCard({ maxAgeMs: CARD_RECHECK_MS });
    if (!card || isNotNow(card) || card === known) return false;
    return ImageApplication.carries(card, src, { episode, og });
  }

  /** Whether a card carries `src`: of its own, from its group or its episodes, or (`og`) its link's preview. */
  private static async carries(
    card: TCardImages,
    src: string,
    { episode, og }: { episode?: string; og: boolean },
  ): Promise<boolean | TNotNow> {
    if (og) {
      if (!card.previewLink) return false;
      const preview = await ImageApplication.readPreview(new URL(card.previewLink), { reserved: true });
      if (isNotNow(preview)) return preview;
      return preview?.includes(src) ?? false;
    }
    if (card.images.includes(src)) return true;

    const { groupId, id } = card;
    if (groupId) {
      const members = await ImageApplication.readKnown<string[]>(ImageApplication.groups, groupId, async () => {
        const group = await PinakesService.readGroupForImage(groupId);
        return group && !isPinakesBusy(group) ? getGroupImageUrls(group) : group;
      });
      if (isNotNow(members)) return members;
      if (members?.includes(src)) return true;
    }
    if (episode && id) {
      const art = await ImageApplication.readKnown<string[]>(
        ImageApplication.episodes,
        `${id}\n${episode}`,
        async () => {
          const page = await PinakesService.readEpisodesForImage(id, episode);
          return page && !isPinakesBusy(page) ? getEpisodePageImageUrls(page) : page;
        },
      );
      if (isNotNow(art)) return art;
      if (art?.includes(src)) return true;
    }
    return false;
  }
}
