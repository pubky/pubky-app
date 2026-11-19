'use client';

import { useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import { MESSAGE_MAX_LENGTH } from '@/config/messages';
import { cn } from '@/libs/utils/utils';

/** Show the remaining characters once a draft is this close to the limit. */
const COUNTER_THRESHOLD = 200;

export interface MessageComposerProps {
  disabled?: boolean;
  placeholder?: string;
  onSend: (content: string) => Promise<void>;
}

/** Message input: Enter sends, Shift+Enter adds a line. Keeps the draft if sending throws. */
export function MessageComposer({
  disabled = false,
  placeholder = 'Start a new message',
  onSend,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const trimmed = draft.trim();
  const remaining = MESSAGE_MAX_LENGTH - draft.length;
  const canSend = !disabled && !isSending && trimmed.length > 0 && remaining >= 0;

  const submit = async () => {
    if (!canSend) return;
    setIsSending(true);
    try {
      await onSend(trimmed);
      setDraft('');
    } catch {
      // The caller reports the failure; the draft stays so nothing is lost.
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Container overrideDefaults className="flex items-end gap-2 border-t border-border px-3 py-3">
      <Container overrideDefaults className="flex min-w-0 flex-1 flex-col rounded-3xl bg-secondary px-4 py-2">
        <Textarea
          variant="inline"
          data-testid="message-composer-input"
          aria-label="Message"
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="max-h-40 overflow-y-auto"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {remaining <= COUNTER_THRESHOLD && (
          <Typography
            as="span"
            size="xs"
            className={cn('self-end', remaining < 0 ? 'text-destructive' : 'text-muted-foreground')}
          >
            {remaining}
          </Typography>
        )}
      </Container>
      <Button
        variant="brand"
        size="icon"
        className="size-10"
        aria-label="Send"
        data-testid="message-composer-send"
        disabled={!canSend}
        onClick={() => void submit()}
      >
        <SendHorizontal className="size-5" />
      </Button>
    </Container>
  );
}
