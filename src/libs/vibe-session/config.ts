import { Env } from '@/libs/env/env';

export function isVibeSessionConsumerEnabled(): boolean {
  return Boolean(Env.NEXT_PUBLIC_VIBE_SESSION_BRIDGE_ORIGIN);
}

export function getVibeSessionBridgeOrigin(): string | undefined {
  return Env.NEXT_PUBLIC_VIBE_SESSION_BRIDGE_ORIGIN;
}

export function getVibeId(): string | undefined {
  return Env.NEXT_PUBLIC_VIBE_ID;
}
