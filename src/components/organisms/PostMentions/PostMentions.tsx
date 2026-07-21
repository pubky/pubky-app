'use client';

import { getUserProfileUrl } from '@/app/routes';
import { Link } from '@/atoms/Link/Link';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { Identity } from '@/libs/identity/identity';
import { cn, formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
import { RemarkAnchorProps } from '@/molecules/PostText/PostText.types';
import { extractTextFromChildren } from '@/molecules/PostText/PostText.utils';
import { UserInfoPopover } from '@/molecules/UserInfoPopover/UserInfoPopover';
import { useAuthStore } from '@/stores/auth/auth.store';

export const PostMentions = (props: RemarkAnchorProps) => {
  const { href: _href, children, className, node: _node, ref: _ref, ...rest } = props;

  const mentionText = extractTextFromChildren(children);
  const userId = Identity.extractPubkyPublicKey(mentionText);
  const { profile } = useUserProfile(userId ?? '');
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Resolve self-mentions to the canonical own-profile route instead of /profile/{ownPubky}.
  const profileUrl = getUserProfileUrl(userId ?? '', currentUserPubky);

  if (!userId) return null;

  const fallbackMention = formatPublicKey({
    key: withPubkyPrefix(userId),
  });
  const userName = profile?.name ?? fallbackMention;
  const finalMention = profile?.name ? `@${profile.name}` : fallbackMention;

  const linkContent = (
    <Link
      {...rest}
      href={profileUrl}
      onClick={(e) => e.stopPropagation()}
      className={cn(className, 'text-base', !profile?.name && 'uppercase')}
    >
      {finalMention}
    </Link>
  );

  return (
    <UserInfoPopover
      userId={userId}
      userName={userName}
      avatarUrl={profile?.avatarUrl}
      formattedPublicKey={fallbackMention}
    >
      {linkContent}
    </UserInfoPopover>
  );
};
