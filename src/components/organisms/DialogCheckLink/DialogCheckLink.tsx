'use client';

import { useState, useEffect, useMemo } from 'react';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Config from '@/config';
import type { DialogCheckLinkProps } from './DialogCheckLink.types';
import { ExternalLink } from 'lucide-react';
import { truncateMiddle } from '@/libs/utils/utils';
export function DialogCheckLink({ open, onOpenChangeAction, linkUrl }: DialogCheckLinkProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const { setShowConfirm } = Core.useSettingsStore();

  // Reset checkbox when the dialog opens
  useEffect(() => {
    if (open) {
      setDontShowAgain(false);
    }
  }, [open]);
  const handleContinue = () => {
    // If "Don't show this again" is checked, disable the check
    if (dontShowAgain) {
      setShowConfirm(false);
    }

    // Open link in new tab
    window.open(linkUrl, '_blank', 'noopener,noreferrer');

    // Close dialog
    onOpenChangeAction(false);
  };
  const handleCancel = () => {
    onOpenChangeAction(false);
  };

  // Truncate URL for display (preserves beginning and end)
  const displayUrl = useMemo(() => truncateMiddle(linkUrl, Config.URL_TRUNCATE_LENGTH), [linkUrl]);
  return (
    <Atoms.Dialog open={open} onOpenChange={onOpenChangeAction}>
      <Atoms.DialogContent className="w-2xl" hiddenTitle="Double-check this link" onClick={(e) => e.stopPropagation()}>
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>Double-check this link</Atoms.DialogTitle>
          <Atoms.DialogDescription>The link is taking you to another site:</Atoms.DialogDescription>
        </Atoms.DialogHeader>
        <Atoms.Container className="gap-3">
          <Atoms.Typography className="text-sm font-bold break-all text-foreground">{displayUrl}</Atoms.Typography>
          <Atoms.Typography className="text-sm text-muted-foreground">
            Are you sure you want to continue?
          </Atoms.Typography>
          <Atoms.Checkbox
            id="dont-show-again"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            label="Don't show this again"
          />
        </Atoms.Container>
        <Atoms.DialogFooter>
          <Atoms.Button variant="outline" size="lg" onClick={handleCancel}>
            Cancel
          </Atoms.Button>
          <Atoms.Button size="lg" onClick={handleContinue}>
            <ExternalLink className="h-4 w-4" />
            Continue
          </Atoms.Button>
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
