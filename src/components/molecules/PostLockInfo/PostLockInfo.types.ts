import type { VerifierType } from '@/services/locks/locks.types';

export interface PostLockInfoProps {
  /** How the content is gated. Drives which indicator is shown. */
  verifierType: VerifierType;
  className?: string;
}
