import type { ReactNode } from 'react';
import { Logger } from '@/libs/logger/logger';
import { resolveMentionSegmentsForMetadata } from '@/libs/post/postMetadata';
import { resolveDisplayName } from '@/libs/utils/utils';
import { OgAvatar, OgFrame, OgText } from './OgComponents';
import { OG_TOKENS, OG_TRUNCATE } from './ogConstants';
import { buildAvatarUrl, fetchImageAsDataUri, fetchProfileForMetadata } from './ogData';
import { PubkyMark, StickyNoteIcon, UsersRoundIcon } from './OgIcons';
import { ogImageResponse } from './ogImageResponse';
import { prepareOgText, prepareOgTextSegments } from './ogText';
import { renderFallbackOg } from './renderFallbackOg';

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function Stat({ icon, value }: { icon: ReactNode; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      {icon}
      <div style={{ display: 'flex', fontSize: 48, fontWeight: 500, color: OG_TOKENS.foreground }}>
        {compactNumber.format(value)}
      </div>
    </div>
  );
}

/**
 * Renders the dynamic OG image for a profile: large avatar (brand-circle
 * fallback when missing), name, bio (clamped), and follower / post counts.
 */
export async function renderProfileOg({ pubky }: { pubky: string }): Promise<Response> {
  try {
    const result = await fetchProfileForMetadata(pubky);
    if (!result) return await renderFallbackOg();

    const { user, counts } = result;
    // Raw `pk:` / `pubky` mentions in the bio become brand-coloured display
    // names, as the app renders them. Resolved alongside the avatar: independent
    // round-trips.
    const [avatarSrc, bioSegments] = await Promise.all([
      fetchImageAsDataUri(buildAvatarUrl(user)),
      resolveMentionSegmentsForMetadata(user.bio ?? ''),
    ]);
    const name = prepareOgText(resolveDisplayName(user));
    const bio = prepareOgTextSegments(bioSegments, OG_TRUNCATE.bio);

    return await ogImageResponse(
      <OgFrame
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 64,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 48, width: '100%' }}>
          <OgAvatar src={avatarSrc} size={384} />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: 72,
                  fontWeight: 700,
                  color: OG_TOKENS.foreground,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {name}
              </div>
              {bio.length > 0 ? (
                <OgText
                  segments={bio}
                  style={{
                    overflow: 'hidden',
                    fontSize: 48,
                    fontWeight: 500,
                    color: OG_TOKENS.mutedForeground,
                    lineHeight: '60px',
                    wordBreak: 'break-word',
                    // Cap at three 60px lines (satori's line-clamp is a no-op here)
                    // so a long / URL bio can't push the stats row down.
                    maxHeight: 180,
                  }}
                />
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 48 }}>
              <Stat icon={<UsersRoundIcon size={48} />} value={counts.followers} />
              <Stat icon={<StickyNoteIcon size={48} />} value={counts.posts} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', position: 'absolute', bottom: 64, right: 64 }}>
          <PubkyMark size={80} />
        </div>
      </OgFrame>,
    );
  } catch (error) {
    Logger.warn('[renderProfileOg] Failed to render profile OG image', { pubky, error });
    return await renderFallbackOg();
  }
}
