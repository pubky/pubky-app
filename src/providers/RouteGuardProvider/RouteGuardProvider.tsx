'use client';

import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { isDynamicPublicRoute, matchesAllowedRoute, PUBLIC_ROUTES } from '@/app/routes';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { AuthController } from '@/controllers/auth/auth';
import { MigrationController } from '@/controllers/migration/migration';
import { useAuthStatus } from '@/hooks/useAuthStatus/useAuthStatus';
import { AuthStatus } from '@/hooks/useAuthStatus/useAuthStatus.types';
import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { ROUTE_ACCESS_MAP } from '@/providers/RouteGuardProvider/RouteGuardProvider.constants';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useMigrationStore } from '@/stores/migration/migration.store';

// Migration resync timeout in milliseconds
const MIGRATION_RESYNC_TIMEOUT_MS = 10_000;

interface RouteGuardProviderProps {
  children: ReactNode;
}

/**
 * RouteGuardProvider protects routes based on user authentication status.
 *
 * This provider:
 * - Checks if the current route is accessible for the user's auth status
 * - Redirects unauthorized users to appropriate default routes
 * - Shows loading states while determining access permissions
 * - Allows public routes to be accessed by anyone
 * - Allows dynamic public routes (/post/[x]/[y], /profile/[pubky]) without auth
 *
 * Route access is configured via ROUTE_ACCESS_MAP which maps:
 * - UNAUTHENTICATED users → onboarding/auth routes
 * - AUTHENTICATED users → app routes (feed, profile, etc.)
 * - NEEDS_PROFILE_CREATION users → profile creation route
 */
export function RouteGuardProvider({ children }: RouteGuardProviderProps) {
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const { status, isLoading } = useAuthStatus();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const session = useAuthStore((state) => state.session);
  const sessionExport = useAuthStore((state) => state.sessionExport);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const wasDbReset = useMigrationStore((state) => state.wasDbReset);

  // Prevents running resync more than once at a time (ex: React Strict Mode and effect re-fires mid-resync)
  const isMigrationResyncRunningRef = useRef(false);

  // Attempt to restore an existing session snapshot on fresh loads.
  useEffect(() => {
    if (!hasHydrated) return;
    if (session) return;
    if (!sessionExport) return;
    AuthController.restorePersistedSession().catch((error) => {
      Logger.error('[RouteGuardProvider] Failed to restore persisted session', { error });
    });
  }, [hasHydrated, session, sessionExport]);

  // Post-migration re-sync: fetch critical homeserver data after DB recreation
  // TODO: Consider using BroadcastChannel to notify other browser tabs when DB was recreated / resync completed
  useEffect(() => {
    if (!wasDbReset) return; // No need to resync if the DB was NOT reset
    if (!hasHydrated) return; // No need to resync if the app has NOT hydrated
    if (isMigrationResyncRunningRef.current) return; // No need to resync if the resync is ALREADY running
    if (!currentUserPubky) {
      // No need to resync if the user is NOT logged in
      useMigrationStore.getState().reset();
      return;
    }

    isMigrationResyncRunningRef.current = true;

    const runResync = async () => {
      const startedAt = Date.now();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        // Bound how long we wait for the post-migration resync.
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'DB re-sync timed out', {
                  service: ErrorService.Local,
                  operation: 'migrationResync',
                }),
              ),
            MIGRATION_RESYNC_TIMEOUT_MS,
          );
        });
        // Unblock the app when either resync finishes or the timeout fires.
        await Promise.race([MigrationController.resync(currentUserPubky), timeoutPromise]);
      } catch (error) {
        Logger.warn('Migration re-sync degraded', {
          error,
          pubky: currentUserPubky,
          durationMs: Date.now() - startedAt,
        });
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        useMigrationStore.getState().reset();
        isMigrationResyncRunningRef.current = false;
      }
    };

    runResync();
  }, [wasDbReset, hasHydrated, currentUserPubky]);

  // Determine if the current route is accessible based on authentication status
  const isRouteAccessible = useMemo(() => {
    // Static public routes are ALWAYS accessible, even during loading
    if (PUBLIC_ROUTES.includes(pathname)) return true;

    // Dynamic public routes (e.g., /post/[x]/[y], /profile/[pubky]) are also always accessible
    if (isDynamicPublicRoute(pathname)) return true;

    // Wait for authentication status to be determined before allowing access to protected routes
    if (isLoading) return false;

    // Get the allowed routes for the current authentication status
    const routeAccess = ROUTE_ACCESS_MAP[status];

    // Explore routes match exactly for guests only; authenticated users keep prefix access.
    const restrictExploreSubRoutes = status === AuthStatus.UNAUTHENTICATED;

    return routeAccess.allowedRoutes.some((route) =>
      matchesAllowedRoute(pathname, route, { restrictExploreSubRoutes }),
    );
  }, [isLoading, pathname, status]);

  // Handle automatic redirects when user tries to access unauthorized routes
  useEffect(() => {
    // Static public routes never redirect
    if (PUBLIC_ROUTES.includes(pathname)) return;

    // Dynamic public routes never redirect
    if (isDynamicPublicRoute(pathname)) return;

    // Wait for authentication status to be determined for protected routes
    if (isLoading) return;

    // No redirect needed if user has access to current route
    if (isRouteAccessible) return;

    // Redirect user to the appropriate default route for their authentication status
    const routeAccess = ROUTE_ACCESS_MAP[status];
    const redirectTo = routeAccess.redirectTo;

    // Runtime validation: ensure redirect target is actually in allowed routes
    if (redirectTo && !routeAccess.allowedRoutes.includes(redirectTo)) {
      Logger.error(
        `RouteGuard configuration error: redirectTo "${redirectTo}" is not in allowedRoutes for status "${status}"`,
      );
      return;
    }

    // Only redirect if we have a target and we're not already there
    if (redirectTo && pathname !== redirectTo) {
      router.push(redirectTo);
    }
  }, [status, pathname, router, isLoading, isRouteAccessible]);

  // Show loading spinner while:
  // 1. Authentication status is being determined (isLoading = true)
  // 2. Route access check has completed but user doesn't have access (will trigger redirect)
  // 3. Migration re-sync is in progress (wasDbReset = true)
  if (!isRouteAccessible || wasDbReset) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto" />
          <p className="mt-2 text-muted-foreground">{isLoading || wasDbReset ? t('loading') : t('redirecting')}</p>
        </div>
      </div>
    );
  }

  // Render the protected content only when user has confirmed access
  return <>{children}</>;
}
