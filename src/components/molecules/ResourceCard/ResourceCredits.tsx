import { Fragment, type ReactNode, useId } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { PinakesCreditField, type TPinakesCredit } from '@/services/pinakes/pinakes.types';
import { getHttpUrl } from './ResourceCard.utils';
import {
  CREDIT_FIELD_LABELS,
  getCreditProviderName,
  getCreditSubjectLabel,
  getLicenseLabel,
} from './ResourceCredits.utils';

/** In a line of text a link is underlined; in the compact line every name is one. */
const FULL_LINK_CLASS_NAME = 'underline underline-offset-2 hover:text-brand';
const COMPACT_LINK_CLASS_NAME = 'hover:text-brand hover:underline';

interface ResourceCreditsProps {
  /**
   * The credits of the values the card shows (`getShownCredits`); renders nothing when empty. A
   * credit for a field without a label (not `PinakesCreditField`) is left out here too.
   */
  credits: TPinakesCredit[];
  /**
   * `full`: a "Sources" list, one line per credit with its license (the resource page).
   * `compact`: one wrapping line with each value's source and license, both linked (a card in a post).
   */
  variant: 'full' | 'compact';
}

/**
 * Where a card's enriched text and image come from (Wikipedia, Wikimedia Commons, ...) and under
 * which license. Only `http(s)` URLs become links; every other value is text.
 */
export function ResourceCredits({ credits, variant }: ResourceCreditsProps) {
  const labelled = credits.filter((credit) => Object.hasOwn(CREDIT_FIELD_LABELS, credit.field));
  if (labelled.length === 0) return null;
  return variant === 'full' ? (
    <ResourceCreditsFull credits={labelled} />
  ) : (
    <ResourceCreditsCompact credits={labelled} />
  );
}

function ResourceCreditsFull({ credits }: { credits: TPinakesCredit[] }) {
  const headingId = useId();
  return (
    <Container
      as="section"
      aria-labelledby={headingId}
      data-testid="resource-credits"
      data-variant="full"
      className="gap-1"
    >
      <Typography as="h3" id={headingId} size="xs" className="text-muted-foreground">
        Sources
      </Typography>
      <ul className="flex flex-col gap-1">
        {credits.map((credit, index) => (
          <li
            key={`${credit.field}:${credit.source_url}:${index}`}
            data-testid="resource-credit"
            data-field={credit.field}
            className="text-xs font-normal wrap-anywhere text-muted-foreground"
          >
            <CreditLine credit={credit} />
          </li>
        ))}
      </ul>
    </Container>
  );
}

/**
 * `Text: Wikipedia (en), excerpt · CC BY-SA 4.0` or `Image: <author> · Wikimedia Commons · CC BY-SA 4.0`:
 * a text is named by its source, an image by its author. The source links to its page, the license
 * to its text.
 */
function CreditLine({ credit }: { credit: TPinakesCredit }) {
  const isText = credit.field === PinakesCreditField.DESCRIPTION;
  const subjectUrl = getHttpUrl(credit.subject);
  const subjectLabel = getCreditSubjectLabel(credit.subject);
  const qualifiers = [credit.excerpted && 'excerpt', credit.modified && 'modified'].filter(Boolean).join(', ');
  const license = getLicenseLabel(credit.license);
  const licenseUrl = getHttpUrl(credit.license_url);

  return (
    <>
      {CREDIT_FIELD_LABELS[credit.field]}: {!isText && credit.author && <>{credit.author} · </>}
      <MaybeLink href={getHttpUrl(credit.source_url)} testId="resource-credit-source" className={FULL_LINK_CLASS_NAME}>
        {getCreditProviderName(credit)}
      </MaybeLink>
      {credit.lang && <> ({credit.lang})</>}
      {qualifiers && <>, {qualifiers}</>}
      {subjectUrl && subjectLabel && (
        <>
          , about{' '}
          <MaybeLink href={subjectUrl} testId="resource-credit-subject" className={FULL_LINK_CLASS_NAME}>
            {subjectLabel}
          </MaybeLink>
        </>
      )}
      {license && (
        <>
          {' · '}
          <MaybeLink href={licenseUrl} testId="resource-credit-license" className={FULL_LINK_CLASS_NAME}>
            {license}
          </MaybeLink>
        </>
      )}
    </>
  );
}

/**
 * One line: `Text: Wikipedia, CC BY-SA 4.0 · Image: SjakePaak, Wikimedia Commons, CC BY-SA 4.0`. Each
 * value names its author first for an image, then its source (linked to its page) and its licence,
 * so a card in a post carries the credit its licence asks for; the licence links to its text. Wraps.
 */
function ResourceCreditsCompact({ credits }: { credits: TPinakesCredit[] }) {
  const segments: ReactNode[] = credits.map((credit, index) => {
    const isText = credit.field === PinakesCreditField.DESCRIPTION;
    const license = getLicenseLabel(credit.license);
    return (
      <Fragment key={`${credit.field}:${credit.source_url}:${index}`}>
        {CREDIT_FIELD_LABELS[credit.field]}: {!isText && credit.author && <>{credit.author}, </>}
        <MaybeLink
          href={getHttpUrl(credit.source_url)}
          testId="resource-credit-source"
          className={COMPACT_LINK_CLASS_NAME}
        >
          {getCreditProviderName(credit)}
        </MaybeLink>
        {license && (
          <>
            ,{' '}
            <MaybeLink
              href={getHttpUrl(credit.license_url)}
              testId="resource-credit-license"
              className={COMPACT_LINK_CLASS_NAME}
            >
              {license}
            </MaybeLink>
          </>
        )}
      </Fragment>
    );
  });

  return (
    <Typography
      size="xs"
      data-testid="resource-credits"
      data-variant="compact"
      className="font-normal wrap-anywhere text-muted-foreground"
    >
      <span className="sr-only">Sources: </span>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          {segment}
        </Fragment>
      ))}
    </Typography>
  );
}

/** A link out when `href` is `http(s)` (new tab), else the same text. */
function MaybeLink({
  href,
  testId,
  className,
  children,
}: {
  href: string | null;
  testId: string;
  className: string;
  children: string;
}) {
  if (!href) return <span data-testid={testId}>{children}</span>;
  return (
    <Link href={href} overrideDefaults data-testid={testId} className={className}>
      {children}
    </Link>
  );
}
