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
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AUTH_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
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
            </Container>

            <Container className="flex flex-1 items-center justify-center py-4">
              <Image
                src="/images/new-here.svg"
                alt={t('newHere')}
                width={220}
                height={220}
                className="h-[87px] w-auto max-w-[220px] sm:h-auto sm:w-full"
              />
            </Container>

            <Button asChild className="w-full">
              <Link href={ONBOARDING_ROUTES.HUMAN} onClick={handleClose}>
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
            </Container>

            <Container className="flex flex-1 items-center justify-center py-4">
              <Image
                src="/images/sign-in.svg"
                alt={t('alreadyHaveAccount')}
                width={220}
                height={220}
                className="h-[87px] w-auto max-w-[220px] sm:h-auto sm:w-full"
              />
            </Container>

            <Button asChild variant="secondary" className="w-full">
              <Link href={AUTH_ROUTES.SIGN_IN} onClick={handleClose}>
                <ArrowRight className="mr-2 size-4" />
                {t('signInButton')}
              </Link>
            </Button>
          </Card>
        </Container>
      </DialogContent>
    </Dialog>
  );
}
