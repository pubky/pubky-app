import * as Sentry from '@sentry/nextjs';
import { getSentryInitBase, shouldEnableSentry } from '@/libs/observability/sentry';

if (shouldEnableSentry()) {
  Sentry.init({
    ...getSentryInitBase(),
    includeLocalVariables: false,
  });
}
