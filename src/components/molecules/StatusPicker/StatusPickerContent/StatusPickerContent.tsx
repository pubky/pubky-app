'use client';

import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Config from '@/config';
import * as Types from './index';
import { Check, Smile } from 'lucide-react';
import { parseStatus } from '@/libs/status/status';
import { cn } from '@/libs/utils/utils';

export function StatusPickerContent({ onStatusSelect, currentStatus }: Types.StatusPickerContentProps) {
  const t = useTranslations('status');
  const [customStatus, setCustomStatus] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse current status to extract emoji and text if it's custom
  const parsed = parseStatus(currentStatus || '');
  const isCustomStatus = parsed.isCustom;

  // Initialize custom status state from current status if it's custom
  useEffect(() => {
    if (isCustomStatus) {
      setCustomStatus(parsed.text);
      setSelectedEmoji(parsed.emoji);
    } else {
      setCustomStatus('');
      setSelectedEmoji('');
    }
  }, [currentStatus, isCustomStatus, parsed.emoji, parsed.text]);
  const handlePredefinedStatusClick = (statusValue: string) => {
    onStatusSelect(statusValue);
    setCustomStatus('');
    setSelectedEmoji('');
  };
  const isValidCustomStatus = () => {
    return Boolean(customStatus.trim());
  };
  const handleCustomStatusSave = () => {
    if (isValidCustomStatus()) {
      // If emoji is selected, prepend it; otherwise just use text
      const statusValue = selectedEmoji ? `${selectedEmoji}${customStatus.trim()}` : customStatus.trim();
      onStatusSelect(statusValue);
      setCustomStatus('');
      setSelectedEmoji('');
    }
  };
  const handleEmojiSelect = (emoji: { native: string }) => {
    setSelectedEmoji(emoji.native);
    setShowEmojiPicker(false);
    // Refocus the input after emoji is selected so Enter key works
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };
  const handleKeyDown = useEnterSubmit(isValidCustomStatus, handleCustomStatusSave);
  return (
    <Atoms.Container className="gap-2">
      {/* Predefined status options */}
      {Types.STATUS_OPTIONS.map((option) => {
        const isSelected = !isCustomStatus && currentStatus === option.value;
        return (
          <Atoms.Button
            key={option.value}
            overrideDefaults={true}
            onClick={() => handlePredefinedStatusClick(option.value)}
            className={cn('w-full justify-between gap-2 p-0', 'inline-flex cursor-pointer items-center', 'group')}
          >
            <Atoms.Container overrideDefaults className="flex items-center gap-2">
              <span>{option.emoji}</span>
              <Atoms.Typography
                as="span"
                className={cn(
                  'text-base leading-6 font-medium transition-colors',
                  isSelected ? 'text-popover-foreground' : 'text-muted-foreground group-hover:text-popover-foreground',
                )}
              >
                {t(option.value as Parameters<typeof t>[0])}
              </Atoms.Typography>
            </Atoms.Container>
            {isSelected && <Check className="size-5 text-popover-foreground" />}
          </Atoms.Button>
        );
      })}

      {/* Custom Status Section */}
      <Atoms.Container className="gap-2.5 pt-1 pb-0">
        <Atoms.Label className="text-xs leading-5 tracking-[1.2px] text-muted-foreground uppercase">
          {t('customStatus')}
        </Atoms.Label>
        <Atoms.Container className="gap-3">
          <Atoms.Container
            overrideDefaults={true}
            className="flex items-center gap-2 rounded-md border border-dashed border-input bg-background/10 px-5 py-4 shadow-sm focus-within:border-white/80"
          >
            {selectedEmoji ? (
              <Atoms.Button
                overrideDefaults={true}
                onClick={() => setShowEmojiPicker(true)}
                className={cn(
                  'size-9 shrink-0 rounded-full bg-secondary p-1',
                  'inline-flex cursor-pointer items-center justify-center',
                  'hover:bg-secondary/80',
                )}
                aria-label="Change emoji"
              >
                <span className="text-2xl leading-none">{selectedEmoji}</span>
              </Atoms.Button>
            ) : (
              <Atoms.Button
                overrideDefaults={true}
                onClick={() => setShowEmojiPicker(true)}
                className={cn(
                  'size-9 shrink-0 rounded-full bg-secondary p-1',
                  'inline-flex cursor-pointer items-center justify-center',
                  'hover:bg-secondary/80',
                )}
                aria-label="Open emoji picker"
              >
                <Smile className="size-5" strokeWidth={2} />
              </Atoms.Button>
            )}
            <Atoms.Input
              ref={inputRef}
              type="text"
              value={customStatus}
              placeholder={t('addStatus')}
              maxLength={Config.USER_STATUS_MAX_LENGTH}
              onChange={(e) => setCustomStatus(e.target.value)}
              onKeyDown={handleKeyDown}
              className={cn(
                'flex-1 bg-transparent text-base leading-6 font-medium caret-white outline-none',
                'border-none shadow-none ring-0 hover:outline-none focus:ring-0 focus:ring-offset-0 focus:outline-none',
                'min-h-6 p-0',
                'placeholder:font-medium placeholder:text-input',
                customStatus ? 'text-foreground' : 'text-input',
              )}
            />
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Container>

      {/* Emoji Picker Dialog */}
      <Molecules.EmojiPickerDialog
        open={showEmojiPicker}
        onOpenChange={setShowEmojiPicker}
        onEmojiSelect={handleEmojiSelect}
      />
    </Atoms.Container>
  );
}
