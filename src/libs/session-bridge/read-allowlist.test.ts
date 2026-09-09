import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  defaultSessionBridgeAllowedOrigins,
  formatInvalidSessionBridgeAllowlistError,
  parseSessionBridgeAllowlist,
} from './allowlist';
import { readSessionBridgeAllowlistFromEnv } from './read-allowlist';

const sessionBridgeDir = dirname(fileURLToPath(import.meta.url));

describe('readSessionBridgeAllowlistFromEnv', () => {
  it('parses the inlined public env the same way as parseSessionBridgeAllowlist', () => {
    expect(readSessionBridgeAllowlistFromEnv()).toEqual(
      parseSessionBridgeAllowlist(process.env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS),
    );
    expect(readSessionBridgeAllowlistFromEnv()).toEqual(
      parseSessionBridgeAllowlist(defaultSessionBridgeAllowedOrigins()),
    );
  });

  it('throws on invalid entries with the shared error', () => {
    const previous = process.env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS;
    process.env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS = '*';
    try {
      expect(() => readSessionBridgeAllowlistFromEnv()).toThrow(formatInvalidSessionBridgeAllowlistError(['*']));
    } finally {
      process.env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS = previous;
    }
  });

  it('does not import Env, Zod, or Sentry from the isolated reader or install path', () => {
    for (const file of ['read-allowlist.ts', 'install.ts', 'allowlist.ts']) {
      const source = readFileSync(join(sessionBridgeDir, file), 'utf8');
      expect(source).not.toMatch(/from ['"]@\/libs\/env\/env['"]/);
      expect(source).not.toMatch(/from ['"]zod['"]/);
      expect(source).not.toMatch(/from ['"]@sentry\//);
    }
  });
});
