'use client';

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
import Link from 'next/link';
import { KeyRound, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useAuthStore } from '@/stores/auth/auth.store';

export function DialogSignIn() {
  const t = useTranslations('dialogs.signIn');
  const showSignInDialog = useAuthStore((state) => state.showSignInDialog);
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);
  const handleClose = () => setShowSignInDialog(false);
  return (
    <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
      <DialogContent className="w-3xl gap-0">
        <DialogHeader className="gap-2">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <Container className="mt-6 flex flex-col gap-4 sm:flex-row">
          {/* New User Card */}
          <Card className="flex flex-1 flex-col gap-4 p-6">
            <Container className="gap-2">
              <Typography as="h3" size="md" className="font-bold">
                {t('newHere')}
              </Typography>
              <Typography as="p" size="sm" className="text-muted-foreground">
                {t('newHereDescription')}
              </Typography>
            </Container>

            <Container className="flex flex-1 items-center justify-center py-4">
              <UserPlus className="size-16 text-muted-foreground/50" />
            </Container>

            <Button asChild className="w-full">
              <Link href="/" onClick={handleClose}>
                <UserPlus className="mr-2 size-4" />
                {t('joinButton')}
              </Link>
            </Button>
          </Card>

          {/* Sign In Card */}
          <Card className="flex flex-1 flex-col gap-4 p-6">
            <Container className="gap-2">
              <Typography as="h3" size="md" className="font-bold">
                {t('alreadyHaveAccount')}
              </Typography>
              <Typography as="p" size="sm" className="text-muted-foreground">
                {t('alreadyHaveAccountDescription')}
              </Typography>
            </Container>

            <Container className="flex flex-1 items-center justify-center py-4">
              <KeyRound className="size-16 text-muted-foreground/50" />
            </Container>

            <Button asChild variant="secondary" className="w-full">
              <Link href="/sign-in" onClick={handleClose}>
                <KeyRound className="mr-2 size-4" />
                {t('signInButton')}
              </Link>
            </Button>
          </Card>
        </Container>
      </DialogContent>
    </Dialog>
  );
}
