'use client';

import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { Check, LockOpen, Pencil, Shield, StickyNote, Wallet } from 'lucide-react';
import type { TLockConfig } from '@/application/locks/locks.types';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Image } from '@/atoms/Image/Image';
import { DEFAULT_LOCK_TITLE } from '@/libs/post/lockTeaser';
import { cn } from '@/libs/utils/utils';

interface LockedPostCardProps {
  /** Creator-typed lock title for the reader/preview view. Ignored when `editableTitle` is set. */
  title?: string;
  /** How the lock opens, shown beside Unlock. Nullish until known → the masked dots. */
  unlockInfo?: TLockConfig | null;
  onUnlock?: () => void;
  /** Whether the unlock modal is open. Keeps the slid-over button parked until the modal closes. */
  unlockOpen?: boolean;
  /** Force the Unlock control disabled. Defaults to `!onUnlock` (inert without a handler). */
  disabled?: boolean;
  /**
   * Composer mode: renders the title as an inline editable input instead of static text. The leading
   * icon shifts StickyNote (idle) → Pencil (hover) → Check (editing). Reader mode ignores this.
   */
  editableTitle?: { value: string; onChange: (value: string) => void; disabled?: boolean; maxLength?: number };
  className?: string;
}

/** Stands in for an unlock requirement the reader can't be shown — a password, or an unresolved lock. */
const HIDDEN_REQUIREMENT_MASK = '••••••';

const satsFormatter = new Intl.NumberFormat('en-US');

/** Slide-over duration — the single source for both the CSS transition and the deferred modal open.
 *  Exported for tests (they advance fake timers by exactly this). */
export const SLIDE_MS = 200;

/** The shared lock card. */
export function LockedPostCard({
  title,
  unlockInfo,
  onUnlock,
  unlockOpen,
  disabled,
  editableTitle,
  className,
}: LockedPostCardProps) {
  const isDisabled = disabled ?? !onUnlock;
  const UnlockInfoIcon = unlockInfo?.method === 'payment' ? Wallet : Shield;
  const unlockInfoLabel =
    unlockInfo?.method === 'payment'
      ? `₿${satsFormatter.format(Number(unlockInfo.amountSats))}`
      : HIDDEN_REQUIREMENT_MASK;

  const buttonRef = useRef<HTMLButtonElement>(null);
  const lockInfoRef = useRef<HTMLDivElement>(null);
  const slideTimer = useRef<number | null>(null);
  const [slideX, setSlideX] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  // Snap the button back once the modal closes; it stays parked (slideX kept) while open.
  useEffect(() => {
    if (!unlockOpen) setSlideX(0);
  }, [unlockOpen]);

  // Cancel a pending slide on unmount so onUnlock can't fire into a gone component.
  useEffect(() => {
    return () => {
      if (slideTimer.current !== null) window.clearTimeout(slideTimer.current);
    };
  }, []);

  const handleUnlock = (event: MouseEvent) => {
    event.stopPropagation();
    // The ref guard also blocks a double-click: a second click during the slide is a no-op.
    if (isDisabled || slideTimer.current !== null) return;

    const button = buttonRef.current;
    const lockInfo = lockInfoRef.current;
    // Slide the button's left edge onto the price/mask's, covering it; then open the modal.
    if (button && lockInfo) setSlideX(lockInfo.offsetLeft - button.offsetLeft);
    slideTimer.current = window.setTimeout(() => {
      slideTimer.current = null;
      onUnlock?.();
    }, SLIDE_MS);
  };

  return (
    <div
      // Don't redirect to the post detail on card clicks — only Unlock acts.
      onClick={(event) => event.stopPropagation()}
      className={cn('flex cursor-default items-start justify-between gap-4 rounded-md bg-muted p-6', className)}
      data-testid="locked-post-card"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className={cn('flex items-center gap-2', editableTitle && 'group')}>
          {editableTitle ? (
            <>
              {/* Icon tracks the state: Check while editing, Pencil on hover, StickyNote otherwise. */}
              {isEditing ? (
                <Check className="size-6 shrink-0 text-foreground" aria-hidden />
              ) : (
                <>
                  <StickyNote className="size-6 shrink-0 text-foreground group-hover:hidden" aria-hidden />
                  <Pencil className="hidden size-6 shrink-0 text-brand group-hover:block" aria-hidden />
                </>
              )}
              <input
                value={editableTitle.value}
                onChange={(event) => editableTitle.onChange(event.target.value)}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
                placeholder={DEFAULT_LOCK_TITLE}
                disabled={editableTitle.disabled}
                maxLength={editableTitle.maxLength}
                aria-label={'Lock title'}
                data-cy="lock-title-input"
                // Marks the input for the composer's outside-click collapse exclusion (usePostInput).
                data-lock-title-input=""
                className={cn(
                  'min-w-0 flex-1 bg-transparent text-xl leading-7 font-bold text-foreground caret-foreground outline-none placeholder:text-muted-foreground',
                  !isEditing && 'group-hover:text-brand',
                )}
              />
            </>
          ) : (
            <>
              <StickyNote className="size-6 shrink-0 text-muted-foreground" aria-hidden />
              <h4 className="min-w-0 flex-1 text-xl leading-7 font-bold text-foreground">
                {title?.trim() || DEFAULT_LOCK_TITLE}
              </h4>
            </>
          )}
        </div>

        {/* TODO:[Locks] #2369 — the password variant goes away here, leaving only the price. */}
        <div
          className={cn(
            'relative flex w-fit items-center gap-1 rounded-full bg-card p-1',
            isDisabled && 'cursor-not-allowed',
          )}
        >
          <Button
            ref={buttonRef}
            type="button"
            variant={ButtonVariant.BRAND}
            disabled={isDisabled}
            onClick={handleUnlock}
            style={{ transform: `translateX(${slideX}px)`, transitionDuration: `${SLIDE_MS}ms` }}
            className="relative z-10 h-10 gap-2 rounded-full px-4 transition-transform ease-out"
          >
            <LockOpen className="size-4 shrink-0" aria-hidden />
            {'Unlock'}
          </Button>
          <div ref={lockInfoRef} className="flex items-center gap-1.5 px-4 text-brand">
            <UnlockInfoIcon className="size-4 shrink-0" aria-hidden />
            <span className="text-xs leading-4 font-medium tracking-[1.2px]">{unlockInfoLabel}</span>
          </div>
        </div>
      </div>

      <Image
        src="/images/shield.png"
        alt=""
        width={96}
        height={96}
        className="hidden size-24 shrink-0 rounded-md object-contain sm:block"
      />
    </div>
  );
}
