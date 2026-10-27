'use client';

import { getUserProfileUrl } from '@/app/routes';
import { Link } from '@/atoms/Link/Link';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { Identity } from '@/libs/identity/identity';
import { cn, formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
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
  const navigable = useIsPostPreviewNavigable();
  // Resolve self-mentions to the canonical own-profile route instead of /profile/{ownPubky}.
  const profileUrl = getUserProfileUrl(userId ?? '', currentUserPubky);

  if (!userId) return null;

  const fallbackMention = formatPublicKey({
    key: withPubkyPrefix(userId),
  });
  const userName = profile?.name ?? fallbackMention;
  const finalMention = profile?.name ? `@${profile.name}` : fallbackMention;
  const mentionClassName = cn(className, 'text-base', !profile?.name && 'uppercase');

  // Quoted post in the Reply/Repost dialogs: the mention is text, without the
  // profile link or the popover, whose links would also land behind the open modal.
  if (!navigable) {
    return (
      <span data-type={rest['data-type']} className={cn(mentionClassName, 'text-brand')}>
        {finalMention}
      </span>
    );
  }

  const linkContent = (
    <Link {...rest} href={profileUrl} onClick={(e) => e.stopPropagation()} className={mentionClassName}>
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
