import '@testing-library/jest-dom';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
// Import English messages for i18n mock
import enMessages from '../../messages/en.json';

// =============================================================================
// IMPORTANT: Set environment variables BEFORE importing any app code
// =============================================================================
// The Env singleton in @/libs/env/env is parsed at module load time.
// If we import from @/libs/utils/utils before setting process.env, the import chain
// (@/libs/utils/utils -> @/config/<module> -> @/libs/env/env) will initialize Env with wrong values.
// See: https://github.com/pubky/pubky-app/issues/1101

process.env.NEXT_PUBLIC_DB_VERSION = '1';
process.env.NEXT_PUBLIC_DEBUG_MODE = 'false';
process.env.NEXT_PUBLIC_NEXUS_URL = 'https://nexus.staging.pubky.app';
process.env.NEXT_PUBLIC_CDN_URL = 'https://nexus.staging.pubky.app/static';
// Server-side only admin credentials (not exposed to client)
process.env.HOMESERVER_ADMIN_URL = 'http://localhost:6288/generate_signup_token';
process.env.HOMESERVER_ADMIN_PASSWORD = 'admin';
process.env.NEXT_PUBLIC_TESTNET = 'true';
process.env.NEXT_PUBLIC_PKARR_RELAYS = '["http://localhost:8080"]';
process.env.NEXT_PUBLIC_HOMESERVER = 'test-homeserver-key';
process.env.NEXT_PUBLIC_HOMESERVER_URL = 'http://localhost:6286';
process.env.NEXT_PUBLIC_MODERATION_ID = 'euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro';
process.env.NEXT_PUBLIC_MODERATED_TAGS = '["nudity"]';
process.env.NEXT_PUBLIC_EXCHANGE_RATE_API = 'https://api1.blocktank.to/api/fx/rates/btc';
process.env.NEXT_PUBLIC_HOMEGATE_URL = 'https://localhost:5000/';
process.env.NEXT_PUBLIC_DEFAULT_HTTP_RELAY = 'http://localhost:15412/inbox/';
process.env.NEXT_PUBLIC_APP_VERSION = '0.0.0-test';

// Chatwoot configuration (required for feedback feature)
process.env.BASE_URL_SUPPORT = 'https://chatwoot.example.com';
process.env.SUPPORT_API_ACCESS_TOKEN = 'test-token';
process.env.SUPPORT_ACCOUNT_ID = '123';
process.env.SUPPORT_FEEDBACK_INBOX_ID = '26';

// =============================================================================
// NOW we can safely import app code that depends on Env
// =============================================================================

const { db } = await import('@/database/franky/franky');

// Global snapshot serializer to normalize Radix UI generated IDs
// This ensures snapshot tests are consistent across test runs
// See: https://github.com/pubky/pubky-app/issues/1101
const { radixIdSerializer } = await import('@/libs/utils/utils');
expect.addSnapshotSerializer(radixIdSerializer);

/**
 * Get a nested value from an object using a dot-separated key path.
 * @param obj - The object to search in
 * @param path - The dot-separated key path (e.g., "common.back")
 * @returns The value at the path, or undefined if not found
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Create a translation function that looks up keys in the messages object.
 * Supports interpolation of variables in the format {variable}.
 */
function createTranslationFunction(namespace: string) {
  const t = (key: string, params?: Record<string, string | number>): string => {
    const fullPath = namespace ? `${namespace}.${key}` : key;
    const value = getNestedValue(enMessages as Record<string, unknown>, fullPath);

    if (typeof value === 'string') {
      // Handle interpolation
      if (params) {
        return Object.entries(params).reduce((str, [paramKey, paramValue]) => {
          return str.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
        }, value);
      }
      return value;
    }

    // Return the key if not found
    return key;
  };

  // Add raw method for accessing arrays or objects directly
  t.raw = (key: string): unknown => {
    const fullPath = namespace ? `${namespace}.${key}` : key;
    return getNestedValue(enMessages as Record<string, unknown>, fullPath) ?? key;
  };

  // Add rich method for formatted text with rich text tags support
  t.rich = (
    key: string,
    values?: Record<string, string | number | ((chunks: React.ReactNode) => React.ReactNode)>,
  ): React.ReactNode => {
    const fullPath = namespace ? `${namespace}.${key}` : key;
    const value = getNestedValue(enMessages as Record<string, unknown>, fullPath);

    if (typeof value !== 'string') {
      return key;
    }

    // If no values with render functions, just return the plain string
    if (!values) {
      return value;
    }

    // Check if there are any render functions in values
    const renderFunctions = Object.entries(values).filter(([, v]) => typeof v === 'function') as [
      string,
      (chunks: React.ReactNode) => React.ReactNode,
    ][];

    if (renderFunctions.length === 0) {
      // Just handle interpolation for non-function values
      return Object.entries(values).reduce((str, [paramKey, paramValue]) => {
        return str.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      }, value);
    }

    // Parse rich text tags and apply render functions
    // This handles patterns like <tagName>content</tagName>
    let result: React.ReactNode = value;

    for (const [tagName, renderFn] of renderFunctions) {
      const tagPattern = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'g');
      const str = typeof result === 'string' ? result : String(result);

      // Check if there's a match
      const match = tagPattern.exec(str);
      if (match) {
        const [fullMatch, content] = match;
        const parts = str.split(fullMatch);

        // Build React nodes array
        const nodes: React.ReactNode[] = [];
        if (parts[0]) nodes.push(parts[0]);
        nodes.push(renderFn(content));
        if (parts[1]) nodes.push(parts[1]);

        // If multiple nodes, wrap in fragment-like array with keys
        if (nodes.length === 1) {
          result = nodes[0];
        } else {
          // For testing, we return an array which React can render
          result = nodes.map((node, i) => {
            // Leave strings and primitives as-is
            if (typeof node === 'string' || typeof node === 'number' || node === null || node === undefined) {
              return node;
            }
            // Use React.cloneElement for valid React elements to add keys
            if (React.isValidElement(node)) {
              return React.cloneElement(node, { key: i });
            }
            // For other objects (edge case), return as-is
            return node;
          });
        }
      }
    }

    return result;
  };

  // Add markup method (returns same as t for testing)
  t.markup = t;

  return t;
}

// Mock next-intl globally for all tests
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => createTranslationFunction(namespace ?? ''),
  useLocale: () => 'en',
  useMessages: () => enMessages,
  useTimeZone: () => 'UTC',
  useNow: () => new Date(),
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString(),
    number: (num: number) => String(num),
    relativeTime: () => 'now',
  }),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Polyfill IntersectionObserver for jsdom
class MockIntersectionObserver implements IntersectionObserver {
  constructor() {}
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '0px';
  readonly thresholds: ReadonlyArray<number> = [0];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// Polyfill ResizeObserver for jsdom
class MockResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  private callback: ResizeObserverCallback;
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Mock URL.createObjectURL and URL.revokeObjectURL for jsdom
URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();

// Assign to globals for jsdom
(globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver =
  MockIntersectionObserver;
(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;

if (typeof window !== 'undefined') {
  (window as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver =
    MockIntersectionObserver;
  (window as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;
}

// Suppress specific WebAssembly and navigation warnings
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  const message = args.join(' ');
  // Suppress WebAssembly errors
  if (
    message.includes('WebAssembly') ||
    message.includes('application/wasm') ||
    message.includes('MIME type') ||
    message.includes('Not implemented: navigation')
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  const message = args.join(' ');
  // Suppress WebAssembly warnings
  if (message.includes('WebAssembly') || message.includes('application/wasm') || message.includes('MIME type')) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

// Capture unhandled rejections of WebAssembly
process.on('unhandledRejection', (reason) => {
  const reasonStr = String(reason);
  // Suppress only WebAssembly errors
  if (reasonStr.includes('WebAssembly') || reasonStr.includes('expected 4 bytes, fell off end')) {
    return; // Suppress this specific type of error
  }
  // Re-throw other errors to not mask real problems
  throw reason;
});

// Mock global fetch to prevent undici errors
global.fetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }),
);

// Mock Next.js font imports
vi.mock('next/font/google', () => ({
  Inter_Tight: vi.fn(() => ({
    variable: '--font-geist-sans',
    className: 'inter-tight',
  })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeAll(async () => {
  await db.initialize();
});

afterAll(async () => {
  await db.delete();
});

beforeEach(async () => {
  await db.delete();
  await db.initialize();
});
