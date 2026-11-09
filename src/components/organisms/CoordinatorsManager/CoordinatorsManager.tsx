'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { HomeserverEventStreamCoordinator } from '@/coordinators/homeserver-event-stream/homeserver-event-stream';
import { MuteListSyncCoordinator } from '@/coordinators/mute-list-sync/mute-list-sync';
import { NotificationLastReadSyncCoordinator } from '@/coordinators/notification-last-read-sync/notification-last-read-sync';
import { NotificationCoordinator } from '@/coordinators/notifications/notifications';
import { StreamCoordinator } from '@/coordinators/streams/stream';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';

function getAppCoordinators() {
  return {
    notification: NotificationCoordinator.getInstance(),
    stream: StreamCoordinator.getInstance(),
    ttl: TtlCoordinator.getInstance(),
    homeserverEventStream: HomeserverEventStreamCoordinator.getInstance(),
    muteListSync: MuteListSyncCoordinator.getInstance(),
    notificationLastReadSync: NotificationLastReadSyncCoordinator.getInstance(),
  };
}

function applyRouteToCoordinators(pathname: string): void {
  const coordinators = getAppCoordinators();
  void coordinators.notification.setRoute(pathname);
  void coordinators.stream.setRoute(pathname);
  coordinators.homeserverEventStream.setRoute(pathname);
}

function startAppCoordinators(): void {
  const coordinators = getAppCoordinators();
  void coordinators.notification.start();
  void coordinators.stream.start();
  coordinators.ttl.start();
  // Channels register first, so the shared stream's first connection already carries every ready path.
  coordinators.muteListSync.start();
  coordinators.notificationLastReadSync.start();
  coordinators.homeserverEventStream.start();
}

function stopAppCoordinators(): void {
  const coordinators = getAppCoordinators();
  coordinators.notification.stop();
  coordinators.stream.stop();
  coordinators.ttl.stop();
  coordinators.homeserverEventStream.stop();
  coordinators.muteListSync.stop();
  coordinators.notificationLastReadSync.stop();
}

/**
 * CoordinatorsManager
 *
 * Centralized component that initializes and manages the coordinators layer lifecycle.
 * This component has no UI - it only manages coordinator lifecycles.
 *
 * Responsibilities:
 * - Initialize coordinators on mount (NotificationCoordinator, StreamCoordinator, TtlCoordinator,
 *   HomeserverEventStreamCoordinator and its channels MuteListSyncCoordinator, NotificationLastReadSyncCoordinator)
 * - Start coordination when the component is mounted
 * - Track route changes and inform coordinators
 * - Stop coordination and cleanup when unmounted
 *
 * Architecture:
 * This component bridges React lifecycle with the coordinators layer:
 *
 * i.e. CoordinatorsManager (UI) → Coordinators → Controllers → Application → Services
 */
export function CoordinatorsManager() {
  const pathname = usePathname();

  // Apply route before start() on mount so route-based coordinators see the real pathname immediately.
  useEffect(() => {
    applyRouteToCoordinators(pathname);
  }, [pathname]);

  useEffect(() => {
    startAppCoordinators();
    return () => {
      stopAppCoordinators();
    };
  }, []);

  return null;
}
