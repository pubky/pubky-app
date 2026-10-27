'use client';

import { JSX } from 'react';
import { Link } from '@/atoms/Link/Link';
import { Bitkit, Blocktank, BTCIcon, PubkyIcon, Synonym, Tether } from '@/icons';
import { cn } from '@/libs/utils/utils';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { RemarkAnchorProps } from '../PostText/PostText.types';
import { extractTextFromChildren } from '../PostText/PostText.utils';

type TagIcons = {
  [key: string]: JSX.Element | undefined;
};

const tagIcons: TagIcons = {
  '#synonym': <Synonym size={24} />,
  '#tether': <Tether size={24} />,
  '#pubky': <PubkyIcon size={22} />,
  '#bitkit': <Bitkit size={24} />,
  '#blocktank': <Blocktank size={24} />,
  '#bitcoin': <BTCIcon size={24} />,
};

export const PostHashtags = (props: RemarkAnchorProps) => {
  const { href, children, className, node: _node, ref: _ref, ...rest } = props;
  const navigable = useIsPostPreviewNavigable();

  const hashtagText = extractTextFromChildren(children);

  const Icon = tagIcons[hashtagText.toLowerCase()] || null;
  const hashtagClassName = cn(className, 'inline-flex items-center gap-x-1 text-base');

  // Quoted post in the Reply/Repost dialogs: keep the hashtag styling but render
  // text, so a tap cannot change the route behind the open modal.
  if (!navigable) {
    return (
      <span data-type={rest['data-type']} className={cn(hashtagClassName, 'text-brand')}>
        {children} {Icon}
      </span>
    );
  }

  return (
    <Link {...rest} href={href || ''} onClick={(e) => e.stopPropagation()} className={hashtagClassName}>
      {children} {Icon}
    </Link>
  );
};
