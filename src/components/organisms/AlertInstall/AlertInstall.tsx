'use client';

import { Smartphone } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useInstallPrompt } from '@/hooks/useInstallPrompt/useInstallPrompt';
import { DialogInstallIos } from '@/organisms/DialogInstallIos/DialogInstallIos';

/**
 * AlertInstall
 *
 * Self-contained "Install Pubky" banner for the Home feed. Visibility, snoozing
 * and the install action live in `useInstallPrompt`; on iOS "Install" opens the
 * manual Add-to-Home-Screen steps instead of a native prompt.
 */
export function AlertInstall() {
  const { visible, install, remindLater, iosDialogOpen, closeIosDialog } = useInstallPrompt();
  if (!visible) return null;

  return (
    <>
      <Container
        role="region"
        aria-label="Install Pubky"
        data-testid="alert-install"
        className="flex-row items-center gap-3 rounded-lg bg-brand px-6 py-3"
      >
        <Container className="min-w-0 flex-1 flex-row items-center gap-3">
          <Smartphone aria-hidden="true" className="size-4 shrink-0 text-primary-foreground" />
          <Typography size="sm" className="truncate font-bold text-primary-foreground">
            <span className="md:hidden">Install Pubky</span>
            <span className="hidden md:inline">Install Pubky for faster access</span>
          </Typography>
        </Container>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="dark-outline"
            size="sm"
            className="bg-input/30 px-3.5 text-xs font-bold text-primary-foreground"
            onClick={remindLater}
          >
            Later
          </Button>
          <Button variant="dark" size="sm" className="border-card bg-card px-3.5 text-xs font-bold" onClick={install}>
            Install
          </Button>
        </div>
      </Container>
      <DialogInstallIos
        open={iosDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeIosDialog(false);
        }}
        onConfirm={() => closeIosDialog(true)}
      />
    </>
  );
}
