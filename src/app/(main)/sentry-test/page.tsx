import { notFound } from 'next/navigation';
import { isSentryTestHarnessEnabled } from '@/libs/observability/sentry-test-harness';
import { SentryTestHarness } from './SentryTestHarness';

/**
 * Sentry verification harness — reachable on dev/preview/staging, 404 in production.
 *
 * Gating reads the runtime Sentry environment, which only exists at request time
 * (PUBKY_RUNTIME_*). Force dynamic rendering so the gate is evaluated per request and never
 * baked into a static page at build time (where it would always resolve to production).
 */
export const dynamic = 'force-dynamic';

export default function SentryTestPage() {
  if (!isSentryTestHarnessEnabled()) {
    notFound();
  }

  return <SentryTestHarness />;
}
