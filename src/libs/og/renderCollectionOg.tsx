import { Logger } from '@/libs/logger/logger';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { fetchUserAndPostForMetadata } from '@/libs/post/postMetadata';
import { truncateByGraphemes } from '@/libs/utils/truncate';
import { isPostDeleted, resolveDisplayName } from '@/libs/utils/utils';
import { FileVariant } from '@/services/nexus/file/file.types';
import { OG_HEADER_HEIGHT, OgAvatar, OgFrame, OgHeader } from './OgComponents';
import { OG_SIZE, OG_TOKENS, OG_TRUNCATE } from './ogConstants';
import { buildAvatarUrl, fetchImageAsDataUri, resolvePostAttachmentUrl } from './ogData';
import { LibraryIcon, StickyNoteIcon } from './OgIcons';
import { ogImageResponse } from './ogImageResponse';
import { renderFallbackOg } from './renderFallbackOg';

const FRAME_GAP = 48;
/**
 * The cover section fills the frame below the header edge-to-edge (the Figma
 * frame has no inset card). satori only renders absolute children at explicit
 * pixel dimensions — it cannot stretch them to a flex-sized parent — so the
 * section height is computed up front and shared with the cover layers.
 */
const COVER_HEIGHT = OG_SIZE.height - OG_HEADER_HEIGHT - FRAME_GAP;
const CONTENT_PADDING = 64;
const CONTENT_GAP = 32;
/** Count pill and owner avatar are both 80px tall and set the title row height. */
const TITLE_ROW_HEIGHT = 80;
const DESCRIPTION_LINE_HEIGHT = 72;

/**
 * Compact count for the posts pill, matching the app's `CollectionCountBadge`
 * notation so large collections keep the pill narrow.
 */
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact' });

/**
 * Renders the dynamic OG image for a collection, matching the Figma
 * "Collection Card 1200 x 630" frame: the standard post header (avatar + name
 * + brand mark) over a full-bleed cover section — cover image under a
 * card-toned gradient, library icon + name, posts-count pill, owner avatar,
 * and a two-line description.
 *
 * Reached from both the collections `opengraph-image` route and the
 * `renderPostOg` short-circuit for `kind === 'collection'` posts.
 * Non-collection posts (the collections URL can be probed with any post id),
 * deleted posts, and unparsable collections fall back to the default static
 * preview.
 */
export async function renderCollectionOg({ userId, postId }: { userId: string; postId: string }): Promise<Response> {
  try {
    const result = await fetchUserAndPostForMetadata(userId, postId);
    if (!result) return await renderFallbackOg();

    const { user, post } = result;
    // Kind gate: without it, any post whose content happens to parse as a
    // collection envelope would render a fabricated collection card here
    // (mirrors the page's generateMetadata and renderPostOg's positive check).
    if (post.kind !== 'collection') return await renderFallbackOg();
    if (isPostDeleted(post.content)) return await renderFallbackOg();

    const collection = parseCollectionContent(post.content);
    if (!collection) return await renderFallbackOg();

    // The cover resolver is the SSRF-hardened attachment path: only `pubky://`
    // file URIs (our own CDN) are ever fetched server-side. A legacy absolute
    // http(s) cover renders in-app but the OG section falls back to the muted,
    // cover-less background. FEED variant (720px WebP, ~8 KB) rather than MAIN,
    // like post attachments: the full-resolution original can run to megabytes
    // (over Next's 2 MB data-cache limit, so it would be re-downloaded and
    // decoded on every render) and social crawlers only wait a few seconds for
    // the card. The ~1.7x upscale into the cover box sits under the darkening
    // gradient below, which masks the softness. When Nexus has no usable FEED
    // variant (e.g. animated GIF uploads) the card renders cover-less rather
    // than falling back to the original.
    const [avatarSrc, coverSrc] = await Promise.all([
      fetchImageAsDataUri(buildAvatarUrl(user)),
      fetchImageAsDataUri(resolvePostAttachmentUrl(collection.cover_image, FileVariant.FEED)),
    ]);

    const name = resolveDisplayName(user);
    const itemCount = collection.items?.length ?? 0;
    const description = truncateByGraphemes(collection.description?.trim() ?? '', OG_TRUNCATE.collectionDescription);

    return await ogImageResponse(
      <OgFrame style={{ gap: FRAME_GAP }}>
        <OgHeader avatarUrl={avatarSrc} name={name} />
        {/* Cover section shell: muted backing, then cover img + gradient like
            the app card (object-cover, behind the content). Each absolute
            layer carries its own explicit pixel box (see COVER_HEIGHT);
            flexShrink 0 + overflow hidden keep the shell and those layers in
            lockstep even if the header geometry ever drifts. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden',
            width: '100%',
            height: COVER_HEIGHT,
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
                  width: OG_SIZE.width,
                  height: COVER_HEIGHT,
                  objectFit: 'cover',
                }}
              />
              {/* Card-toned darkening gradient from the Figma frame (#1d1d20 at
                  90% → 50%) so text stays legible over any cover. */}
              <div
                style={{
                  display: 'flex',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: OG_SIZE.width,
                  height: COVER_HEIGHT,
                  backgroundImage: 'linear-gradient(to right, rgba(29, 29, 32, 0.9), rgba(29, 29, 32, 0.5))',
                }}
              />
            </>
          ) : null}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: CONTENT_GAP,
              padding: CONTENT_PADDING,
              width: '100%',
              height: '100%',
            }}
          >
            {/* Title row: library icon + name (left, grows) | count pill + owner avatar (right) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%', height: TITLE_ROW_HEIGHT }}>
              <LibraryIcon size={64} />
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  minWidth: 0,
                  fontSize: 72,
                  fontWeight: 700,
                  color: OG_TOKENS.foreground,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {collection.name}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  height: TITLE_ROW_HEIGHT,
                  borderRadius: 9999,
                  paddingLeft: 32,
                  paddingRight: 32,
                  backgroundColor: OG_TOKENS.background,
                }}
              >
                <StickyNoteIcon size={48} />
                <div style={{ display: 'flex', fontSize: 48, fontWeight: 500, color: OG_TOKENS.foreground }}>
                  {compactNumber.format(itemCount)}
                </div>
              </div>
              <OgAvatar src={avatarSrc} size={80} />
            </div>
            {/* Fixed two-line slot (not maxHeight, not conditional): reserving
                the full description box keeps the title row anchored in the
                same position whether the description has zero, one, or two
                lines. Overflow hidden truncates anything beyond two lines
                (satori's line-clamp is unreliable, so the box is capped
                directly). */}
            <div
              style={{
                display: 'flex',
                height: 2 * DESCRIPTION_LINE_HEIGHT,
                fontSize: 60,
                fontWeight: 500,
                color: OG_TOKENS.secondaryForeground,
                lineHeight: `${DESCRIPTION_LINE_HEIGHT}px`,
                wordBreak: 'break-word',
                overflow: 'hidden',
              }}
            >
              {description}
            </div>
          </div>
        </div>
      </OgFrame>,
    );
  } catch (error) {
    Logger.warn('[renderCollectionOg] Failed to render collection OG image', { userId, postId, error });
    return await renderFallbackOg();
  }
}
