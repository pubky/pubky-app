'use client';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';

/**
 * HeaderJoin component for unauthenticated users on public routes.
 *
 * Displays a "Join" button that opens the sign-in dialog.
 * Used instead of HeaderHome when viewing public pages (post/profile) without auth.
 *
 * Follows pubky-app pattern for minimal header on public view pages.
 */
import { UserRound } from 'lucide-react';
import { useAuthStore } from '@/stores/auth/auth.store';
export function HeaderJoin() {
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);
  const handleJoinClick = () => {
    setShowSignInDialog(true);
  };
  return (
    <Container className="flex-1 flex-row items-center justify-end">
      <Button
        variant="secondary"
        size="icon"
        className="size-12"
        onClick={handleJoinClick}
        aria-label="Join Pubky"
        data-testid="header-join-button"
      >
        <UserRound className="size-6" />
      </Button>
    </Container>
  );
}
