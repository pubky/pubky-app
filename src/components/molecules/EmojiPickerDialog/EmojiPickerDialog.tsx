'use client';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription } from '@/atoms/Dialog/Dialog';
import { EmojiPicker } from '../EmojiPicker/EmojiPicker';
import { EmojiPickerProps } from '../EmojiPicker/EmojiPicker.types';

export interface EmojiPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmojiSelect: EmojiPickerProps['onEmojiSelect'];
  maxLength?: number;
  currentInput?: string;
}

export function EmojiPickerDialog({
  open,
  onOpenChange,
  onEmojiSelect,
  maxLength,
  currentInput,
}: EmojiPickerDialogProps) {
  const handleEmojiSelect = (emoji: { native: string }) => {
    onEmojiSelect(emoji);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm overflow-hidden p-0 outline-none sm:p-0"
        showCloseButton={false}
        hiddenTitle="Emoji Picker"
        // The dialog is portaled to <body>, but React synthetic events still
        // bubble up the React tree — so an emoji click would otherwise reach a
        // clickable/linked ancestor (e.g. a collection card's `Link`) and
        // trigger navigation. Stop clicks at the dialog content boundary.
        onClick={(e) => e.stopPropagation()}
        // Radix Dialog RemoveScroll intercepts wheel/touchmove before emoji-mart's
        // Shadow DOM scroller can use them, so scrolling fails until the picker is
        // clicked. Stop propagation at the dialog boundary (emoji-mart#752).
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <DialogDescription className="sr-only">Select an emoji</DialogDescription>
        <Container overrideDefaults={true} className="flex justify-center overflow-hidden">
          <Container overrideDefaults={true} className="w-full max-w-full overflow-hidden">
            <EmojiPicker onEmojiSelect={handleEmojiSelect} maxLength={maxLength} currentInput={currentInput} />
          </Container>
        </Container>
      </DialogContent>
    </Dialog>
  );
}
