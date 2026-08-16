import { Logger } from '@/libs/logger/logger';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { fetchUserAndPostForMetadata } from '@/libs/post/postMetadata';
import { truncateByGraphemes } from '@/libs/utils/truncate';
import { generateRandomColor, getDisplayTags, isPostDeleted, resolveDisplayName } from '@/libs/utils/utils';
import { FileVariant } from '@/services/nexus/file/file.types';
import { OgAvatar, OgFrame, OgHeader } from './OgComponents';
import { OG_SIZE, OG_TOKENS, OG_TRUNCATE } from './ogConstants';
import { buildAvatarUrl, fetchImageAsDataUri, fetchPostTags, resolvePostAttachmentUrl } from './ogData';
import { LibraryIcon, StickyNoteIcon } from './OgIcons';
import { ogImageResponse } from './ogImageResponse';
import { renderFallbackOg } from './renderFallbackOg';

/** Matches the Figma card, which shows at most three tag chips. */
const MAX_COLLECTION_TAGS = 3;

/**
 * Character budget across chip labels (fed to `getDisplayTags`): the chip row
 * must never exceed the card's 976px content width — satori neither wraps nor
 * shrinks flex children, so an over-budget row would clip at the card edge.
 * 36 label chars ≈ 540px of typical 26px bold text plus ~250px of chip
 * padding/counts/gaps leaves headroom even for wide glyphs.
 */
const TAG_CHAR_BUDGET = 36;

const CARD_RADIUS = 24;
/** Frame width minus the 64px side paddings of the content area. */
const CARD_WIDTH = OG_SIZE.width - 2 * 64;
const CARD_PADDING = 48;
const CARD_ROW_GAP = 24;
/** Fixed row heights so the card height is computable up front (see below). */
const TITLE_ROW_HEIGHT = 48;
const DESCRIPTION_ROW_HEIGHT = 40;
const TAGS_ROW_HEIGHT = 56;

/**
 * Opaque chip color matching the app's `PostTag` molecule: in-app the chip
 * layers `rgba(background, 0.7)` over the opaque tag color — a flat
 * 0.3·tag + 0.7·page-background blend, independent of what's behind the chip.
 * satori has no such layering, so the blend is precomputed here.
 *
 * Exported for tests.
 */
export function solidTagColor(label: string): string {
  const TINT_ALPHA = 0.3;
  const tint = generateRandomColor(label)
    .match(/\w\w/g)!
    .map((x) => parseInt(x, 16));
  const base = OG_TOKENS.background.match(/\w\w/g)!.map((x) => parseInt(x, 16));
  const blended = tint.map((channel, i) => Math.round(channel * TINT_ALPHA + base[i] * (1 - TINT_ALPHA)));
  return `rgb(${blended[0]}, ${blended[1]}, ${blended[2]})`;
}

/**
 * Mirrors `CollectionCountBadge` for the posts pill. Tag counts share it — the
 * app renders raw tag counts, but compact notation keeps chips narrow within
 * the card's fixed width (intentional divergence).
 */
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact' });

/**
 * Tag chip, scaled up from the app's `PostTag`: opaque label-derived background
 * with a half-opacity count.
 *
 * Exported for tests.
 */
export function TagChip({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 56,
        borderRadius: 12,
        paddingLeft: 20,
        paddingRight: 20,
        backgroundColor: solidTagColor(label),
      }}
    >
      <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: OG_TOKENS.foreground }}>
        {truncateByGraphemes(label, OG_TRUNCATE.collectionTag)}
      </div>
      <div
        style={{ display: 'flex', marginLeft: 10, fontSize: 26, fontWeight: 500, color: 'rgba(255, 255, 255, 0.5)' }}
      >
        {compactNumber.format(count)}
      </div>
    </div>
  );
}

/**
 * Renders the dynamic OG image for a collection: the standard post header
 * (avatar + name + brand mark) over a scaled-up `CollectionCard` — cover image
 * with the card's darkening gradient, library icon + name, count pill + owner
 * avatar, description, and up to three tag chips. Interactive chrome from the
 * app card (Follow/Unfollow, the add-tag button) is intentionally omitted — a
 * static image can't host controls.
 *
 * Reached from both the collections `opengraph-image` route and the
 * `renderPostOg` short-circuit for `kind === 'collection'` posts.
 * Non-collection posts (the collections URL can be probed with any post id),
 * deleted posts, and unparsable collections fall back to the default static
 * preview.
 */
export async function renderCollectionOg({ userId, postId }: { userId: string; postId: string }): Promise<Response> {
  try {
    // Started before the user/post await — it depends only on the route params
    // and can never reject (errors collapse to []), so it safely overlaps the
    // first Nexus round-trip and floats across the early-return paths below.
    const tagsPromise = fetchPostTags(userId, postId, MAX_COLLECTION_TAGS);

    const result = await fetchUserAndPostForMetadata(userId, postId);
    if (!result) return renderFallbackOg();

    const { user, post } = result;
    // Kind gate: without it, any post whose content happens to parse as a
    // collection envelope would render a fabricated collection card here
    // (mirrors the page's generateMetadata and renderPostOg's positive check).
    if (post.kind !== 'collection') return renderFallbackOg();
    if (isPostDeleted(post.content)) return renderFallbackOg();

    const collection = parseCollectionContent(post.content);
    if (!collection) return renderFallbackOg();

    // The cover resolver is the SSRF-hardened attachment path: only `pubky://`
    // file URIs (our own CDN) are ever fetched server-side. A legacy absolute
    // http(s) cover renders in-app but the OG card falls back to the muted,
    // cover-less background. FEED variant for card-size parity with the app.
    const [avatarSrc, coverSrc, tags] = await Promise.all([
      fetchImageAsDataUri(buildAvatarUrl(user)),
      fetchImageAsDataUri(resolvePostAttachmentUrl(collection.cover_image, FileVariant.FEED)),
      tagsPromise,
    ]);

    // Chips that fit the row's width budget, mirroring the app's tag row
    // (`getDisplayTags`): trailing chips are dropped rather than clipped.
    const visibleLabels = new Set(
      getDisplayTags(
        tags.map((tag) => tag.label),
        { maxTagLength: OG_TRUNCATE.collectionTag, maxTotalChars: TAG_CHAR_BUDGET, maxCount: MAX_COLLECTION_TAGS },
      ),
    );
    const displayTags = tags.filter((tag) => visibleLabels.has(tag.label));

    const name = resolveDisplayName(user);
    const itemCount = collection.items?.length ?? 0;
    const countLabel = `${compactNumber.format(itemCount)} ${itemCount === 1 ? 'POST' : 'POSTS'}`;
    const description = truncateByGraphemes(collection.description?.trim() ?? '', OG_TRUNCATE.collectionDescription);

    // The card collapses to fit whichever rows exist (like the app's
    // CollectionCard). Every row is fixed-height so the exact card box is
    // known up front: the cover layers below are absolutely positioned, and
    // satori only renders absolute children at explicit pixel dimensions (it
    // cannot stretch them to a content-sized parent).
    const rowHeights = [
      TITLE_ROW_HEIGHT,
      ...(description ? [DESCRIPTION_ROW_HEIGHT] : []),
      ...(displayTags.length > 0 ? [TAGS_ROW_HEIGHT] : []),
    ];
    const cardHeight =
      2 * CARD_PADDING + rowHeights.reduce((sum, h) => sum + h, 0) + CARD_ROW_GAP * (rowHeights.length - 1);

    return ogImageResponse(
      <OgFrame style={{ gap: 48 }}>
        <OgHeader avatarUrl={avatarSrc} name={name} />
        <div
          style={{
            display: 'flex',
            flex: 1,
            // Bottom-anchored per the Figma frame; every card height shares the
            // same bottom edge, 64px off the frame (matching the side/top pads).
            alignItems: 'flex-end',
            paddingLeft: 64,
            paddingRight: 64,
            paddingBottom: 64,
            width: '100%',
          }}
        >
          {/* Card shell: cover img + gradient render like the app card
              (object-cover, centered, behind the content). satori requires
              explicit pixel dimensions on the absolute layers — it cannot
              stretch them to a content-sized parent (and its background-size
              `cover` mis-computes nested elements' boxes) — hence the computed
              card height. Each layer rounds its own corners because the
              shell's rounded overflow clip does not reach absolute children. */}
          <div
            style={{
              display: 'flex',
              position: 'relative',
              width: '100%',
              height: cardHeight,
              borderRadius: CARD_RADIUS,
              overflow: 'hidden',
              backgroundColor: OG_TOKENS.avatarMuted,
            }}
          >
            {coverSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverSrc}
                  alt=""
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: CARD_WIDTH,
                    height: cardHeight,
                    borderRadius: CARD_RADIUS,
                    objectFit: 'cover',
                  }}
                />
                {/* Same darkening gradient as `CollectionCard` so text stays legible. */}
                <div
                  style={{
                    display: 'flex',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: CARD_WIDTH,
                    height: cardHeight,
                    borderRadius: CARD_RADIUS,
                    backgroundImage: 'linear-gradient(to right, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.35))',
                  }}
                />
              </>
            ) : null}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: CARD_ROW_GAP,
                padding: CARD_PADDING,
                width: '100%',
                height: '100%',
              }}
            >
              {/* Header row: library icon + name (left, grows) | count pill + owner avatar (right) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%', height: TITLE_ROW_HEIGHT }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                  <LibraryIcon size={40} />
                  <div
                    style={{
                      display: 'flex',
                      flex: 1,
                      minWidth: 0,
                      fontSize: 40,
                      fontWeight: 700,
                      color: OG_TOKENS.foreground,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {collection.name}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      height: 48,
                      borderRadius: 9999,
                      paddingLeft: 20,
                      paddingRight: 20,
                      // CollectionCountBadge's tone contract: bg-background on
                      // card-like chrome (covered), bg-card on the muted
                      // cover-less shell.
                      backgroundColor: coverSrc ? OG_TOKENS.background : OG_TOKENS.cardBg,
                    }}
                  >
                    <StickyNoteIcon size={24} color={OG_TOKENS.mutedForeground} />
                    <div
                      style={{
                        display: 'flex',
                        fontSize: 22,
                        fontWeight: 500,
                        letterSpacing: 2,
                        color: OG_TOKENS.mutedForeground,
                      }}
                    >
                      {countLabel}
                    </div>
                  </div>
                  <OgAvatar src={avatarSrc} size={48} />
                </div>
              </div>
              {description ? (
                <div
                  style={{
                    display: 'flex',
                    height: DESCRIPTION_ROW_HEIGHT,
                    fontSize: 32,
                    // Regular, not Medium — at OG scale 500 reads bolder than the
                    // app card's description.
                    fontWeight: 400,
                    color: OG_TOKENS.secondaryForeground,
                    lineHeight: `${DESCRIPTION_ROW_HEIGHT}px`,
                    // Single line, per the Figma card — also what keeps the row
                    // (and therefore the card) height deterministic.
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {description}
                </div>
              ) : null}
              {displayTags.length > 0 ? (
                // overflow hidden as a belt: if the char-budget heuristic ever
                // underestimates glyph widths, chips clip at the content box
                // instead of bleeding into the card padding.
                <div style={{ display: 'flex', gap: 16, height: TAGS_ROW_HEIGHT, overflow: 'hidden' }}>
                  {displayTags.map((tag) => (
                    <TagChip key={tag.label} label={tag.label} count={tag.taggers_count} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </OgFrame>,
    );
  } catch (error) {
    Logger.warn('[renderCollectionOg] Failed to render collection OG image', { userId, postId, error });
    return renderFallbackOg();
  }
}
