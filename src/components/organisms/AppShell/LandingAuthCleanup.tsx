'use client';

import { useEffect } from 'react';
import { AuthCoordinator } from '@/coordinators/auth/auth';

/** Retire credentials alongside the public page so cleanup cannot replace an active sign-in button. */
export function LandingAuthCleanup() {
  useEffect(() => AuthCoordinator.getInstance().watchGuestCleanup(), []);
  return null;
}
