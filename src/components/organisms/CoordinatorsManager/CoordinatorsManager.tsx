'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { NotificationCoordinator } from '@/coordinators/notifications/notifications';
import { StreamCoordinator } from '@/coordinators/streams/stream';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';

/**
 * CoordinatorsManager
 *
 * Centralized component that initializes and manages the coordinators layer lifecycle.
 * This component has no UI - it only manages coordinator lifecycles.
 *
 * Responsibilities:
 * - Initialize coordinators on mount (NotificationCoordinator, StreamCoordinator)
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

  // Start coordinators on mount, stop on unmount
  useEffect(() => {
    const notificationCoordinator = NotificationCoordinator.getInstance();
    const streamCoordinator = StreamCoordinator.getInstance();
    const ttlCoordinator = TtlCoordinator.getInstance();

    // Start the coordinators
    notificationCoordinator.start();
    streamCoordinator.start();
    ttlCoordinator.start();

    // Cleanup: stop coordinators when component unmounts
    return () => {
      notificationCoordinator.stop();
      streamCoordinator.stop();
      ttlCoordinator.stop();
    };
  }, []);

  // Update coordinators with current route for route-based activation/deactivation
  useEffect(() => {
    const notificationCoordinator = NotificationCoordinator.getInstance();
    const streamCoordinator = StreamCoordinator.getInstance();
    const ttlCoordinator = TtlCoordinator.getInstance();

    notificationCoordinator.setRoute(pathname);
    streamCoordinator.setRoute(pathname);
    ttlCoordinator.setRoute(pathname);
  }, [pathname]);

  // This component has no UI - it only manages coordinator lifecycles
  return null;
}
