'use client';

import { useEffect, useState } from 'react';
import { ROOT_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { PAGE_GUTTER_CLASS } from '@/config/layoutClasses';
import { buildPassportReturnPostMessage, parsePassportReturnQuery } from '@/libs/passport/passport';
import { cn } from '@/libs/utils/utils';
import { ContentCard } from '@/molecules/Content/Content';
import { PageTitle } from '@/molecules/Page/Page';

type ReturnViewState = 'relaying' | 'return-link';

/**
 * Fallback destination for the Pubky Passport popup.
 *
 * Passport navigates here (`?attempt=<id>&outcome=success|error|cancel`) only when it could not
 * hand the outcome to the opener through `postMessage`. This page relays the untrusted outcome to
 * the opener on the same origin and closes itself. The query never authenticates anyone: only the
 * SDK session received by the opener does. A visible return link is always rendered because the
 * page may be opened without an opener (or the popup may refuse to close).
 */
export function PassportReturn() {
  const [viewState, setViewState] = useState<ReturnViewState>('relaying');

  useEffect(() => {
    const parsed = parsePassportReturnQuery(window.location.search);
    const opener = window.opener as Window | null;

    if (parsed && opener && !opener.closed) {
      try {
        opener.postMessage(buildPassportReturnPostMessage(parsed.attemptId, parsed.outcome), window.location.origin);
        window.close();
      } catch {
        // Fall through to the visible return link.
      }
    }
    setViewState('return-link');
  }, []);

  return (
    <Container size="container" className={cn('h-screen-without-page-header-auth-pages gap-0', PAGE_GUTTER_CLASS)}>
      <Container size="container" className="mb-6">
        <PageHeader>
          <PageTitle size="large">
            {'Back to '}
            <span className="text-brand">{'Pubky.'}</span>
          </PageTitle>
          <PageSubtitle>
            {viewState === 'relaying'
              ? 'Finishing up with Passport...'
              : 'You can close this window and return to Pubky to continue.'}
          </PageSubtitle>
        </PageHeader>
        <ContentCard layout="column">
          <Container className="items-center justify-center gap-6 py-10">
            {viewState === 'relaying' ? (
              <Spinner size="lg" />
            ) : (
              <Button asChild size="lg" data-testid="passport-return-link">
                <Link href={ROOT_ROUTES} overrideDefaults>
                  {'Return to Pubky'}
                </Link>
              </Button>
            )}
          </Container>
        </ContentCard>
      </Container>
    </Container>
  );
}
