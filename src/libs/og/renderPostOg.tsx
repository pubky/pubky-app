import { Logger } from '@/libs/logger/logger';
import { parseArticleContent } from '@/libs/post/articleContent';
import { markdownToText } from '@/libs/post/markdownToText';
import { fetchUserAndPostForMetadata } from '@/libs/post/postMetadata';
import { deriveTextPreview } from '@/libs/post/postPreview';
import { truncateByGraphemes } from '@/libs/utils/truncate';
import { isPostDeleted, resolveDisplayName } from '@/libs/utils/utils';
import { FileVariant } from '@/services/nexus/file/file.types';
import { OgFrame, OgHeader } from './OgComponents';
import { OG_TOKENS, OG_TRUNCATE } from './ogConstants';
import { buildAvatarUrl, fetchImageAsDataUri, resolvePostAttachmentUrl } from './ogData';
import { NewspaperIcon } from './OgIcons';
import { ogImageResponse } from './ogImageResponse';
import { renderCollectionOg } from './renderCollectionOg';
import { renderFallbackOg } from './renderFallbackOg';

/**
 * Renders the dynamic OG image for a post.
 *
 * - `kind === 'collection'` short-circuits to the collection image so crawlers
 *   hitting the post OG URL still get a correct card (the human page 308-redirects
 *   separately).
 * - `kind === 'long'` (article) renders the article variant: newspaper icon +
 *   title, with a plain-text excerpt of the (Markdown) body.
 * - `kind === 'image'` with a resolvable attachment renders the image variant;
 *   otherwise the text variant.
 */
export async function renderPostOg({ userId, postId }: { userId: string; postId: string }): Promise<Response> {
  try {
    const result = await fetchUserAndPostForMetadata(userId, postId);
    if (!result) return renderFallbackOg();

    const { user, post } = result;
    if (post.kind === 'collection') return renderCollectionOg({ userId, postId });

    const avatarSrc = await fetchImageAsDataUri(buildAvatarUrl(user));
    const name = resolveDisplayName(user);
    const isDeleted = isPostDeleted(post.content);
    const preview = deriveTextPreview({ content: post.content, kind: post.kind });

    // Article variant: newspaper icon + title over a plain-text body excerpt.
    // Deleted posts skip this (their content isn't JSON) and fall through to the
    // text variant, which renders the "deleted" notice.
    const article = !isDeleted && post.kind === 'long' ? parseArticleContent(post.content) : null;
    if (article) {
      const body = truncateByGraphemes(markdownToText(article.body), OG_TRUNCATE.articleBody);
      return ogImageResponse(
        <OgFrame style={{ gap: 48 }}>
          <OgHeader avatarUrl={avatarSrc} name={name} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              justifyContent: 'center',
              gap: 16,
              paddingLeft: 64,
              paddingRight: 64,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%' }}>
              <NewspaperIcon size={64} />
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
                {article.title}
              </div>
            </div>
            {body ? (
              <div
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                  // Hard cap at two 60px lines so an unclamped 3rd line can't
                  // bleed into the footer (satori's line-clamp is not reliable).
                  maxHeight: 120,
                  fontSize: 48,
                  fontWeight: 500,
                  color: OG_TOKENS.mutedForeground,
                  lineHeight: '60px',
                  wordBreak: 'break-word',
                }}
              >
                {body}
              </div>
            ) : null}
          </div>
          {/* Brand URL anchored bottom-right per the Figma frames. */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              paddingLeft: 64,
              paddingRight: 64,
              paddingTop: 32,
              paddingBottom: 64,
            }}
          >
            <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: OG_TOKENS.brand }}>pubky.app</div>
          </div>
        </OgFrame>,
      );
    }

    // Feed variant is sufficient — the image only ever renders in this small
    // preview card, so the full-res MAIN variant would be wasted bytes.
    const imageUrl =
      !isDeleted && post.kind === 'image' ? resolvePostAttachmentUrl(post.attachments?.[0], FileVariant.FEED) : null;
    const imageSrc = imageUrl ? await fetchImageAsDataUri(imageUrl) : null;

    if (imageSrc) {
      const text = truncateByGraphemes(preview, OG_TRUNCATE.postImageText);
      return ogImageResponse(
        <OgFrame style={{ gap: 48 }}>
          <OgHeader avatarUrl={avatarSrc} name={name} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              gap: 48,
              paddingLeft: 64,
              paddingRight: 64,
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 48,
                fontWeight: 500,
                color: OG_TOKENS.secondaryForeground,
                lineHeight: '60px',
                wordBreak: 'break-word',
                // Two 60px lines above the image, matching the design (satori's
                // line-clamp is a no-op here, so height is capped directly).
                maxHeight: 120,
                overflow: 'hidden',
              }}
            >
              {text}
            </div>
            <div style={{ display: 'flex', flex: 1, width: '100%', borderRadius: 24, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
        </OgFrame>,
      );
    }

    const text = truncateByGraphemes(preview, OG_TRUNCATE.postText);
    return ogImageResponse(
      <OgFrame style={{ gap: 48 }}>
        <OgHeader avatarUrl={avatarSrc} name={name} />
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            paddingLeft: 64,
            paddingRight: 64,
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 60,
              fontWeight: 500,
              color: OG_TOKENS.secondaryForeground,
              lineHeight: '72px',
              wordBreak: 'break-word',
              // Cap at three 72px lines so a long post stays centered within the
              // content area instead of bleeding into the header / footer gaps.
              // (satori's -webkit-line-clamp does not work in this @vercel/og build.)
              maxHeight: 216,
              overflow: 'hidden',
            }}
          >
            {text}
          </div>
        </div>
        {/* Brand URL anchored bottom-right per the Figma frames. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingLeft: 64,
            paddingRight: 64,
            paddingTop: 32,
            paddingBottom: 64,
          }}
        >
          <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: OG_TOKENS.brand }}>pubky.app</div>
        </div>
      </OgFrame>,
    );
  } catch (error) {
    Logger.warn('[renderPostOg] Failed to render post OG image', { userId, postId, error });
    return renderFallbackOg();
  }
}
