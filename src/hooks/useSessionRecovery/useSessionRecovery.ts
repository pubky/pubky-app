import { AuthController } from '@/controllers/auth/auth';

export function useSessionRecovery() {
  return { retry: () => AuthController.restorePersistedSession().catch(() => false) };
}
