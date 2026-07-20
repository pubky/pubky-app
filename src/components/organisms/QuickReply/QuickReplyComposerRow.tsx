'use client';

import * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { MentionPopover } from '@/molecules/MentionPopover/MentionPopover';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import type { QuickReplyContentProps } from './QuickReply.types';

interface QuickReplyComposerRowProps extends Pick<
  QuickReplyContentProps,
  | 'avatarUrl'
  | 'userName'
  | 'avatarFallbackSeed'
  | 'textareaRef'
  | 'content'
  | 'displayPlaceholder'
  | 'isSubmitting'
  | 'isAuthenticated'
  | 'onChange'
  | 'onFocus'
  | 'onKeyDown'
  | 'onPaste'
  | 'mentionIsOpen'
  | 'mentionUsers'
  | 'mentionSelectedIndex'
  | 'onMentionSelect'
  | 'onMentionHover'
> {
  avatarSize: React.ComponentProps<typeof AvatarWithFallback>['size'];
  textareaClassName?: string;
  /** Optional content rendered at the end of the row (used by the list layout for inline actions) */
  trailing?: React.ReactNode;
}

/** Avatar + textarea (+ mention popover) row shared by every QuickReply layout. */
export function QuickReplyComposerRow({
  avatarUrl,
  userName,
  avatarFallbackSeed,
  avatarSize,
  textareaRef,
  textareaClassName,
  content,
  displayPlaceholder,
  isSubmitting,
  isAuthenticated,
  onChange,
  onFocus,
  onKeyDown,
  onPaste,
  mentionIsOpen,
  mentionUsers,
  mentionSelectedIndex,
  onMentionSelect,
  onMentionHover,
  trailing,
}: QuickReplyComposerRowProps) {
  return (
    <Container className="flex items-center gap-4" overrideDefaults>
      <AvatarWithFallback avatarUrl={avatarUrl} name={userName} fallbackSeed={avatarFallbackSeed} size={avatarSize} />

      <Container overrideDefaults className="relative flex-1">
        <Textarea
          ref={textareaRef}
          aria-label="Reply"
          placeholder={displayPlaceholder}
          variant="inline"
          className={textareaClassName}
          value={content}
          onChange={onChange}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          disabled={isSubmitting}
          readOnly={!isAuthenticated}
          data-testid="quick-reply-textarea"
          aria-haspopup="listbox"
        />

        {mentionIsOpen && (
          <MentionPopover
            users={mentionUsers}
            selectedIndex={mentionSelectedIndex}
            onSelect={onMentionSelect}
            onHover={onMentionHover}
          />
        )}
      </Container>

      {trailing}
    </Container>
  );
}
