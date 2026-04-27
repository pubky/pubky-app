import { JSX } from 'react';
import { RemarkAnchorProps } from '../PostText/PostText.types';
import { extractTextFromChildren } from '../PostText/PostText.utils';
import * as Libs from '@/libs';
import * as Atoms from '@/atoms';
import { Bitkit, Blocktank, BTCIcon, PubkyIcon, Synonym, Tether } from '@/icons';

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

  const hashtagText = extractTextFromChildren(children);

  const Icon = tagIcons[hashtagText.toLowerCase()] || null;

  return (
    <Atoms.Link
      {...rest}
      href={href || ''}
      onClick={(e) => e.stopPropagation()}
      className={Libs.cn(className, 'inline-flex items-center gap-x-1 text-base')}
    >
      {children} {Icon}
    </Atoms.Link>
  );
};
