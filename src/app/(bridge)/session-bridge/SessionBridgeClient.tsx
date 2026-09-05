'use client';

import { useLayoutEffect } from 'react';
import { installSessionBridgeListeners } from '@/libs/session-bridge/install';

export function SessionBridgeClient() {
  useLayoutEffect(() => {
    return installSessionBridgeListeners();
  }, []);

  return <p>This page lets approved Pubky apps reuse your session. Nothing to do here.</p>;
}
