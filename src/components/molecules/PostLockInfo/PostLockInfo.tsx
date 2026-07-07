'use client';

import { Shield } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
import { VerifierType } from '@/services/locks/locks.types';
import type { PostLockInfoProps } from './PostLockInfo.types';

/** Masked dots shown for password-gated locks (matches the Figma password variant). */
const PASSWORD_MASK = '••••••';

/**
 * Compact lock indicator shown inside a lock post's unlock control.
 *
 * TODO:[Locks] #1998 — only the password variant (shield + masked dots) is built;
 * the payment variant (price) lands with the unlock/payment flow, so non-password
 * verifiers currently render nothing.
 *
 * TODO:[Locks] #2003 — `PostLockInfo` is not self-descriptive: this should surface the
 * lock-content status plus minimal info (title, thumbnail), not only the verifier badge.
 * Consider renaming (and widening its responsibility) in a following PR under the parent
 * Locks epic.
 */
export function PostLockInfo({ verifierType, className }: PostLockInfoProps) {
  if (verifierType !== VerifierType.PASSWORD) return null;

  // TODO:[Locks] #2003 — replace native HTML (`div` / `span`) with the design-system
  // atoms (`Container` / `Typography`) to follow the atomic-design convention; tracked
  // under the parent Locks epic.
  return (
    <div className={cn('flex items-center gap-1.5 text-brand', className)} data-testid="post-lock-info">
      <Shield className="size-4 shrink-0" aria-hidden />
      <span className="text-xs leading-4 font-medium tracking-[1.2px]">{PASSWORD_MASK}</span>
    </div>
  );
}
