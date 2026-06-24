'use client';

import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import {
  GRID_DASHED_CTA_TRIGGER_CLASS,
  GRID_DASHED_CTA_WRAPPER_CLASS,
} from '@/organisms/Collections/gridDashedCta.const';
import { NewCollectionDialog } from '@/organisms/NewCollectionDialog/NewCollectionDialog';

const NewCollectionCardCTATrigger = forwardRef<ComponentRef<typeof Button>, ComponentPropsWithoutRef<typeof Button>>(
  function NewCollectionCardCTATrigger({ className, ...props }, ref) {
    const t = useTranslations('collections.new');

    return (
      <Button
        ref={ref}
        overrideDefaults
        type="button"
        aria-label={t('cta')}
        data-cy="new-collection-card-cta"
        className={cn(GRID_DASHED_CTA_TRIGGER_CLASS, className)}
        {...props}
      >
        <Plus className="size-3 shrink-0" />
        <Typography as="span" overrideDefaults className="text-sm font-bold">
          {t('cta')}
        </Typography>
      </Button>
    );
  },
);

/**
 * Large dashed-outline CTA for the Collections overview grid. Uses the same
 * `h-full` grid stretch pattern as `CollectionCard` / `CollectionBookmarkCard`:
 * grows to match a taller sibling in the same row, but never imposes a min-height
 * that would force compact neighbours to expand.
 */
export function NewCollectionCardCTA() {
  return (
    <Container overrideDefaults className={cn(GRID_DASHED_CTA_WRAPPER_CLASS, 'lg:max-w-187')}>
      <NewCollectionDialog>
        <NewCollectionCardCTATrigger />
      </NewCollectionDialog>
    </Container>
  );
}
