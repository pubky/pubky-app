import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { shopFrameLoadedAt } from '@/libs/shop-embed/frame-presence';

/**
 * Diagnostics for #2942: the SDK's saved grant for the signed-in account disappeared while this tab
 * neither logged out nor retired it. The `restoreGrant` error for the same event is dropped from
 * Sentry (`unusable-saved-grant`), so this is its own capture under a distinct operation, and it
 * carries no `cause` so the once-per-chain guard cannot skip it. Report-only: it changes no flow.
 */
export type SavedSessionLoss = {
  /** `removed`/`cleared`: an SDK change notification; `restore`: a reload found the grant missing. */
  trigger: 'removed' | 'cleared' | 'restore';
  sessionStoreId: string;
  /** For `restore`: whether the stored record or only its delegated signing key was gone. */
  material?: 'record' | 'key';
  /** This tab was retiring the same grant (it should never retire the active one). */
  localRetirement: boolean;
  /** Seconds until the grant would have expired, from the public reference. */
  grantExpiresInS?: number;
};

const reported = new Set<string>();

export function reportSavedSessionLoss(loss: SavedSessionLoss): void {
  // One event per lost grant and page: a removal notice followed by its restore is one incident.
  if (reported.has(loss.sessionStoreId)) return;
  reported.add(loss.sessionStoreId);
  const shopLoadedAt = shopFrameLoadedAt();
  Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Saved session disappeared without a logout in this tab', {
    service: ErrorService.Local,
    operation: 'savedSessionLost',
    context: {
      trigger: loss.trigger,
      ...(loss.material && { material: loss.material }),
      localRetirement: loss.localRetirement,
      ...(loss.grantExpiresInS !== undefined && { grantExpiresInS: loss.grantExpiresInS }),
      shopFrameLoaded: shopLoadedAt !== null,
      ...(shopLoadedAt !== null && { shopFrameLoadedAgoS: Math.round((Date.now() - shopLoadedAt) / 1000) }),
      route: typeof window === 'undefined' ? undefined : window.location.pathname.split('/')[1] || 'root',
      visibility: typeof document === 'undefined' ? undefined : document.visibilityState,
    },
  });
}

/** Test isolation only. */
export function resetSavedSessionLossReports(): void {
  reported.clear();
}
