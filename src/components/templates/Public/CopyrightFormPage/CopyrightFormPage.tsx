import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { CONTENT_GUTTER_CLASS } from '@/config/layoutClasses';
import { getEmail } from '@/libs/runtime-config/runtime-config';
import { HAS_APP_SERVER } from '@/libs/static-export/appServer';
import { cn } from '@/libs/utils/utils';
import { CopyrightForm } from '@/organisms/CopyrightForm/CopyrightForm';

/**
 * Copyright/DMCA Takedown Request page template
 *
 * Public-facing template for submitting copyright infringement claims. The form is sent through
 * the app server; the static export, which has none, points to the support address instead.
 */
export function CopyrightFormPage() {
  if (HAS_APP_SERVER) return <CopyrightForm />;

  const email = getEmail();
  return (
    <Container size="container" className={cn('gap-6 pb-12', CONTENT_GUTTER_CLASS)}>
      <Typography as="h1" size="lg">
        {'Copyright Removal Request'}
      </Typography>
      <Typography size="sm" className="font-normal text-muted-foreground">
        {'This copy of Pubky App cannot send the takedown form. Email your notice to '}
        <a href={`mailto:${email}`} className="text-foreground underline">
          {email}
        </a>
        {'.'}
      </Typography>
    </Container>
  );
}
