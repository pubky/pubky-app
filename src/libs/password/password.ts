export interface PasswordStrengthResult {
  strength: number;
  checks: {
    length: boolean;
    lowercase: boolean;
    uppercase: boolean;
    numbers: boolean;
    symbols: boolean;
  };
  percentage: number;
}

/** Minimum length to consider as passphrase (≈80 bits). */
export const PASSPHRASE_MIN_LENGTH = 16;

/**
 * Long passphrases (e.g. "logic finite eager ratio") are more secure than short
 * complex passwords. See https://www.useapassphrase.com/
 */
function isPassphraseLike(input: string): boolean {
  if (input.length < PASSPHRASE_MIN_LENGTH) return false;
  const hasSpace = input.includes(' ');
  const isLongLettersAndSpaces = /^[\sa-zA-Z]+$/.test(input);
  return hasSpace || isLongLettersAndSpaces;
}

function passphraseStrengthByLength(length: number): number {
  if (length >= 24) return 5;
  if (length >= 20) return 4;
  return 3; // 16–19
}

export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    numbers: /\d/.test(password),
    symbols: /[!@#$%^&*()_+\-_=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  if (!password.length) {
    return {
      strength: 0,
      checks: { length: false, lowercase: false, uppercase: false, numbers: false, symbols: false },
      percentage: 0,
    };
  }

  if (isPassphraseLike(password)) {
    const strength = passphraseStrengthByLength(password.length);
    return {
      strength,
      checks: { ...checks, length: true },
      percentage: (strength / 5) * 100,
    };
  }

  let strength = 0;
  Object.values(checks).forEach((check) => {
    if (check) strength++;
  });

  return {
    strength,
    checks,
    percentage: (strength / 5) * 100,
  };
}
