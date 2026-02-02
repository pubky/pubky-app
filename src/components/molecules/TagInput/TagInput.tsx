'use client';

import { useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Icons from '@/libs/icons';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';
import { TAG_MAX_LENGTH } from '@/config';
import { TAG_INPUT_BLUR_DELAY_MS } from '@/hooks/useTagInput';
import type { TagInputProps } from './TagInput.types';

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
  const emojiPickerOpenRef = useRef(false);

  // Convert existingTags to string array for API exclusions
  const existingTagLabels = useMemo(() => existingTags.map((tag) => tag.label), [existingTags]);

  // Combine exclusions for API suggestions: excludeFromApiSuggestions + existingTagLabels
  const apiExcludeTags = useMemo(() => {
    const combined = new Set([...excludeFromApiSuggestions, ...existingTagLabels]);
    return Array.from(combined);
  }, [excludeFromApiSuggestions, existingTagLabels]);

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
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    resetSelection,
    handleInputChange,
    handleInputFocus,
    handleKeyDown,
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

  // Merge local suggestions from hook with API suggestions (local first, deduplicated)
  const mergedSuggestions = useMemo(() => {
    if (!enableApiSuggestions || apiSuggestions.length === 0) {
      return suggestions;
    }

    // Get existing labels from local suggestions
    const localSet = new Set(suggestions.map((t) => t.label.toLowerCase()));

    // Add API suggestions that aren't already in local
    const apiTagsToAdd = apiSuggestions
      .filter((label) => !localSet.has(label.toLowerCase()))
      .map((label) => ({ label }));

    // Combine and limit to 5 total
    return [...suggestions, ...apiTagsToAdd].slice(0, 5);
  }, [enableApiSuggestions, suggestions, apiSuggestions]);

  const displaySuggestions = enableApiSuggestions ? mergedSuggestions : suggestions;
  const isListboxOpen = showSuggestions && displaySuggestions.length > 0;

  const handleInputBlur = () => {
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        if (!inputValue && !emojiPickerOpenRef.current && onBlur) {
          onBlur();
        }
      }
    }, TAG_INPUT_BLUR_DELAY_MS);
  };

  const handleEmojiButtonMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    emojiPickerOpenRef.current = true;
  };

  const handleEmojiPickerClose = (open: boolean) => {
    emojiPickerOpenRef.current = open;
    setShowEmojiPicker(open);
    if (!open) {
      inputRef.current?.focus();
    }
  };

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const selectSuggestion = (label: string) => {
    if (addOnSuggestionClick) {
      // Directly add the tag
      onTagAdd(label.toLowerCase());
      setInputValue('');
    } else {
      // Just fill the input
      setInputValue(label.toLowerCase());
    }
    setShowSuggestions(false);
    resetSelection();
    inputRef.current?.focus();
  };

  const displayPlaceholder = isAtLimit ? defaultLimitReachedPlaceholder : defaultPlaceholder;

  return (
    <>
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
          onKeyDown={handleKeyDown}
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
          onMouseDown={handleEmojiButtonMouseDown}
          onClick={() => setShowEmojiPicker(true)}
          className={Libs.cn(
            'inline-flex size-5 cursor-pointer items-center justify-center rounded-full p-1 shadow-xs-dark hover:shadow-xs-dark',
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

        {isListboxOpen && (
          <Atoms.Container
            overrideDefaults={true}
            className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-border bg-popover"
          >
            {displaySuggestions.map((tag, index) => (
              <Atoms.Container
                key={tag.label}
                overrideDefaults={true}
                className={Libs.cn(
                  'cursor-pointer px-3 py-2 hover:rounded-md hover:bg-accent',
                  index === selectedSuggestionIndex && 'rounded-md bg-accent',
                )}
                onMouseDown={preventBlur}
                onClick={() => selectSuggestion(tag.label)}
                onMouseEnter={() => setSelectedSuggestionIndex(index)}
              >
                <Atoms.Typography as="span" className="text-sm font-medium text-popover-foreground">
                  {tag.label}
                </Atoms.Typography>
              </Atoms.Container>
            ))}
          </Atoms.Container>
        )}
      </Atoms.Container>

      <Molecules.EmojiPickerDialog
        open={showEmojiPicker && !disabled}
        onOpenChange={handleEmojiPickerClose}
        onEmojiSelect={handleEmojiSelect}
        currentInput={inputValue}
      />
    </>
  );
}
