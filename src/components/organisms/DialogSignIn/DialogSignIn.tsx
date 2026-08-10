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
import { ArrowRight, UserRoundPlus } from 'lucide-react';
import { AUTH_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useAuthStore } from '@/stores/auth/auth.store';

export function DialogSignIn() {
  const showSignInDialog = useAuthStore((state) => state.showSignInDialog);
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);
  const handleClose = () => setShowSignInDialog(false);
  return (
    <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
      <DialogContent className="w-[576px] gap-6">
        <DialogHeader className="gap-2">
          <DialogTitle>{'Join Pubky'}</DialogTitle>
          <DialogDescription>{'Like what you see? Join the freedom web now.'}</DialogDescription>
        </DialogHeader>

        <Container className="flex flex-col gap-4 sm:flex-row">
          {/* New User Card */}
          <Card className="flex flex-1 flex-col gap-3 rounded-md py-6 sm:gap-6">
            <Container className="gap-2 px-6">
              <Typography as="h3" size="md" className="font-bold">
                {'New here?'}
              </Typography>
            </Container>

            <Container className="flex flex-1 items-center justify-center">
              <Image
                src="/images/new-here.webp"
                alt={'New here?'}
                width={202}
                height={202}
                className="h-[87px] w-auto max-w-[202px] sm:h-auto sm:w-full"
              />
            </Container>

            <Container className="px-6">
              <Button asChild className="w-full gap-2 font-bold">
                <Link href={ONBOARDING_ROUTES.HUMAN} onClick={handleClose}>
                  <UserRoundPlus className="size-4" />
                  {'Join Pubky'}
                </Link>
              </Button>
            </Container>
          </Card>

          {/* Sign In Card */}
          <Card className="flex flex-1 flex-col gap-3 rounded-md py-6 sm:gap-6">
            <Container className="gap-2 px-6">
              <Typography as="h3" size="md" className="font-bold">
                {'Already have a pubky?'}
              </Typography>
            </Container>

            <Container className="flex flex-1 items-center justify-center">
              <Image
                src="/images/sign-in.webp"
                alt={'Already have a pubky?'}
                width={202}
                height={202}
                className="h-[87px] w-auto max-w-[202px] sm:h-auto sm:w-full"
              />
            </Container>

            <Container className="px-6">
              <Button asChild variant="secondary" className="w-full gap-2 font-bold">
                <Link href={AUTH_ROUTES.SIGN_IN} onClick={handleClose}>
                  <ArrowRight className="size-4" />
                  {'Sign In'}
                </Link>
              </Button>
            </Container>
          </Card>
        </Container>
      </DialogContent>
    </Dialog>
  );
}
