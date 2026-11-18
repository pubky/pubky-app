import type { ReactNode } from 'react';
import { Spinner } from '@/atoms/Spinner/Spinner';
import {
  AUTH_MIGRATION_KEY,
  AUTH_PERSIST_KEY,
  LEGACY_AUTH_PERSIST_KEY,
  PREVIOUS_AUTH_MIGRATION_KEY,
  PREVIOUS_AUTH_PERSIST_KEY,
} from '@/stores/persistedKeys';

// The HTML parser runs this before it reaches the guest controls. Keep the function self-contained:
// only its source and the public storage key names are sent to the browser.
function markSavedLandingAccount(
  script: Element,
  currentKey: string,
  migratedKey: string,
  previousKey: string,
  previousMigratedKey: string,
  legacyKey: string,
) {
  try {
    let raw = localStorage.getItem(currentKey);
    if (raw === null && !localStorage.getItem(migratedKey)) {
      raw = localStorage.getItem(previousKey);
      if (raw === null && !localStorage.getItem(previousMigratedKey)) raw = localStorage.getItem(legacyKey);
    }
    const state = raw && JSON.parse(raw).state;
    script.toggleAttribute(
      'data-saved-account',
      Boolean(state?.currentUserPubky || state?.sessionReference?.kind === 'grant'),
    );
  } catch {
    // The hydrated auth guard handles unavailable storage and damaged records.
  }
}

const storageKeys = [
  AUTH_PERSIST_KEY,
  AUTH_MIGRATION_KEY,
  PREVIOUS_AUTH_PERSIST_KEY,
  PREVIOUS_AUTH_MIGRATION_KEY,
  LEGACY_AUTH_PERSIST_KEY,
] as const;
const firstPaintScript = `(${markSavedLandingAccount})(document.currentScript,...${JSON.stringify(storageKeys)})`;

// Client navigation inserts an inert script. Apply the same hint in the commit before the browser paints.
function markClientLanding(script: HTMLScriptElement | null) {
  if (script) markSavedLandingAccount(script, ...storageKeys);
}

export function PublicLanding({ checking, children }: { checking: boolean; children: ReactNode }) {
  return (
    <>
      {checking && (
        <script
          ref={markClientLanding}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: firstPaintScript }}
        />
      )}
      {checking && (
        <div className="landing-account-spinner min-h-screen items-center justify-center">
          <Spinner />
        </div>
      )}
      <div className="landing-public-content contents">{children}</div>
    </>
  );
}
