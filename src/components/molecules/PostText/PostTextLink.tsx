'use client';

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { cn } from '@/libs/utils/utils';
import { INLINE_LINK_CLASSNAME } from './PostText.constants';
import type { RemarkAnchorProps } from './PostText.types';
import { extractTextFromChildren, getCompactUrl } from './PostText.utils';

interface PostTextLinkProps extends RemarkAnchorProps {
  compactUrl: boolean;
  onLinkClick?: (url: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Renders a link inside post or article content.
 *
 * A URL the author pasted raw is shown as its host alone, so a long address cannot
 * dominate the post. The full destination stays available three ways, none of which
 * this component has to implement itself: it is the anchor's accessible name, a
 * tooltip shows it on hover and on keyboard focus, and the browser's own long-press
 * menu — which additionally offers Copy Link and Open in New Tab — is left intact.
 *
 * Compacting a URL renders a tooltip, so this needs a `TooltipProvider` above it.
 * The app-wide one in `src/app/layout.tsx` covers every current caller.
 */
export function PostTextLink({
  children,
  className,
  compactUrl,
  onLinkClick,
  node: _node,
  ref: _ref,
  ...rest
}: PostTextLinkProps) {
  const compacted = compactUrl ? getCompactUrl(extractTextFromChildren(children), rest.href) : null;

  const link = (
    <a
      {...rest}
      target="_blank"
      rel="noopener noreferrer"
      // Set explicitly rather than left to the spread: the visible text is only a
      // host, so the accessible name has to carry the destination it stands for.
      aria-label={compacted ? compacted.fullUrl : rest['aria-label']}
      onClick={(event) => {
        event.stopPropagation();

        if (onLinkClick && rest.href) {
          onLinkClick(rest.href, event);
        }
      }}
      className={cn(className, INLINE_LINK_CLASSNAME)}
    >
      {compacted ? compacted.label : children}
    </a>
  );

  if (!compacted) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipPortal>
        {/*
          Hidden on touch, where the browser's own long-press menu already shows the
          full URL. It would otherwise flash open on every tap: Radix opens on focus,
          and on touch the focus lands after its pointer-down guard has been cleared.
        */}
        <TooltipContent className="bg-accent font-medium wrap-anywhere text-foreground pointer-coarse:hidden [&_svg]:fill-accent">
          {compacted.fullUrl}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
