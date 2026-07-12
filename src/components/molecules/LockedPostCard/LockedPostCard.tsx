'use client';

import { LockOpen, Shield, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Image } from '@/atoms/Image/Image';
import { cn } from '@/libs/utils/utils';
import type { LockedPostCardProps } from './LockedPostCard.types';

/** Masked dots stand in for the password the reader will have to enter. */
const PASSWORD_MASK = '••••••';

/**
 * Stands in for the locked content inside the composer: once the lock switch is on, the body the
 * creator wrote is stashed away and this card takes its place, so the composer is free for the public
 * announcement teaser. Purely presentational — nothing here is clickable.
 *
 * TODO:[Locks] #2003 — this duplicates the card shell of the reader's `PostContentLock`
 * (`feat/2003-locks-reader`). That component is bound to `usePostLock` (fetches the lock file, resolves
 * the verifier), which cannot run here: the lock does not exist until Post. Once the reader lands on
 * `dev`, extract one presentational card and have both render it.
 */
export function LockedPostCard({ title, className }: LockedPostCardProps) {
  const t = useTranslations('post.lock');

  return (
    <div
      className={cn('flex items-start justify-between gap-4 rounded-md bg-muted p-6', className)}
      data-testid="locked-post-card"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-2">
          <StickyNote className="size-6 shrink-0 text-muted-foreground" aria-hidden />
          <h4 className="min-w-0 flex-1 text-xl leading-7 font-bold text-foreground">
            {title.trim() || t('defaultTitle')}
          </h4>
        </div>

        {/* TODO:[Locks] — Phase 1 is password-only, so the indicator is hardcoded. The payment
            variant (price) arrives with the payment verifier. */}
        <div className="flex w-fit items-center gap-1 rounded-full bg-card p-1">
          <Button type="button" variant={ButtonVariant.BRAND} disabled className="h-10 gap-2 rounded-full px-4">
            <LockOpen className="size-4 shrink-0" aria-hidden />
            {t('unlock')}
          </Button>
          <div className="flex items-center gap-1.5 px-4 text-brand">
            <Shield className="size-4 shrink-0" aria-hidden />
            <span className="text-xs leading-4 font-medium tracking-[1.2px]">{PASSWORD_MASK}</span>
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
