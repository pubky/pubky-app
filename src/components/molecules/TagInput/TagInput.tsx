'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Icons from '@/libs/icons';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';
import { mergeTagSuggestions, TAG_INPUT_BLUR_DELAY_MS } from '@/hooks/useTagInput';
import { TAG_MAX_LENGTH } from '@/config';
import type { TagInputProps } from './TagInput.types';
import { TagSuggestionsDropdown } from './TagSuggestionsDropdown';

export function TagInput({
  onTagAdd,
  placeholder,
  existingTags = [],
  viewerTags,
  showCloseButton = false,
  onClose,
  disabled = false,
  maxTags,
  currentTagsCount = 0,
  limitReachedPlaceholder,
  onBlur,
  onClick,
  enableApiSuggestions = false,
  excludeFromApiSuggestions = [],
  addOnSuggestionClick = false,
  autoFocus = false,
  className,
}: TagInputProps) {
  const t = useTranslations('post');
  const defaultPlaceholder = placeholder ?? t('addTag');
  const defaultLimitReachedPlaceholder = limitReachedPlaceholder ?? t('limitReached');
  const containerRef = useRef<HTMLDivElement>(null);

  // Combine exclusions for API suggestions
  const existingTagLabels = existingTags.map((tag) => tag.label);
  const apiExcludeTags = [...new Set([...excludeFromApiSuggestions, ...existingTagLabels])];

  const isAtLimit = maxTags !== undefined && currentTagsCount >= maxTags;
  const isDisabled = disabled || isAtLimit;

  // Use viewerTags for duplicate checking, fallback to existingTags
  const tagsForDuplicateCheck = viewerTags ?? existingTags;

  const {
    inputValue,
    setInputValue,
    inputRef,
    showEmojiPicker,
    setShowEmojiPicker,
    showSuggestions,
    setShowSuggestions,
    suggestions,
    handleInputChange,
    handleInputFocus,
    handleTagSubmit,
    handleEmojiSelect,
    handlePaste,
  } = Hooks.useTagInput({
    onTagAdd,
    existingTags: tagsForDuplicateCheck.map((t) => t.label),
    allTags: existingTags,
  });

  // Fetch API suggestions when enabled
  const { suggestions: apiSuggestions } = Hooks.useTagSuggestions({
    query: inputValue,
    excludeTags: apiExcludeTags,
    enabled: enableApiSuggestions && showSuggestions,
  });

  const displaySuggestions = mergeTagSuggestions(suggestions, apiSuggestions, enableApiSuggestions);
  const isListboxOpen = showSuggestions && displaySuggestions.length > 0;

  const {
    selectedIndex: selectedSuggestionIndex,
    setSelectedIndex: setSelectedSuggestionIndex,
    handleKeyDown: handleListboxKeyDown,
    resetSelection,
  } = Hooks.useListboxNavigation({
    items: displaySuggestions,
    isOpen: isListboxOpen,
    onSelect: (item) => {
      selectSuggestion(item.label);
    },
    onClose: () => {
      setShowSuggestions(false);
    },
  });

  const handleInputBlur = () => {
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        if (!inputValue && !showEmojiPicker && onBlur) {
          onBlur();
        }
      }
    }, TAG_INPUT_BLUR_DELAY_MS);
  };

  const handleEmojiPickerClose = (open: boolean) => {
    setShowEmojiPicker(open);
    if (!open) {
      inputRef.current?.focus();
    }
  };

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const selectSuggestion = (label: string) => {
    const normalizedLabel = label.toLowerCase();

    if (addOnSuggestionClick) {
      const isDuplicate = tagsForDuplicateCheck.some((tag) => tag.label.toLowerCase() === normalizedLabel);
      if (!isDuplicate) {
        onTagAdd(normalizedLabel);
      }
      setInputValue('');
    } else {
      setInputValue(normalizedLabel);
    }
    setShowSuggestions(false);
    resetSelection();
    inputRef.current?.focus();
  };

  const handleMergedSuggestionsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const handledByListbox = handleListboxKeyDown(e);
    if (handledByListbox) {
      return;
    }

    // Preserve default tag submit behavior when no suggestion is selected.
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      handleTagSubmit();
    }
  };

  const displayPlaceholder = isAtLimit ? defaultLimitReachedPlaceholder : defaultPlaceholder;

  return (
    <>
      <Atoms.Popover open={isListboxOpen}>
        <Atoms.PopoverAnchor asChild>
          <Atoms.Container
            ref={containerRef}
            overrideDefaults={true}
            className={Libs.cn(
              'relative flex h-8 w-full items-center gap-1 rounded-md border border-dashed border-input pr-1 pl-3 shadow-sm',
              onClick && 'cursor-pointer',
              className,
            )}
            onClick={onClick}
          >
            <Atoms.Input
              data-cy="add-tag-input"
              ref={inputRef}
              type="text"
              value={inputValue}
              placeholder={displayPlaceholder}
              onChange={handleInputChange}
              onKeyDown={handleMergedSuggestionsKeyDown}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onPaste={handlePaste}
              disabled={isDisabled}
              maxLength={TAG_MAX_LENGTH}
              autoFocus={autoFocus}
              className={Libs.cn(
                'flex-1 bg-transparent p-0 text-sm leading-5 font-bold caret-white',
                'border-none shadow-none ring-0 outline-none hover:outline-none focus:ring-0 focus:ring-offset-0 focus:outline-none',
                'placeholder:font-bold',
                isAtLimit ? 'placeholder:text-destructive' : 'placeholder:text-input',
                inputValue ? 'text-foreground' : 'text-input',
                isDisabled && onClick && 'pointer-events-none',
              )}
            />

            <Atoms.Button
              overrideDefaults={true}
              onMouseDown={preventBlur}
              onClick={() => setShowEmojiPicker(true)}
              className={Libs.cn(
                'shadow-xs-dark hover:shadow-xs-dark inline-flex size-5 cursor-pointer items-center justify-center rounded-full p-1',
                isDisabled && onClick && 'pointer-events-none',
              )}
              aria-label="Open emoji picker"
              disabled={isDisabled}
            >
              <Icons.Smile className="size-4" strokeWidth={2} />
            </Atoms.Button>

            {showCloseButton && (
              <Atoms.Button
                overrideDefaults={true}
                onMouseDown={preventBlur}
                onClick={onClose}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full p-1 hover:opacity-80"
                aria-label="Close tag input"
              >
                <Icons.X className="size-3" strokeWidth={2} />
              </Atoms.Button>
            )}
          </Atoms.Container>
        </Atoms.PopoverAnchor>

        {isListboxOpen && (
          /**
           * PopoverContent event handlers explanation:
           *
           * We use PopoverAnchor (not PopoverTrigger) because we need the popover
           * to be controlled by our `isListboxOpen` state, not by Radix's built-in
           * toggle behavior. However, Radix Popover still tries to manage focus
           * and close on outside interactions by default.
           *
           * These preventDefault handlers disable Radix's automatic behaviors:
           * - onOpenAutoFocus: Prevents focus from moving to popover content (keeps focus on input)
           * - onCloseAutoFocus: Prevents focus restoration that would blur our input
           * - onFocusOutside: Prevents closing when focus leaves popover (we handle this in handleInputBlur)
           * - onInteractOutside: Prevents closing on outside clicks (we handle this ourselves)
           *
           * This allows the input to remain focused while the user interacts with suggestions,
           * and ensures the popover only closes when we explicitly set isListboxOpen to false.
           */
          <Atoms.PopoverContent
            align="start"
            side="bottom"
            sideOffset={1}
            avoidCollisions={false}
            className="z-50 mx-0 w-32 border-none bg-transparent p-0 shadow-none"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onFocusOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <TagSuggestionsDropdown
              suggestions={displaySuggestions}
              selectedIndex={selectedSuggestionIndex}
              onSelect={selectSuggestion}
              onSelectIndexChange={setSelectedSuggestionIndex}
              onMouseDown={preventBlur}
            />
          </Atoms.PopoverContent>
        )}
      </Atoms.Popover>

      <Molecules.EmojiPickerDialog
        open={showEmojiPicker && !disabled}
        onOpenChange={handleEmojiPickerClose}
        onEmojiSelect={handleEmojiSelect}
        currentInput={inputValue}
      />
    </>
  );
}
