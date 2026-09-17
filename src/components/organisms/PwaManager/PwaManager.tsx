'use client';

import { useAppBadge } from '@/hooks/useAppBadge/useAppBadge';
import { useInstallPromptLifecycle } from '@/hooks/useInstallPromptLifecycle/useInstallPromptLifecycle';
import { useNetworkStatusToasts } from '@/hooks/useNetworkStatusToasts/useNetworkStatusToasts';
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate/useServiceWorkerUpdate';

/**
 * PwaManager
 *
 * No-UI organism (same role as CoordinatorsManager) that mounts the installed-app
 * lifecycle hooks once: the service worker update flow (registration itself belongs to
 * ServiceWorkerRegistrationProvider), offline /
 * online toasts, the unread app badge, and the install-prompt capture.
 *
 * Mounted outside RouteGuardProvider and DatabaseProvider so it runs on every route
 * and while those providers show their spinners; none of the hooks need auth or Dexie.
 * See `docs/pwa.md`.
 */
export function PwaManager() {
  useServiceWorkerUpdate();
  useNetworkStatusToasts();
  useAppBadge();
  useInstallPromptLifecycle();
  return null;
}
