'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AUTH_ROUTES, ROOT_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { CONTENT_GUTTER_CLASS } from '@/config/layoutClasses';
import { AuthController } from '@/controllers/auth/auth';
import { SocialMigrationController } from '@/controllers/social-migration/social-migration';
import { useBeforeUnloadGuard } from '@/hooks/useBeforeUnloadGuard/useBeforeUnloadGuard';
import { useHasBackupAccount } from '@/hooks/useHasBackupAccount/useHasBackupAccount';
import { isAuthFlowCanceledError } from '@/libs/error/auth-flow-canceled';
import { isWrongEnvironmentHomeserverError } from '@/libs/error/error.utils';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import { shopSignInReturn } from '@/libs/shop-embed/bridge';
import {
  clearSocialMigrationSignedOutNotice,
  readSocialMigrationSignedOutNotice,
  type SocialMigrationSignedOutNotice,
} from '@/libs/social-migration/signed-out-notice';
import { socialMigrationSkippedTotal } from '@/libs/social-migration/summary';
import { cn } from '@/libs/utils/utils';
import { ButtonsNavigation } from '@/molecules/ButtonsNavigation/ButtonsNavigation';
import { ContentCard } from '@/molecules/Content/Content';
import { PageTitle } from '@/molecules/Page/Page';
import { toast } from '@/molecules/Toaster/toast';
import { AlertBackup } from '@/organisms/AlertBackup/AlertBackup';
import { SocialMigrationProgress } from '@/organisms/SocialMigrationProgress/SocialMigrationProgress';
import { hasAccountState } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useSocialMigrationStore } from '@/stores/socialMigration/socialMigration.store';
import type {
  SocialMigrationReason,
  SocialMigrationReauthReason,
} from '@/stores/socialMigration/socialMigration.types';

// Same bottom-inset rule as the logout page: `.onboarding-nav` supplies the mobile inset.
const NAV_CLASSNAME = 'pb-0 lg:pb-6';

const UPDATE_TITLE = 'Your account needs an update';

const SIGNED_OUT_COPY: Record<SocialMigrationSignedOutNotice['reason'], string> = {
  'pre-migration-grant':
    'Pubky.app moved to a new data format. Sign in again to grant the new permissions; your data is upgraded right after.',
  'missing-scopes':
    'Pubky.app moved to a new data format and your previous session did not include the new permissions. Sign in again to grant them; your data is upgraded right after.',
  'session-expired': 'Your session ended during the update. Sign in to continue where it stopped.',
};

/** A restore that failed with no gate behind it (the grant is gone): nothing about permissions is known here. */
const RESTORE_SIGN_IN_COPY =
  'Your session could not be restored. Sign in again to continue the update where it stopped.';

/** While the forced sign-out runs; the same reasons as the explanation that follows it. */
const SIGNING_OUT_COPY: Record<SocialMigrationReauthReason, string> = {
  'pre-migration-grant':
    'Pubky.app moved to a new data format. We are signing you out so you can sign in again and grant the new permissions. Your data is upgraded right after.',
  'missing-scopes':
    'Pubky.app moved to a new data format and your previous session did not include the new permissions. We are signing you out so you can sign in again and grant them. Your data is upgraded right after.',
  'session-expired':
    'Your session ended during the update. We are signing you out so you can sign in again and continue where it stopped.',
};

const isReauthReason = (reason: SocialMigrationReason | undefined): reason is SocialMigrationReauthReason =>
  reason !== undefined && reason in SIGNING_OUT_COPY;

const BLOCKED_COPY: Record<
  Extract<SocialMigrationReason, 'incomplete' | 'homeserver-unsupported' | 'unexpected'>,
  {
    title: string;
    body: string;
  }
> = {
  incomplete: {
    title: 'We could not reach your homeserver for some of your data',
    body: 'Nothing was lost. Retry to continue where it stopped.',
  },
  'homeserver-unsupported': {
    title: 'Your homeserver needs an upgrade',
    body: 'It does not support private storage yet, which the update needs. Ask its operator to upgrade, then retry.',
  },
  unexpected: { title: 'Something went wrong', body: 'Retry, or sign out and try again later.' },
};

const megabytes = new Intl.NumberFormat('en-US', { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 });

/** Bytes as "about N MB" for the quota screen; never under one megabyte, so the number stays readable. */
function describeNeedBytes(needBytes: number | undefined): string {
  return megabytes.format(Math.max(1, Math.ceil((needBytes ?? 0) / 100_000) / 10));
}

function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <Container size="container">
      <PageHeader>
        <PageTitle size="large">{title}</PageTitle>
        {subtitle && <PageSubtitle>{subtitle}</PageSubtitle>}
      </PageHeader>
      {children}
    </Container>
  );
}

type NavigationProps = Omit<React.ComponentProps<typeof ButtonsNavigation>, 'className'>;

function Navigation(props: NavigationProps) {
  return (
    <div className="onboarding-nav mt-auto w-full lg:mt-0">
      <ButtonsNavigation className={NAV_CLASSNAME} {...props} />
    </div>
  );
}

function Waiting({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Screen title={title} subtitle={subtitle}>
      <ContentCard layout="column">
        <Container className="items-center justify-center gap-4 py-10">
          <Spinner size="lg" />
        </Container>
      </ContentCard>
    </Screen>
  );
}

/**
 * The social v1 migration gate (`/migration`, ADR-0026). Reads the gate's store and the auth
 * store, calls the controllers; never runs the engine itself. A grant from before the gate is
 * signed out here (D2), after the backup prompt when the browser key was never backed up.
 */
export function SocialMigration() {
  const router = useRouter();
  const stage = useSocialMigrationStore((state) => state.stage);
  const reason = useSocialMigrationStore((state) => state.reason);
  const phase = useSocialMigrationStore((state) => state.phase);
  const pass = useSocialMigrationStore((state) => state.pass);
  const done = useSocialMigrationStore((state) => state.done);
  const total = useSocialMigrationStore((state) => state.total);
  const attempt = useSocialMigrationStore((state) => state.attempt);
  const resumedFrom = useSocialMigrationStore((state) => state.resumedFrom);
  const needBytes = useSocialMigrationStore((state) => state.needBytes);
  const summary = useSocialMigrationStore((state) => state.summary);
  const authHydrated = useAuthStore((state) => state.hasHydrated);
  const hasAccount = useAuthStore(hasAccountState);
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
  const restoreStatus = useAuthStore((state) => state.restoreStatus);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const onboardingHydrated = useOnboardingStore((state) => state.hasHydrated);
  const secretKey = useOnboardingStore((state) => state.secretKey);
  const hasBackupAccount = useHasBackupAccount();
  const [notice, setNotice] = useState<SocialMigrationSignedOutNotice | null>(null);
  const [logoutFailed, setLogoutFailed] = useState(false);
  // Retry bumps the attempt; the ref remembers the attempt already started, so Strict Mode's second effect run
  // and every re-render in between leave the one logout alone.
  const [logoutAttempt, setLogoutAttempt] = useState(1);
  const logoutStarted = useRef(0);

  const isHydrated = authHydrated && onboardingHydrated;
  const isReauth = stage === 'reauth-required';
  // A restore that failed outside a gate (a reload after the grant was lost, or with the homeserver unreachable)
  // leaves the gate store idle, so no run advances this screen: it explains and offers the way out itself.
  const failedRestore =
    stage === 'idle' && (restoreStatus === 'reauth-required' || restoreStatus === 'temporary-error');
  // The sign-out screen names the reason; logout resets the gate store, so the notice carries it from then on.
  const signingOutReason = isReauth && isReauthReason(reason) ? reason : (notice?.reason ?? 'pre-migration-grant');
  // Same rule as /logout: a browser key that may own an account is backed up before the account is signed out.
  const needsBackup = Boolean(
    hasBackupAccount && secretKey && currentUserPubky && Identity.tryZ32FromSecret(secretKey) === currentUserPubky,
  );
  const isRunning = stage === 'running' || stage === 'waiting-for-tab';
  // Until the engine lists something to copy, a first run is only a check: an account migrated elsewhere or an empty
  // tree passes in a moment, so the screen stays neutral; so does a restore the gate has not decided yet. Retries
  // and resumed runs keep the full screen.
  const isChecking =
    (stage === 'running' || (stage === 'idle' && restoreStatus === 'restoring')) &&
    total === 0 &&
    attempt <= 1 &&
    !resumedFrom;

  useBeforeUnloadGuard(isRunning);

  // The notice is tab-scoped storage; read after hydration so the server and the client render the same.
  useEffect(() => {
    setNotice(readSocialMigrationSignedOutNotice());
  }, [stage, hasAccount]);

  useEffect(() => {
    if (!isHydrated || !isReauth || !hasAccount || isLoggingOut || needsBackup) return;
    if (logoutStarted.current === logoutAttempt) return;
    logoutStarted.current = logoutAttempt;
    void AuthController.logout().catch((error: unknown) => {
      if (isAuthFlowCanceledError(error)) return;
      Logger.error('Failed to sign out from the migration gate', { error });
      setLogoutFailed(true);
    });
  }, [isHydrated, isReauth, hasAccount, isLoggingOut, needsBackup, logoutAttempt]);

  // The route guard brings a signed-out tab back here while the notice is pending: leaving settles it, as Sign in does.
  // A held account's screen keeps it: the guard sends that tab back here anyway, and its sign-out still owes the reason.
  const onHome = () => {
    clearSocialMigrationSignedOutNotice();
    router.push(ROOT_ROUTES);
  };
  const onHomeHeld = () => router.push(ROOT_ROUTES);
  const onSignOut = () => router.push(AUTH_ROUTES.LOGOUT);
  const onSignIn = () => {
    clearSocialMigrationSignedOutNotice();
    // A Shop sign-in the gate signed out keeps its validated return; the stale `shopReauth` generation stays behind.
    const shopReturn = shopSignInReturn(window.location.search);
    router.push(
      shopReturn ? `${AUTH_ROUTES.SIGN_IN}?${new URLSearchParams({ returnTo: shopReturn })}` : AUTH_ROUTES.SIGN_IN,
    );
  };
  const onRetryLogout = () => {
    setLogoutFailed(false);
    setLogoutAttempt((attempt) => attempt + 1);
  };
  // The same retry the auth coordinator runs on reconnect. The status is the feedback: `restoring` shows the
  // guard's spinner, a second failure brings this screen back, and the one rejection it can end in (a key linked to
  // another homeserver) flips it to `reauth-required`, which the sign-in explanation above covers, with the same
  // toast the coordinator's own retry shows for it. A focus or online event during the click joins this in-flight
  // restore and may show that static toast a second time; cosmetic, left as is.
  const onRetryRestore = () => {
    void AuthController.restorePersistedSession().catch((error: unknown) => {
      if (isWrongEnvironmentHomeserverError(error))
        toast({
          variant: 'error',
          description: 'This key is linked to a different homeserver. Use a staging account on this site.',
        });
    });
  };

  let content: React.ReactNode;
  if (!isHydrated) {
    content = <Waiting title={UPDATE_TITLE} subtitle="Checking your account." />;
  } else if (isReauth && hasAccount && !isLoggingOut && needsBackup) {
    // No way out but the backup: the account is held, so a Homepage button would bounce back here, and a sign-out
    // from /logout would only ask for the backup again. Done confirms it and the sign-out follows.
    content = (
      <Container className="gap-6">
        <PageHeader>
          <PageTitle size="large">Back up your key before continuing</PageTitle>
          <PageSubtitle>
            Pubky.app moved to a new data format, so you have to sign in again with the new permissions. Your recovery
            key is still saved only in this browser: back it up first. If you already have a backup, choose Done to
            confirm and sign out.
          </PageSubtitle>
        </PageHeader>
        <AlertBackup />
      </Container>
    );
  } else if (isReauth && hasAccount && logoutFailed && !isLoggingOut) {
    content = (
      <>
        <Screen title="We couldn't sign you out yet" subtitle="Please try again to finish signing out securely." />
        <Navigation
          id="social-migration-logout-error-navigation"
          backText="Homepage"
          continueText="Retry"
          onHandleBackButton={onHomeHeld}
          onHandleContinueButton={onRetryLogout}
        />
      </>
    );
  } else if ((isReauth && hasAccount) || isLoggingOut) {
    content = <Waiting title={UPDATE_TITLE} subtitle={SIGNING_OUT_COPY[signingOutReason]} />;
  } else if (!hasAccount || (failedRestore && restoreStatus === 'reauth-required')) {
    // The notice explains a forced sign-out; without one, a lost grant explains itself and a guest gets the default.
    const subtitle = notice
      ? SIGNED_OUT_COPY[notice.reason]
      : hasAccount
        ? RESTORE_SIGN_IN_COPY
        : SIGNED_OUT_COPY['pre-migration-grant'];
    content = (
      <>
        <Screen title={UPDATE_TITLE} subtitle={subtitle} />
        <Navigation
          id="social-migration-signed-out-navigation"
          backText="Homepage"
          continueText="Sign in"
          onHandleBackButton={onHome}
          onHandleContinueButton={onSignIn}
        />
      </>
    );
  } else if (failedRestore) {
    content = (
      <>
        <Screen
          title="We couldn't reach your homeserver"
          subtitle="Your account stays on this device. Check your connection, then retry to continue the update."
        />
        <Navigation
          id="social-migration-restore-error-navigation"
          backText="Homepage"
          continueText="Retry"
          onHandleBackButton={onHome}
          onHandleContinueButton={onRetryRestore}
        />
      </>
    );
  } else if (stage === 'waiting-for-tab') {
    content = (
      <Waiting
        title="Another tab is updating your account"
        subtitle="Keep that tab open. This page continues when it finishes."
      />
    );
  } else if (stage === 'blocked' && reason === 'quota') {
    content = (
      <>
        <Screen
          title="Your homeserver is out of space"
          subtitle={`About ${describeNeedBytes(needBytes)} more is needed for your media. Free up space or contact your homeserver operator, then retry.`}
        />
        <Navigation
          id="social-migration-blocked-navigation"
          backText="Sign out"
          continueText="Retry"
          onHandleBackButton={onSignOut}
          onHandleContinueButton={() => SocialMigrationController.retry()}
        />
      </>
    );
  } else if (stage === 'blocked') {
    const copy = BLOCKED_COPY[reason === 'incomplete' || reason === 'homeserver-unsupported' ? reason : 'unexpected'];
    content = (
      <>
        <Screen title={copy.title} subtitle={copy.body} />
        <Navigation
          id="social-migration-blocked-navigation"
          backText="Sign out"
          continueText="Retry"
          onHandleBackButton={onSignOut}
          onHandleContinueButton={() => SocialMigrationController.retry()}
        />
      </>
    );
  } else if (stage === 'summary' && summary) {
    const skipped = socialMigrationSkippedTotal(summary);
    const { profileImage, profileLinks } = summary.dropped;
    const sentences = [
      skipped > 0 && `Some items could not be carried over: ${skipped} skipped.`,
      profileImage > 0 && profileLinks > 0
        ? `Your profile picture and ${profileLinks} profile ${profileLinks === 1 ? 'link' : 'links'} need to be set again in Settings.`
        : profileImage > 0
          ? 'Your profile picture needs to be set again in Settings.'
          : profileLinks > 0 &&
            `${profileLinks} profile ${profileLinks === 1 ? 'link needs' : 'links need'} to be set again in Settings.`,
    ].filter((sentence): sentence is string => typeof sentence === 'string');
    content = (
      <>
        <Screen title="Your account is up to date" subtitle={sentences.join(' ')} />
        <Navigation
          id="social-migration-summary-navigation"
          hiddenBackButton
          continueText="Continue"
          onHandleContinueButton={() => SocialMigrationController.acknowledge()}
        />
      </>
    );
  } else if (isChecking) {
    content = <Waiting title="Checking your account" />;
  } else {
    content = (
      <Screen
        title="Updating your account"
        subtitle="Copying your posts, tags, follows and media to the new format. Do not close this tab."
      >
        <ContentCard layout="column">
          <SocialMigrationProgress phase={phase} pass={pass} done={done} total={total} resumedFrom={resumedFrom} />
        </ContentCard>
      </Screen>
    );
  }

  return (
    <Container
      size="container"
      className={cn('h-screen-without-page-header-auth-pages gap-0', CONTENT_GUTTER_CLASS)}
      data-testid="social-migration"
    >
      {content}
    </Container>
  );
}
