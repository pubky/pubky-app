import { useAuthStore } from '@/stores/auth/auth.store';

/** Prevent a request from repopulating the database after logout/account replacement. */
export function captureViewerSession(): () => boolean {
  const { currentUserPubky, session } = useAuthStore.getState();
  return () => {
    const current = useAuthStore.getState();
    return current.currentUserPubky === currentUserPubky && current.session === session;
  };
}
