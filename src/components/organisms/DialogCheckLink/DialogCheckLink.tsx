'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { URL_TRUNCATE_LENGTH } from '@/config/urls';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { truncateMiddle } from '@/libs/utils/utils';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { DialogCheckLinkProps } from './DialogCheckLink.types';

export function DialogCheckLink({ open, onOpenChangeAction, linkUrl }: DialogCheckLinkProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const { setShowConfirm } = useSettingsStore();

  // Reset checkbox when the dialog opens
  useEffect(() => {
    if (open) {
      setDontShowAgain(false);
    }
  }, [open]);
  const handleContinue = () => {
    const safeUrl = getSafeExternalUrl(linkUrl);
    if (!safeUrl) {
      onOpenChangeAction(false);
      return;
    }

    // If "Don't show this again" is checked, disable the check
    if (dontShowAgain) {
      setShowConfirm(false);
    }

    // Open link in new tab
    window.open(safeUrl, '_blank', 'noopener,noreferrer');

    // Close dialog
    onOpenChangeAction(false);
  };
  const handleCancel = () => {
    onOpenChangeAction(false);
  };

  // Truncate URL for display (preserves beginning and end)
  const displayUrl = useMemo(() => truncateMiddle(linkUrl, URL_TRUNCATE_LENGTH), [linkUrl]);
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="w-2xl" hiddenTitle="Double-check this link" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Double-check this link</DialogTitle>
          <DialogDescription>The link is taking you to another site:</DialogDescription>
        </DialogHeader>
        <Container className="gap-3">
          <Typography className="text-sm font-bold break-all text-foreground">{displayUrl}</Typography>
          <Typography className="text-sm text-muted-foreground">Are you sure you want to continue?</Typography>
          <Checkbox
            id="dont-show-again"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            label="Don't show this again"
          />
        </Container>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="lg" onClick={handleContinue}>
            <ExternalLink className="h-4 w-4" />
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
