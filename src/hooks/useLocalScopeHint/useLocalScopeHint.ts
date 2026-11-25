'use client';

import { hasLocalIndexSource } from '@/config/nexus';
import { useAuthStore } from '@/stores/auth/auth.store';

/** The hint next to a ranking or suggestion list, or on a count, that the local index answers. */
export const LOCAL_SCOPE_HINT = 'In your network';

/**
 * `LOCAL_SCOPE_HINT` while the local index answers the signed-in user's rankings and counts, which then range over
 * the people their network reaches rather than everyone; `undefined` otherwise. A visitor's index has no network, so
 * those reads go to Nexus or nowhere.
 */
export function useLocalScopeHint(): string | undefined {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  return hasLocalIndexSource() && currentUserPubky ? LOCAL_SCOPE_HINT : undefined;
}

/**
 * What follows a count the local index answers when it is read out, since the tooltip on the number is not: in the
 * accessible name of the control showing it, or as screen reader text next to it. Empty without a hint.
 */
export function localScopeHintSuffix(hint: string | undefined): string {
  return hint ? `, ${hint.toLowerCase()}` : '';
}

/** `label` with `localScopeHintSuffix` after it, for the accessible name of a control showing a count. */
export function withLocalScopeHint(label: string, hint: string | undefined): string {
  return `${label}${localScopeHintSuffix(hint)}`;
}
