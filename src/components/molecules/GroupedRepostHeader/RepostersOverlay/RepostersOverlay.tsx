'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import type { RepostersOverlayProps } from './RepostersOverlay.types';

/**
 * RepostersOverlay
 *
 * Displays list of reposters in either a dialog (desktop) or bottom sheet (mobile).
 * Controlled component - open state managed by parent.
 */
export function RepostersOverlay({ variant, open, onOpenChange, reposters }: RepostersOverlayProps) {
  const t = useTranslations('repost');

  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (variant === 'sheet') {
    return (
      <Atoms.Sheet open={open} onOpenChange={onOpenChange}>
        <Atoms.SheetContent side="bottom" className="rounded-t-2xl pb-8" onClick={handleContentClick}>
          <Atoms.SheetHeader className="mb-4">
            <Atoms.SheetTitle>{t('reposters')}</Atoms.SheetTitle>
          </Atoms.SheetHeader>
          <Molecules.WhoTaggedExpandedList
            taggers={reposters}
            className="max-w-full border-0 p-0"
            data-testid="reposter-expanded-list"
          />
        </Atoms.SheetContent>
      </Atoms.Sheet>
    );
  }

  return (
    <Atoms.Dialog open={open} onOpenChange={onOpenChange}>
      <Atoms.DialogContent className="max-w-md" onClick={handleContentClick}>
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>{t('reposters')}</Atoms.DialogTitle>
        </Atoms.DialogHeader>
        <Molecules.WhoTaggedExpandedList
          taggers={reposters}
          className="border-0 p-0"
          data-testid="reposter-expanded-list"
        />
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
