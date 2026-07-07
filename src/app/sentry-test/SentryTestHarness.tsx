'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AppWindow,
  CheckCircle2,
  FlaskConical,
  Loader2,
  type LucideIcon,
  MousePointerClick,
  Server,
  ServerCrash,
  ShieldAlert,
  ShieldCheck,
  Tags,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isSentryInitialized } from '@/libs/observability/sentry';
import { getSentryDiagnostics } from '@/libs/observability/sentry-test-harness';
import { toast } from '@/molecules/Toaster/use-toast';

type ServerTriggerType = 'unhandled' | 'factory';
type RequestState = 'idle' | 'loading' | 'ok' | 'error';
interface ServerStatus {
  state: RequestState;
  detail?: string;
}

function describeDsn(dsn: string | null): string {
  if (!dsn) return 'not configured';
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    return `${url.host}/${projectId}`;
  } catch {
    return 'configured';
  }
}

/** Throws during render so the route-segment boundary (`src/app/error.tsx`) captures it. */
function RenderCrash({ active }: { active: boolean }) {
  if (active) {
    throw new Error('Sentry client render test — safe to ignore (app/error.tsx boundary)');
  }
  return null;
}

function DiagnosticRow({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'default';
}) {
  const toneClass = tone === 'ok' ? 'text-brand' : tone === 'warn' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2 last:border-b-0">
      <Typography as="span" size="sm" className="text-muted-foreground">
        {label}
      </Typography>
      <Typography as="span" size="sm" className={`text-right font-mono break-all ${toneClass}`}>
        {value}
      </Typography>
    </div>
  );
}

function Trigger({
  icon: Icon,
  title,
  description,
  expected,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  expected: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <Typography as="span" size="sm" className="text-foreground">
            {title}
          </Typography>
          <Typography as="span" size="xs" className="text-muted-foreground">
            {description}
          </Typography>
          <Typography as="span" size="xs" className="text-muted-foreground">
            Expected: {expected}
          </Typography>
        </div>
      </div>
      <div className="shrink-0 sm:pl-4">{children}</div>
    </div>
  );
}

function StatusLabel({ status }: { status: ServerStatus }) {
  if (status.state === 'idle') return null;
  if (status.state === 'loading') {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="loading" />;
  }
  const Icon = status.state === 'ok' ? CheckCircle2 : XCircle;
  const color = status.state === 'ok' ? 'text-brand' : 'text-destructive';
  return (
    <span className={`flex items-center gap-1 ${color}`}>
      <Icon className="size-4" />
      <Typography as="span" size="xs" className={color}>
        {status.detail}
      </Typography>
    </span>
  );
}

export function SentryTestHarness() {
  const [diagnostics] = useState(getSentryDiagnostics);
  // Evaluated after mount (not during render) so SSR — where the SERVER SDK state would leak
  // into the markup — and the browser never disagree. By effect time instrumentation-client
  // has long run, so this reflects whether the BROWSER Sentry.init() actually happened.
  const [clientInitialized, setClientInitialized] = useState<boolean | null>(null);
  const [throwOnRender, setThrowOnRender] = useState(false);

  useEffect(() => {
    setClientInitialized(isSentryInitialized());
  }, []);
  const [serverStatus, setServerStatus] = useState<Record<ServerTriggerType, ServerStatus>>({
    unhandled: { state: 'idle' },
    factory: { state: 'idle' },
  });

  const triggerEventHandlerError = useCallback(() => {
    // Thrown synchronously in an event handler: React does not route this through error
    // boundaries — it surfaces to window.onerror, where Sentry's globalHandlers captures it.
    throw new Error('Sentry client unhandled test — safe to ignore (globalHandlers)');
  }, []);

  const triggerUnhandledRejection = useCallback(() => {
    // Intentionally unhandled → window.onunhandledrejection → Sentry globalHandlers.
    void Promise.reject(new Error('Sentry client unhandled rejection test — safe to ignore'));
    toast({ variant: 'info', description: 'Dispatched an unhandled promise rejection — check Sentry.' });
  }, []);

  const triggerClientFactory = useCallback(() => {
    try {
      // Captured exactly once at creation via captureAppError; caught here so the global
      // handler does not record a duplicate.
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Sentry client factory test — safe to ignore', {
        service: ErrorService.Local,
        operation: 'sentryTest.client.factory',
        context: { triggeredAt: new Date().toISOString() },
      });
    } catch {
      toast({
        variant: 'info',
        description: 'Captured AppError via Err.* funnel (1 tagged event: error.category=validation).',
      });
    }
  }, []);

  const callServer = useCallback(async (type: ServerTriggerType) => {
    setServerStatus((prev) => ({ ...prev, [type]: { state: 'loading' } }));
    try {
      const response = await fetch(`/api/sentry-test?type=${type}`, { cache: 'no-store' });
      // For the unhandled trigger a 500 IS the success case (the error propagated out of the
      // handler and was captured by onRequestError).
      const ok = type === 'unhandled' ? response.status === 500 : response.ok;
      const detail = `HTTP ${response.status}`;
      setServerStatus((prev) => ({ ...prev, [type]: { state: ok ? 'ok' : 'error', detail } }));
      toast({
        variant: ok ? 'info' : 'error',
        description: ok
          ? `Server "${type}" trigger fired (${detail}) — check Sentry for the event.`
          : `Unexpected response for "${type}" (${detail}).`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'request failed';
      setServerStatus((prev) => ({ ...prev, [type]: { state: 'error', detail } }));
      toast({ variant: 'error', description: `Server "${type}" request failed: ${detail}` });
    }
  }, []);

  const clientInitValue = clientInitialized === null ? 'checking…' : clientInitialized ? 'yes' : 'no';
  // Warn only when Sentry claims to be enabled yet the browser SDK never initialized.
  const clientInitTone = clientInitialized
    ? 'ok'
    : clientInitialized === false && diagnostics.enabled
      ? 'warn'
      : 'default';

  return (
    <Container size="md" className="gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-6 text-brand" />
          <Heading level={1} size="lg">
            Sentry verification harness
          </Heading>
        </div>
        <Typography size="md" className="text-muted-foreground">
          Trigger each capture path and confirm exactly one event appears in Sentry with a readable (source-mapped)
          stack trace. Every trigger below is a deliberate, safe-to-ignore test error.
        </Typography>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {diagnostics.enabled ? (
              <ShieldCheck className="size-5 text-brand" />
            ) : (
              <ShieldAlert className="size-5 text-destructive" />
            )}
            Runtime configuration
          </CardTitle>
          <CardDescription>Resolved Sentry settings for this deployment.</CardDescription>
        </CardHeader>
        <CardContent>
          <DiagnosticRow
            label="Sentry enabled"
            value={diagnostics.enabled ? 'yes' : 'no'}
            tone={diagnostics.enabled ? 'ok' : 'warn'}
          />
          <DiagnosticRow label="Client SDK initialized" value={clientInitValue} tone={clientInitTone} />
          <DiagnosticRow label="Environment" value={diagnostics.environment} />
          <DiagnosticRow label="Release" value={diagnostics.release} />
          <DiagnosticRow label="DSN" value={describeDsn(diagnostics.dsn)} tone={diagnostics.dsn ? 'default' : 'warn'} />
          <DiagnosticRow label="Traces sample rate" value={String(diagnostics.tracesSampleRate)} />
        </CardContent>
      </Card>

      {!diagnostics.enabled && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/8 p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <Typography size="sm" className="text-destructive">
            Sentry is disabled in this environment, so triggers will fire but no events are sent. Ensure a DSN is
            configured and testnet is off to validate capture.
          </Typography>
        </div>
      )}

      {diagnostics.enabled && clientInitialized === false && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/8 p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <Typography size="sm" className="text-destructive">
            Sentry is enabled but the browser SDK never initialized — browser triggers will send nothing. This means
            window.__PUBKY_CONFIG__ was not available when instrumentation-client.ts evaluated (runtime-config injection
            ordering is broken).
          </Typography>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Client-side (browser)</CardTitle>
          <CardDescription>Errors raised in the browser runtime.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Trigger
            icon={AppWindow}
            title="Render error"
            description="Throws during React render."
            expected="app/error.tsx boundary captures it (1 event); page shows the error screen — use “Try again” to return."
          >
            <Button type="button" variant={ButtonVariant.DESTRUCTIVE} onClick={() => setThrowOnRender(true)}>
              Throw in render
            </Button>
          </Trigger>

          <Trigger
            icon={MousePointerClick}
            title="Event handler error"
            description="Throws synchronously inside an onClick handler."
            expected="Sentry globalHandlers captures it (1 event)."
          >
            <Button type="button" variant={ButtonVariant.DESTRUCTIVE} onClick={triggerEventHandlerError}>
              Throw in handler
            </Button>
          </Trigger>

          <Trigger
            icon={Zap}
            title="Unhandled promise rejection"
            description="Rejects a promise with no catch handler."
            expected="Sentry globalHandlers captures it via onunhandledrejection (1 event)."
          >
            <Button type="button" variant={ButtonVariant.OUTLINE} onClick={triggerUnhandledRejection}>
              Reject promise
            </Button>
          </Trigger>

          <Trigger
            icon={Tags}
            title="Err.* factory funnel"
            description="Creates an AppError through the Err.* factory."
            expected="captureAppError sends 1 event tagged error.category=validation, error.service=local."
          >
            <Button type="button" variant={ButtonVariant.SECONDARY} onClick={triggerClientFactory}>
              Capture AppError
            </Button>
          </Trigger>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Server-side (Node)</CardTitle>
          <CardDescription>Errors raised in the Next.js server runtime via /api/sentry-test.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Trigger
            icon={ServerCrash}
            title="Unhandled route error"
            description="Route handler throws and the request returns 500."
            expected="onRequestError captures it (1 event, runtime.name=node)."
          >
            <div className="flex items-center gap-3">
              <StatusLabel status={serverStatus.unhandled} />
              <Button
                type="button"
                variant={ButtonVariant.DESTRUCTIVE}
                disabled={serverStatus.unhandled.state === 'loading'}
                onClick={() => callServer('unhandled')}
              >
                Trigger 500
              </Button>
            </div>
          </Trigger>

          <Trigger
            icon={Server}
            title="Server Err.* factory funnel"
            description="Route handler routes an AppError through Err.* and returns 200."
            expected="captureAppError sends 1 event tagged error.service=nextjs-server."
          >
            <div className="flex items-center gap-3">
              <StatusLabel status={serverStatus.factory} />
              <Button
                type="button"
                variant={ButtonVariant.SECONDARY}
                disabled={serverStatus.factory.state === 'loading'}
                onClick={() => callServer('factory')}
              >
                Capture AppError
              </Button>
            </div>
          </Trigger>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How to verify</CardTitle>
          <CardDescription>What to confirm in the Sentry dashboard after triggering.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <Typography as="span" size="sm" className="text-muted-foreground">
                Each trigger produces exactly one event in the{' '}
                <span className="font-mono">{diagnostics.environment}</span> environment.
              </Typography>
            </li>
            <li>
              <Typography as="span" size="sm" className="text-muted-foreground">
                Source maps: the stack trace shows original <span className="font-mono">.tsx</span> /{' '}
                <span className="font-mono">.ts</span> frames (e.g.{' '}
                <span className="font-mono">SentryTestHarness.tsx</span>
                ), not minified bundle names.
              </Typography>
            </li>
            <li>
              <Typography as="span" size="sm" className="text-muted-foreground">
                The event&apos;s <span className="font-mono">release</span> matches{' '}
                <span className="font-mono">{diagnostics.release}</span> above.
              </Typography>
            </li>
            <li>
              <Typography as="span" size="sm" className="text-muted-foreground">
                Factory events carry the <span className="font-mono">error.category</span> /{' '}
                <span className="font-mono">error.service</span> / <span className="font-mono">error.operation</span>{' '}
                tags.
              </Typography>
            </li>
            <li>
              <Typography as="span" size="sm" className="text-muted-foreground">
                Replay (if recorded) shows masked DOM — no readable usernames, post bodies, or inputs.
              </Typography>
            </li>
          </ul>
        </CardContent>
      </Card>

      <RenderCrash active={throwOnRender} />
    </Container>
  );
}
