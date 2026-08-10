'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Smile, X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { Popover, PopoverAnchor, PopoverContent } from '@/atoms/Popover/Popover';
import { TAG_MAX_LENGTH } from '@/config/posts';
import { useListboxNavigation } from '@/hooks/useListboxNavigation/useListboxNavigation';
import { useTagInput } from '@/hooks/useTagInput/useTagInput';
import { TAG_INPUT_BLUR_DELAY_MS } from '@/hooks/useTagInput/useTagInput.constants';
import { mergeTagSuggestions } from '@/hooks/useTagInput/useTagInput.utils';
import { useTagSuggestions } from '@/hooks/useTagSuggestions/useTagSuggestions';
import { cn } from '@/libs/utils/utils';
import { EmojiPickerDialog } from '../EmojiPickerDialog/EmojiPickerDialog';
import type { TagInputHandle, TagInputProps } from './TagInput.types';
import { TagSuggestionsDropdown } from './TagSuggestionsDropdown/TagSuggestionsDropdown';

export const TagInput = forwardRef<TagInputHandle, TagInputProps>(function TagInput(
  {
    onTagAdd,
    placeholder,
    existingTags = [],
    viewerTags,
    showCloseButton = false,
    showEmojiButton = true,
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
    containerVariant = 'dashed',
    className,
    inputClassName,
    style,
  },
  ref,
) {
  const defaultPlaceholder = placeholder ?? 'add tag';
  const defaultLimitReachedPlaceholder = limitReachedPlaceholder ?? 'limit reached';
  const containerRef = useRef<HTMLDivElement>(null);

  // Combine exclusions for API suggestions
  const existingTagLabels = existingTags.map((tag) => tag.label);
  const apiExcludeTags = [...new Set([...excludeFromApiSuggestions, ...existingTagLabels])];
  const isAtLimit = maxTags !== undefined && currentTagsCount >= maxTags;
  const isDisabled = disabled || isAtLimit;
  const isDashedVariant = containerVariant === 'dashed';

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
  } = useTagInput({
    onTagAdd,
    existingTags: tagsForDuplicateCheck.map((t) => t.label),
    allTags: existingTags,
  });
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  // Fetch API suggestions when enabled
  const { suggestions: apiSuggestions } = useTagSuggestions({
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
  } = useListboxNavigation({
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
      <Popover open={isListboxOpen}>
        <PopoverAnchor asChild>
          <Container
            ref={containerRef}
            overrideDefaults={true}
            className={cn(
              'relative flex h-8 w-full items-center gap-1 rounded-md pr-1 pl-3',
              isDashedVariant && 'border border-dashed border-input shadow-sm transition-all duration-300',
              onClick && 'cursor-pointer',
              className,
            )}
            style={style}
            // Adding / typing a tag is the only intent here — never navigation.
            // Suppress the native default + propagation (focus still happens on
            // mousedown, so this is safe) so the input works inside a clickable /
            // linked surface without bubbling into navigation. `cursor-pointer`
            // stays keyed on the caller `onClick` so standalone styling is intact.
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClick?.(e);
            }}
          >
            <Input
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
              className={cn(
                '-mt-0.5 h-full flex-1 bg-transparent p-0 text-sm leading-8 font-bold caret-white',
                'border-none shadow-none ring-0 outline-none hover:outline-none focus:ring-0 focus:ring-offset-0 focus:outline-none',
                'placeholder:font-bold',
                isAtLimit ? 'placeholder:text-destructive disabled:opacity-100' : 'placeholder:text-input',
                inputValue ? 'text-foreground' : 'text-input',
                isDisabled && onClick && 'pointer-events-none',
                inputClassName,
              )}
            />

            {showEmojiButton && (
              <Button
                overrideDefaults={true}
                onMouseDown={preventBlur}
                onClick={() => setShowEmojiPicker(true)}
                className={cn(
                  'inline-flex size-5 cursor-pointer items-center justify-center rounded-full p-1',
                  isDashedVariant && 'shadow-xs-dark hover:shadow-xs-dark',
                  isDisabled && onClick && 'pointer-events-none',
                )}
                aria-label="Open emoji picker"
                disabled={isDisabled}
              >
                <Smile className="size-4" strokeWidth={2} />
              </Button>
            )}

            {showCloseButton && (
              <Button
                overrideDefaults={true}
                onMouseDown={preventBlur}
                onClick={onClose}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full p-1 hover:opacity-80"
                aria-label="Close tag input"
              >
                <X className="size-3" strokeWidth={2} />
              </Button>
            )}
          </Container>
        </PopoverAnchor>

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
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={1}
            avoidCollisions={false}
            className="z-50 mx-0 w-48 border-none bg-transparent p-0 shadow-none"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onFocusOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            // Portaled to <body>, but React events bubble up the React tree, so
            // a suggestion click would otherwise reach a clickable/linked
            // ancestor (e.g. a collection card's `Link`) and navigate. Keep
            // clicks contained to the dropdown.
            onClick={(e) => e.stopPropagation()}
          >
            <TagSuggestionsDropdown
              suggestions={displaySuggestions}
              selectedIndex={selectedSuggestionIndex}
              onSelect={selectSuggestion}
              onSelectIndexChange={setSelectedSuggestionIndex}
              onMouseDown={preventBlur}
            />
          </PopoverContent>
        )}
      </Popover>

      <EmojiPickerDialog
        open={showEmojiPicker && !disabled}
        onOpenChange={handleEmojiPickerClose}
        onEmojiSelect={handleEmojiSelect}
        currentInput={inputValue}
      />
    </>
  );
});
