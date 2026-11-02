'use client';

import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { LockOpen, Pencil, Wallet } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Image } from '@/atoms/Image/Image';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { getLockContentDisplay } from '@/libs/post/lockContentKind';
import { formatLockPrice } from '@/libs/utils/lockPrice';
import { cn } from '@/libs/utils/utils';
import { LockTitle } from '@/molecules/LockTitle/LockTitle';
import { useIsNestedPostPreview } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import type { TLockPrice } from '@/services/locks/locks.types';

interface LockedPostCardProps {
  /** Creator-typed lock title for the reader/preview view. Ignored when `editableTitle` is set. */
  title?: string;
  /** The locked post's kind: picks the icon and the title shown when none was typed (#2433). */
  contentKind?: string;
  /** The lock price shown beside Unlock. Nullish → the masked dots, unless `isLoading` shows the spinner instead. */
  price?: TLockPrice | null;
  onUnlock?: () => void;
  /** Whether the unlock modal is open. Keeps the slid-over button parked until the modal closes. */
  unlockOpen?: boolean;
  /**
   * Whether pressing Unlock opens the unlock modal. False runs `onUnlock` straight away without the
   * slide-over — only a modal closing snaps the button back, so a click that opens something else
   * (sign-in) would leave it parked over the price for good.
   */
  slideOnUnlock?: boolean;
  /** The lock file is still loading: one spinner covers the pill. */
  isLoading?: boolean;
  /** Force the Unlock control disabled. Defaults to `!onUnlock` (inert without a handler). */
  disabled?: boolean;
  /**
   * Composer mode: renders the title as an inline editable input instead of static text, with a pencil
   * button after it. Every change is kept; there is no confirm step. Reader mode ignores this.
   */
  editableTitle?: { value: string; onChange: (value: string) => void; disabled?: boolean; maxLength?: number };
  /**
   * Composer mode: the price becomes a button that calls this, to change the price of a lock not yet published.
   * Only Unlock is dimmed then, so the price does not look disabled. Not for use with `onUnlock` or `isLoading`.
   */
  onChangePrice?: () => void;
  className?: string;
}

/** Stands in for a payment requirement that is unresolved or unsupported. */
const HIDDEN_REQUIREMENT_MASK = '••••••';

/** Slide-over duration — the single source for both the CSS transition and the deferred modal open.
 *  Exported for tests (they advance fake timers by exactly this). */
export const SLIDE_MS = 200;

/** The shared lock card. */
export function LockedPostCard({
  contentKind,
  title,
  price,
  onUnlock,
  unlockOpen,
  slideOnUnlock = true,
  isLoading = false,
  disabled,
  editableTitle,
  onChangePrice,
  className,
}: LockedPostCardProps) {
  // Loading is inert but undimmed: a dimmed pill would flash as disabled right before the price arrives.
  const isDimmed = !isLoading && (disabled ?? !onUnlock);
  const isDisabled = isLoading || isDimmed;
  const priceLabel = price ? formatLockPrice(price) : HIDDEN_REQUIREMENT_MASK;
  const { title: defaultTitle, Icon: KindIcon } = getLockContentDisplay(contentKind);
  const priceContent = (
    <>
      <Wallet className="size-4 shrink-0" aria-hidden />
      <span className="text-xs leading-4 font-medium tracking-[1.2px]">{priceLabel}</span>
    </>
  );

  const isNested = useIsNestedPostPreview();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lockInfoRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
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
    if (!slideOnUnlock) {
      onUnlock?.();
      return;
    }

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
      // A quote-repost preview is itself `bg-muted`, so the card has to step down a shade there or the
      // two read as one block. The price pill steps down with it to keep its own contrast.
      className={cn(
        // `@container/lock-card`: the shield's size follows the card's own width, not the viewport.
        // `items-end`: the shield sits on the bottom edge, level with the Unlock pill.
        '@container/lock-card flex cursor-default items-end justify-between gap-4 rounded-md p-6',
        isNested ? 'bg-card' : 'bg-muted',
        className,
      )}
      data-testid="locked-post-card"
    >
      {/* No `min-w-0`: the column keeps at least the pill's width, so the pill never runs under the shield
          and the default title stays on one line. A long custom title still wraps (`wrap-anywhere`). */}
      <div className="flex flex-1 flex-col gap-4">
        <div className={cn('flex items-center gap-2', editableTitle && 'group')}>
          {editableTitle ? (
            <>
              <KindIcon className="size-6 shrink-0 text-foreground" aria-hidden />
              {/* The hidden copy sizes the box to the title so the pencil sits right after it. Safari lacks
                  `field-sizing: content`, and an input in the flow adds its own minimum width, so it overlays the box.
                  `grid`: a clipped grid item has no minimum width, so a long title cannot widen the card. */}
              <div className="relative grid min-w-0">
                <span aria-hidden className="invisible overflow-hidden text-xl leading-7 font-bold whitespace-pre">
                  {editableTitle.value || defaultTitle}
                </span>
                <input
                  ref={titleInputRef}
                  value={editableTitle.value}
                  onChange={(event) => editableTitle.onChange(event.target.value)}
                  onFocus={() => setIsEditing(true)}
                  onBlur={() => setIsEditing(false)}
                  // The title is kept as it is typed, so Enter and Escape only end editing. Safari sends the
                  // Enter that commits an IME composition after it ends, with keyCode 229 instead of `isComposing`.
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                  }}
                  placeholder={defaultTitle}
                  disabled={editableTitle.disabled}
                  maxLength={editableTitle.maxLength}
                  aria-label={'Lock title'}
                  data-cy="lock-title-input"
                  // Marks the input for the composer's outside-click collapse exclusion (usePostInput).
                  data-lock-title-input=""
                  className={cn(
                    'absolute inset-0 w-full bg-transparent text-xl leading-7 font-bold text-foreground caret-foreground outline-none placeholder:text-muted-foreground',
                    !isEditing && 'group-hover:text-brand',
                  )}
                />
              </div>
              <Button
                overrideDefaults
                type="button"
                onClick={() => titleInputRef.current?.focus()}
                disabled={editableTitle.disabled}
                aria-label={'Edit lock title'}
                data-cy="lock-title-edit"
                className="shrink-0 cursor-pointer rounded-full p-1 text-muted-foreground outline-none group-hover:text-brand focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
            </>
          ) : (
            <>
              <KindIcon className="size-6 shrink-0 text-muted-foreground" aria-hidden />
              <h4 className="line-clamp-2 min-w-0 flex-1 text-xl leading-7 font-bold wrap-anywhere text-foreground">
                <LockTitle title={title?.trim() || defaultTitle} mentionClassName="text-xl" />
              </h4>
            </>
          )}
        </div>

        <div
          className={cn(
            'relative flex w-fit items-center gap-1 rounded-full p-1',
            isNested ? 'bg-background' : 'bg-card',
            isDimmed && !onChangePrice && 'cursor-not-allowed opacity-50',
          )}
        >
          <Button
            ref={buttonRef}
            type="button"
            variant={ButtonVariant.BRAND}
            disabled={isDisabled}
            onClick={handleUnlock}
            style={{ transform: `translateX(${slideX}px)`, transitionDuration: `${SLIDE_MS}ms` }}
            className={cn(
              'relative z-10 h-10 gap-2 rounded-full px-4 transition-transform ease-out',
              !onChangePrice && 'disabled:opacity-100',
              isLoading && 'invisible',
            )}
          >
            <LockOpen className="size-4 shrink-0" aria-hidden />
            {'Unlock'}
          </Button>
          {onChangePrice ? (
            <Button
              overrideDefaults
              type="button"
              onClick={onChangePrice}
              data-cy="lock-price-edit"
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-4 text-brand outline-none hover:bg-brand/16 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {/* Prefix, not `aria-label`: the price stays part of the accessible name. */}
              <span className="sr-only">{'Change price: '}</span>
              {priceContent}
            </Button>
          ) : (
            // `invisible`, not removed: the hidden contents keep the pill at its loaded width.
            <div
              ref={lockInfoRef}
              className={cn('flex items-center gap-1.5 px-4 text-brand', isLoading && 'invisible')}
            >
              {priceContent}
            </div>
          )}
          {isLoading && <Spinner size="sm" className="absolute inset-0 m-auto" />}
        </div>
      </div>

      {/* 68px at most (the design asks for 25-30% under the original 96px), 48px on a card under 20rem of content (the
          Cards layout's 336px and 309px cards). It still gives way to the pill instead of running under it,
          and drops out once it would draw under 48px (3rem). */}
      <div className="@container/shield hidden w-17 min-w-0 shrink sm:block @max-xs/lock-card:w-12">
        <Image
          src="/images/shield.png"
          alt=""
          width={68}
          height={68}
          className="hidden aspect-square h-auto w-full rounded-md object-contain @min-[3rem]/shield:block"
        />
      </div>
    </div>
  );
}
