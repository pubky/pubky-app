import { AuthController } from '@/controllers/auth/auth';

export function useSessionRecovery() {
  // The controller owns restore status and concurrent retries; keep rejected restores out of click handlers.
  return { retry: () => AuthController.restorePersistedSession().catch(() => false) };
}
