import { getPulseClientKey } from '@/libs/runtime-config/runtime-config';

// Version the choice when the disclosed purposes change. This is not an analytics identifier.
export const PULSE_CONSENT_KEY = 'pubky-pulse-consent-v1';
const CONSENT_CHANGED = 'pubky-pulse-consent-changed';
export type PulseConsent = 'accepted' | 'declined' | 'unavailable' | null;
let declinedInMemory = false;

export function getPulseConsent(): PulseConsent {
  try {
    if (typeof window === 'undefined' || !getPulseClientKey()?.trim()) return 'unavailable';
  } catch {
    return 'unavailable';
  }
  try {
    if (declinedInMemory) return 'declined';
    const choice = window.localStorage.getItem(PULSE_CONSENT_KEY);
    return choice === 'accepted' || choice === 'declined' ? choice : null;
  } catch {
    // Storage failures never imply consent.
    return null;
  }
}

export function setPulseConsent(accepted: boolean): boolean {
  declinedInMemory = !accepted;
  let saved = false;
  try {
    window.localStorage.setItem(PULSE_CONSENT_KEY, accepted ? 'accepted' : 'declined');
    saved = true;
  } catch {
    declinedInMemory = true;
    try {
      window.localStorage.removeItem(PULSE_CONSENT_KEY);
    } catch {
      // Keep this page opted out even if the previous choice cannot be removed.
    }
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED));
  return saved;
}

export function subscribePulseConsent(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== PULSE_CONSENT_KEY) return;
    declinedInMemory = false;
    onChange();
  };
  window.addEventListener(CONSENT_CHANGED, onChange);
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', onChange);
  window.addEventListener('focus', onChange);
  return () => {
    window.removeEventListener(CONSENT_CHANGED, onChange);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', onChange);
    window.removeEventListener('focus', onChange);
  };
}
