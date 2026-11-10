import { hasCapabilities } from '@/libs/auth/capabilities';
import { useAuthStore } from '@/stores/auth/auth.store';

/** Prevent a request from repopulating the database after logout/account replacement. */
export function captureViewerSession(): () => boolean {
  const { currentUserPubky, session } = useAuthStore.getState();
  return () => {
    const current = useAuthStore.getState();
    return current.currentUserPubky === currentUserPubky && current.session === session;
  };
}

/** Whether the current session may write a viewer-owned `pubky://<viewer>/pub/...` file; root sessions cover every app. */
export function captureSessionWriteAccess(): (uri: string) => boolean {
  const { session } = useAuthStore.getState();
  return (uri) => {
    const path = uri.replace(/^pubky:\/\/[^/]+/, '');
    return session !== null && hasCapabilities(session.info.capabilities, [`${path}:w`]);
  };
}
