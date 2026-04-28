'use client';

import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { RemarkAnchorProps } from '@/molecules/PostText/PostText.types';
import { extractTextFromChildren } from '@/molecules/PostText/PostText.utils';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import { Identity } from '@/libs/identity/identity';
import { cn, formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';

export const PostMentions = (props: RemarkAnchorProps) => {
  const { href, children, className, node: _node, ref: _ref, ...rest } = props;

  const mentionText = extractTextFromChildren(children);
  const userId = Identity.extractPubkyPublicKey(mentionText);
  const { profile } = useUserProfile(userId ?? '');

  if (!userId) return null;

  const fallbackMention = formatPublicKey({
    key: withPubkyPrefix(userId),
  });
  const userName = profile?.name ?? fallbackMention;
  const finalMention = profile?.name ? `@${profile.name}` : fallbackMention;

  const linkContent = (
    <Atoms.Link
      {...rest}
      href={href || ''}
      onClick={(e) => e.stopPropagation()}
      className={cn(className, 'text-base', !profile?.name && 'uppercase')}
    >
      {finalMention}
    </Atoms.Link>
  );

  return (
    <Molecules.UserInfoPopover
      userId={userId}
      userName={userName}
      avatarUrl={profile?.avatarUrl}
      formattedPublicKey={fallbackMention}
    >
      {linkContent}
    </Molecules.UserInfoPopover>
  );
};
