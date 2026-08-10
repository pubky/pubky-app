import '@testing-library/jest-dom';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

// =============================================================================
// IMPORTANT: Set environment variables BEFORE importing any app code
// =============================================================================
// The Env singleton in @/libs/env/env is parsed at module load time.
// If we import from @/libs/utils/utils before setting process.env, the import chain
// (@/libs/utils/utils -> @/config/<module> -> @/libs/env/env) will initialize Env with wrong values.
// See: https://github.com/pubky/pubky-app/issues/1101

process.env.NEXT_PUBLIC_DB_VERSION = '1';
process.env.NEXT_PUBLIC_DEBUG_MODE = 'false';
process.env.PUBKY_RUNTIME_NEXUS_URL = 'https://nexus.staging.pubky.app';
process.env.PUBKY_RUNTIME_CDN_URL = 'https://nexus.staging.pubky.app/static';
// Server-side only admin credentials (not exposed to client)
process.env.HOMESERVER_ADMIN_URL = 'http://localhost:6288/generate_signup_token';
process.env.HOMESERVER_ADMIN_PASSWORD = 'admin';
process.env.PUBKY_RUNTIME_TESTNET = 'true';
process.env.PUBKY_RUNTIME_PKARR_RELAYS = '["http://localhost:8080"]';
process.env.PUBKY_RUNTIME_HOMESERVER = 'test-homeserver-key';
process.env.PUBKY_RUNTIME_HOMESERVER_URL = 'http://localhost:6286';
process.env.PUBKY_RUNTIME_MODERATION_ID = 'euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro';
process.env.PUBKY_RUNTIME_MODERATED_TAGS = '["nudity"]';
process.env.PUBKY_RUNTIME_EXCHANGE_RATE_API = 'https://api1.blocktank.to/api/fx/rates/btc';
process.env.PUBKY_RUNTIME_HOMEGATE_URL = 'https://localhost:5000/';
process.env.PUBKY_RUNTIME_DEFAULT_HTTP_RELAY = 'http://localhost:15412/inbox/';
process.env.NEXT_PUBLIC_APP_VERSION = '0.0.0-test';

// Chatwoot configuration (required for feedback feature)
process.env.BASE_URL_SUPPORT = 'https://chatwoot.example.com';
process.env.SUPPORT_API_ACCESS_TOKEN = 'test-token';
process.env.SUPPORT_ACCOUNT_ID = '123';

// =============================================================================
// NOW we can safely import app code that depends on Env
// =============================================================================

const { db } = await import('@/database/franky/franky');

// Global snapshot serializer to normalize Radix UI generated IDs
// This ensures snapshot tests are consistent across test runs
// See: https://github.com/pubky/pubky-app/issues/1101
const { radixIdSerializer } = await import('@/libs/utils/utils');
expect.addSnapshotSerializer(radixIdSerializer);

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
