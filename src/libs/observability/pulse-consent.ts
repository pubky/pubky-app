import { getPulseClientKey, getTestnet } from '@/libs/runtime-config/runtime-config';

// Version the choice when the disclosed purposes change. This is not an analytics identifier.
export const PULSE_CONSENT_KEY = 'pubky-pulse-consent-v1';
// When consent was last given: written only by accepting, never sent, and not an analytics identifier.
// It lets a tab that slept through a withdrawal and a re-acceptance see that its Pulse state predates
// the current consent, which re-reading the choice alone can never reveal.
export const PULSE_CONSENT_GRANTED_AT_KEY = 'pubky-pulse-consent-v1-granted-at';
const CONSENT_CHANGED = 'pubky-pulse-consent-changed';
export type PulseConsent = 'accepted' | 'declined' | 'unavailable' | null;
let declinedInMemory = false;
// The last write failed, so the choice is stored nowhere. This belongs beside the choice rather than in a
// component: the banner and the Privacy switch are separate hook instances, and a write that does store a
// choice makes the error describe nothing, wherever it came from.
let saveFailed = false;

export function getPulseConsent(): PulseConsent {
  try {
    // A testnet deploy sends no telemetry, the same rule shouldEnableSentry() applies to Sentry (ADR 0018):
    // one image promoted to testnet must not collect. Gating availability here — not in initPulse() — keeps
    // the SDK, the banner and the settings switch off together.
    if (typeof window === 'undefined' || getTestnet() || !getPulseClientKey()?.trim()) return 'unavailable';
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

/** Whether this tab's last consent write failed. Cleared by the next write that does store a choice. */
export function getPulseConsentSaveFailed(): boolean {
  return saveFailed;
}

/** The acceptance time, '' when it is absent or unreadable. Never sent; it only orders consents. */
export function getPulseConsentGeneration(): string {
  try {
    return window.localStorage.getItem(PULSE_CONSENT_GRANTED_AT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setPulseConsent(accepted: boolean): boolean {
  declinedInMemory = !accepted;
  let saved = false;
  try {
    if (accepted) {
      // Strictly increasing, so a same-millisecond re-acceptance or a clock rollback still reads as newer.
      const previous = Number(window.localStorage.getItem(PULSE_CONSENT_GRANTED_AT_KEY));
      const next = Math.max(Date.now(), Number.isSafeInteger(previous) ? previous + 1 : 0);
      // Stamp before the choice: no tab may ever read 'accepted' beside an older acceptance time.
      window.localStorage.setItem(PULSE_CONSENT_GRANTED_AT_KEY, String(next));
    }
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
  // Before the notification: subscribers re-read their snapshots while it is dispatched.
  saveFailed = !saved;
  window.dispatchEvent(new Event(CONSENT_CHANGED));
  return saved;
}

export function subscribePulseConsent(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // Browsers fire no storage event for a same-value write, so a repeated Accept changes only the stamp.
    if (event.key !== null && event.key !== PULSE_CONSENT_KEY && event.key !== PULSE_CONSENT_GRANTED_AT_KEY) return;
    declinedInMemory = false;
    // Another tab stored a choice for this origin, so this page's failure no longer describes the storage.
    saveFailed = false;
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
