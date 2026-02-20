'use client';

import { RemarkAnchorProps } from '@/molecules/PostText/PostText.types';
import { extractTextFromChildren } from '@/molecules/PostText/PostText.utils';
import * as Libs from '@/libs';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';

export const PostMentions = (props: RemarkAnchorProps) => {
  const { href, children, className, node: _node, ref: _ref, ...rest } = props;

  const mentionText = extractTextFromChildren(children);
  const userId = Libs.Identity.extractPubkyPublicKey(mentionText);
  const { profile } = Hooks.useUserProfile(userId ?? '');

  if (!userId) return null;

  const fallbackMention = Libs.formatPublicKey({
    key: Libs.withPubkyPrefix(userId),
  });
  const userName = profile?.name ?? fallbackMention;
  const finalMention = profile?.name ? `@${profile.name}` : fallbackMention;

  const linkContent = (
    <Atoms.Link
      {...rest}
      href={href || ''}
      onClick={(e) => e.stopPropagation()}
      className={Libs.cn(className, 'text-base', !profile?.name && 'uppercase')}
    >
      {finalMention}
    </Atoms.Link>
  );

  return (
    <Molecules.PostHeaderUserInfoPopoverWrapper
      userId={userId}
      userName={userName}
      avatarUrl={profile?.avatarUrl}
      formattedPublicKey={fallbackMention}
    >
      {linkContent}
    </Molecules.PostHeaderUserInfoPopoverWrapper>
  );
};
