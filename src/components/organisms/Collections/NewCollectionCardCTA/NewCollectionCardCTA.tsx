'use client';

import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { DialogNewCollection } from '@/organisms/Collections/DialogNewCollection/DialogNewCollection';
import { GRID_DASHED_CTA_TRIGGER_CLASS } from '@/organisms/Collections/gridDashedCta.const';

const NewCollectionCardCTATrigger = forwardRef<ComponentRef<typeof Button>, ComponentPropsWithoutRef<typeof Button>>(
  function NewCollectionCardCTATrigger(props, ref) {
    return (
      <Button
        ref={ref}
        overrideDefaults
        type="button"
        aria-label={'New Collection'}
        data-cy="new-collection-card-cta"
        className={GRID_DASHED_CTA_TRIGGER_CLASS}
        {...props}
      >
        <Plus className="size-3 shrink-0" />
        <Typography as="span" overrideDefaults className="text-sm font-bold">
          {'New Collection'}
        </Typography>
      </Button>
    );
  },
);

/**
 * Large dashed-outline CTA for the Collections overview grid.
 */
export function NewCollectionCardCTA() {
  return (
    <DialogNewCollection>
      <NewCollectionCardCTATrigger />
    </DialogNewCollection>
  );
}
