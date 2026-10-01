'use client';

import React, { useState } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useSessionNeedsUpgrade } from '@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade';
import { cn } from '@/libs/utils/utils';
import {
  focusLocksDialogPanel,
  LOCKS_DIALOG_CARD_CLASSNAME,
  LOCKS_DIALOG_DESCRIPTION_CLASSNAME,
} from '@/organisms/DialogLocksAuth/DialogLocksAuth.constants';
import { SessionUpgradeDescription, SessionUpgradePanel } from '@/organisms/SessionUpgradePanel/SessionUpgradePanel';

const stopCardPropagation = (event: React.MouseEvent) => event.stopPropagation();

interface LocksPermissionNoticeProps {
  className?: string;
}

/**
 * Shown while the session predates the `/priv` capabilities (#2373): it cannot reach unlocked
 * content or the creator's own originals. Opens the same Ring approval the creator setup uses, and
 * closes itself once the session is replaced. Callers render it only while
 * `useSessionNeedsUpgrade()` is true, so the button always has something to open.
 */
export function LocksPermissionNotice({ className }: LocksPermissionNoticeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const needsUpgrade = useSessionNeedsUpgrade();

  return (
    <Container
      overrideDefaults
      data-testid="locks-permission-notice"
      className={cn('flex flex-col items-start gap-3', className)}
      // In a feed the notice sits inside the post card's click target, which navigates to the post
      // and would unmount the dialog the button just opened (`LockedPostCard` does the same).
      onClick={stopCardPropagation}
      onAuxClick={stopCardPropagation}
    >
      <Typography overrideDefaults className="text-base font-medium text-muted-foreground">
        {'Pubky.app needs your permission to read your Locks data on your homeserver.'}
      </Typography>
      <Button variant={ButtonVariant.OUTLINE} size="lg" className="w-fit" onClick={() => setIsOpen(true)}>
        {'Authorize with Pubky Ring'}
      </Button>
      <Dialog open={isOpen && needsUpgrade} onOpenChange={setIsOpen}>
        <DialogContent
          overrideDefaults
          className={LOCKS_DIALOG_CARD_CLASSNAME}
          onOpenAutoFocus={focusLocksDialogPanel}
          // Clicks bubble through the portal to the post card, which would navigate to the post.
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader className="gap-6">
            <DialogTitle>{'Enable Locks'}</DialogTitle>
            <DialogDescription className={LOCKS_DIALOG_DESCRIPTION_CLASSNAME}>
              <SessionUpgradeDescription />
            </DialogDescription>
          </DialogHeader>
          <SessionUpgradePanel />
        </DialogContent>
      </Dialog>
    </Container>
  );
}
