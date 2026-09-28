'use client';

import { useEffect, useState } from 'react';
import { isPassportConfigured } from '@/config/network';
import { Logger } from '@/libs/logger/logger';
import type { PassportEligibility } from './usePassportEligibility.types';

const HTTPS_PROTOCOL = 'https:';

let didWarnInsecureOrigin = false;

/** Test-only: allow the one-time warning to fire again. */
export function resetPassportEligibilityWarningForTests(): void {
  didWarnInsecureOrigin = false;
}

/**
 * Resolve, after mount, whether the page may offer "Continue with Google" (Pubky Passport).
 *
 * The value is `'pending'` during server rendering and the first client render so both sides
 * produce identical markup; an effect then resolves it from runtime config plus the page
 * protocol. Consumers render nothing Passport-related until `'enabled'`, and only act on a
 * resolved `'disabled'` (never on `'pending'`).
 *
 * Passport requires HTTPS callbacks, so plain `npm run dev` on `http://localhost` is reported as
 * `'disabled'` with a single console warning pointing at `npm run dev:https`.
 */
export function usePassportEligibility(): PassportEligibility {
  const [eligibility, setEligibility] = useState<PassportEligibility>('pending');

  useEffect(() => {
    if (!isPassportConfigured()) {
      setEligibility('disabled');
      return;
    }

    const isSecure = window.location.protocol === HTTPS_PROTOCOL;
    if (!isSecure && !didWarnInsecureOrigin) {
      didWarnInsecureOrigin = true;
      Logger.warn(
        'Pubky Passport is configured but this page is not served over HTTPS; Passport requires HTTPS callbacks. Run `npm run dev:https` to use "Continue with Google" locally.',
      );
    }
    setEligibility(isSecure ? 'enabled' : 'disabled');
  }, []);

  return eligibility;
}
