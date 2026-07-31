'use client';

import { Container } from '@/atoms/Container/Container';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { MentionPopover } from '@/molecules/MentionPopover/MentionPopover';
import type { QuickReplyContentProps } from './QuickReply.types';

interface QuickReplyComposerRowProps extends Pick<
  QuickReplyContentProps,
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
  textareaClassName?: string;
}

/** Textarea (+ mention popover) row shared by every QuickReply layout. */
export function QuickReplyComposerRow({
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
}: QuickReplyComposerRowProps) {
  return (
    <Container overrideDefaults className="relative">
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
        maxLength={POST_MAX_CHARACTER_LENGTH}
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
  );
}
