'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { HomeserverEventStreamCoordinator } from '@/coordinators/homeserver-event-stream/homeserver-event-stream';
import { MuteListSyncCoordinator } from '@/coordinators/mute-list-sync/mute-list-sync';
import { NotificationLastReadPollCoordinator } from '@/coordinators/notification-last-read-poll/notification-last-read-poll';
import { NotificationCoordinator } from '@/coordinators/notifications/notifications';
import { StreamCoordinator } from '@/coordinators/streams/stream';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import { useAuthStatus } from '@/hooks/useAuthStatus/useAuthStatus';
import { AuthStatus } from '@/hooks/useAuthStatus/useAuthStatus.types';

function getAppCoordinators() {
  return {
    notification: NotificationCoordinator.getInstance(),
    stream: StreamCoordinator.getInstance(),
    ttl: TtlCoordinator.getInstance(),
    homeserverEventStream: HomeserverEventStreamCoordinator.getInstance(),
    muteListSync: MuteListSyncCoordinator.getInstance(),
    notificationLastReadPoll: NotificationLastReadPollCoordinator.getInstance(),
  };
}

function applyRouteToCoordinators(pathname: string): void {
  const coordinators = getAppCoordinators();
  void coordinators.notification.setRoute(pathname);
  void coordinators.stream.setRoute(pathname);
  void coordinators.muteListSync.setRoute(pathname);
  void coordinators.notificationLastReadPoll.setRoute(pathname);
  coordinators.homeserverEventStream.setRoute(pathname);
}

function startAppCoordinators(): void {
  const coordinators = getAppCoordinators();
  void coordinators.notification.start();
  void coordinators.stream.start();
  coordinators.ttl.start();
  // The mute list and the notification `last_read` poll (ADR-0014, ADR-0029). No channel registers with the shared
  // stream on the social v1 tree, so it opens no request: the mute directory and `last_read` are private, and a
  // session-bound stream deadlocks the SDK's bearer refresh. `NotificationLastReadSyncCoordinator`, the channel that
  // follows the public 0.x file, stays in the tree unregistered: it replaces the poller once the SDK releases the
  // session lock for streams (pubky/pubky-homeserver#798).
  void coordinators.muteListSync.start();
  void coordinators.notificationLastReadPoll.start();
  coordinators.homeserverEventStream.start();
}

function stopAppCoordinators(): void {
  const coordinators = getAppCoordinators();
  coordinators.notification.stop();
  coordinators.stream.stop();
  coordinators.ttl.stop();
  coordinators.homeserverEventStream.stop();
  coordinators.muteListSync.stop();
  coordinators.notificationLastReadPoll.stop();
}

/**
 * CoordinatorsManager
 *
 * Centralized component that initializes and manages the coordinators layer lifecycle.
 * This component has no UI - it only manages coordinator lifecycles.
 *
 * Responsibilities:
 * - Initialize coordinators on mount (NotificationCoordinator, StreamCoordinator,
 *   MuteListSyncCoordinator, NotificationLastReadPollCoordinator, TtlCoordinator, HomeserverEventStreamCoordinator)
 * - Start coordination when the component is mounted, except while the account is held behind
 *   the social v1 migration gate: the stream coordinator keys on the persisted pubky and would
 *   read as the account before its data is migrated (ADR-0026); they start once the gate passes
 * - Track route changes and inform coordinators
 * - Stop coordination and cleanup when unmounted or when the gate takes over
 *
 * Architecture:
 * This component bridges React lifecycle with the coordinators layer:
 *
 * i.e. CoordinatorsManager (UI) → Coordinators → Controllers → Application → Services
 */
export function CoordinatorsManager() {
  const pathname = usePathname();
  const isGated = useAuthStatus().status === AuthStatus.NEEDS_SOCIAL_MIGRATION;

  // Apply route before start() on mount so route-based coordinators see the real pathname immediately.
  useEffect(() => {
    applyRouteToCoordinators(pathname);
  }, [pathname]);

  useEffect(() => {
    if (isGated) return;
    startAppCoordinators();
    return () => {
      stopAppCoordinators();
    };
  }, [isGated]);

  return null;
}
