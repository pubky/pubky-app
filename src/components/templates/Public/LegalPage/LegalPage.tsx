import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { CONTENT_GUTTER_CLASS } from '@/config/layoutClasses';
import { cn } from '@/libs/utils/utils';
import { HomeFooter } from '@/molecules/Home/Home';
import { PageContainer } from '@/molecules/Page/Page';

/**
 * Public page for a legal text (`/terms-of-use`, `/privacy-policy`). It reuses the landing page's container, gutter
 * and hero footer, so the texts read as part of pubky.app's public pages for signed-out visitors and members alike.
 */
export function LegalPage({ children }: { children: ReactNode }) {
  return (
    <Container as="main" size="container" className={cn('gap-16 pt-6 pb-24', CONTENT_GUTTER_CLASS)}>
      {children}
      <PageContainer size="narrow" className="mx-0 border-t border-border pt-10">
        <HomeFooter />
      </PageContainer>
    </Container>
  );
}
