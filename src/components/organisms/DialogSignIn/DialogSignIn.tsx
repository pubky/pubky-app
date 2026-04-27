'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Core from '@/core';

/**
 * DialogSignIn
 *
 * A dialog that prompts unauthenticated users to sign in or create an account.
 * Displayed when users try to perform actions that require authentication
 * (e.g., reply, repost, bookmark, follow, tag).
 *
 * This component reads its open state from authStore.showSignInDialog.
 * It should be rendered once in the app layout, not in individual components.
 *
 * Inspired by pubky-app's Join modal but uses Franky's design patterns.
 */
import { UserPlus, KeyRound } from 'lucide-react';
export function DialogSignIn() {
  const t = useTranslations('dialogs.signIn');
  const showSignInDialog = Core.useAuthStore((state) => state.showSignInDialog);
  const setShowSignInDialog = Core.useAuthStore((state) => state.setShowSignInDialog);
  const handleClose = () => setShowSignInDialog(false);
  return (
    <Atoms.Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
      <Atoms.DialogContent className="w-3xl gap-0">
        <Atoms.DialogHeader className="gap-2">
          <Atoms.DialogTitle>{t('title')}</Atoms.DialogTitle>
          <Atoms.DialogDescription>{t('description')}</Atoms.DialogDescription>
        </Atoms.DialogHeader>

        <Atoms.Container className="mt-6 flex flex-col gap-4 sm:flex-row">
          {/* New User Card */}
          <Atoms.Card className="flex flex-1 flex-col gap-4 p-6">
            <Atoms.Container className="gap-2">
              <Atoms.Typography as="h3" size="md" className="font-bold">
                {t('newHere')}
              </Atoms.Typography>
              <Atoms.Typography as="p" size="sm" className="text-muted-foreground">
                {t('newHereDescription')}
              </Atoms.Typography>
            </Atoms.Container>

            <Atoms.Container className="flex flex-1 items-center justify-center py-4">
              <UserPlus className="size-16 text-muted-foreground/50" />
            </Atoms.Container>

            <Atoms.Button asChild className="w-full">
              <Link href="/" onClick={handleClose}>
                <UserPlus className="mr-2 size-4" />
                {t('joinButton')}
              </Link>
            </Atoms.Button>
          </Atoms.Card>

          {/* Sign In Card */}
          <Atoms.Card className="flex flex-1 flex-col gap-4 p-6">
            <Atoms.Container className="gap-2">
              <Atoms.Typography as="h3" size="md" className="font-bold">
                {t('alreadyHaveAccount')}
              </Atoms.Typography>
              <Atoms.Typography as="p" size="sm" className="text-muted-foreground">
                {t('alreadyHaveAccountDescription')}
              </Atoms.Typography>
            </Atoms.Container>

            <Atoms.Container className="flex flex-1 items-center justify-center py-4">
              <KeyRound className="size-16 text-muted-foreground/50" />
            </Atoms.Container>

            <Atoms.Button asChild variant="secondary" className="w-full">
              <Link href="/sign-in" onClick={handleClose}>
                <KeyRound className="mr-2 size-4" />
                {t('signInButton')}
              </Link>
            </Atoms.Button>
          </Atoms.Card>
        </Atoms.Container>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
