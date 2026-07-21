'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';

/** Library illustration shown in the first-collection onboarding intro. */
const COLLECTIONS_INTRO_IMAGE = '/images/collections-onboarding.webp';

type DialogCollectionsIntroProps = {
  /** Controlled open state, owned by `DialogNewCollection`. */
  open: boolean;
  /** Fires on close (X / Cancel / overlay) — never on Continue. */
  onOpenChange: (open: boolean) => void;
  /** Advances the flow from the intro to the collection form. */
  onContinue: () => void;
};

/**
 * First-run onboarding intro for Collections. Shown once a user with no
 * collections of their own clicks "New Collection", ahead of the create form.
 * Purely presentational: the gate (when to show) and the Continue → form
 * transition are owned by `DialogNewCollection`.
 */
export function DialogCollectionsIntro({ open, onOpenChange, onContinue }: DialogCollectionsIntroProps) {
  const t = useTranslations('collections.intro');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-xl border-border bg-popover">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <DialogDescription className="text-base text-secondary-foreground">{t('description')}</DialogDescription>

        {/* `loading="eager"` + `unoptimized` so the art shows the instant the modal
            opens: `unoptimized` serves the raw 22KB webp directly instead of the
            on-demand `/_next/image` optimizer (slow on first hit), and `eager` drops
            the default lazy-loading so the fetch starts as soon as the modal mounts. */}
        <Image
          src={COLLECTIONS_INTRO_IMAGE}
          alt={t('imageAlt')}
          width={192}
          height={192}
          loading="eager"
          unoptimized
          className="mx-auto size-48"
        />

        <Typography size="sm" className="font-normal text-muted-foreground">
          {t('publicNote')}
        </Typography>

        <DialogFooter>
          <Button size="lg" onClick={onContinue} className="order-1 sm:order-2" data-cy="collections-intro-continue">
            {t('continue')}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            className="order-2 sm:order-1"
            data-cy="collections-intro-cancel"
          >
            {t('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
