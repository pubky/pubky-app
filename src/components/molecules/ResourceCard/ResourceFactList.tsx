import { useId } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import type { TResourceFactRow } from './ResourceFacts.utils';

interface ResourceFactListProps {
  /** The rows to list (`getResourceDetailRows`); renders nothing when empty. */
  rows: TResourceFactRow[];
}

/**
 * The resource page's "Details": every fact Pinakes has for the resource, one labelled row each, in
 * two columns from `sm` and stacked on a phone. A value that is an `http(s)` link opens it.
 */
export function ResourceFactList({ rows }: ResourceFactListProps) {
  const headingId = useId();
  if (rows.length === 0) return null;
  return (
    <Container as="section" aria-labelledby={headingId} data-testid="resource-facts" className="gap-1">
      <Typography as="h3" id={headingId} size="xs" className="text-muted-foreground">
        Details
      </Typography>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(8rem,max-content)_1fr]">
        {rows.map((row) => (
          <div key={row.key} data-testid="resource-fact" data-key={row.key} className="contents">
            <dt className="font-normal text-muted-foreground max-sm:mt-1">{row.label}</dt>
            <dd dir="auto" className="min-w-0 font-normal wrap-anywhere text-foreground">
              {row.href ? (
                <Link href={row.href} overrideDefaults className="underline underline-offset-2 hover:text-brand">
                  {row.value}
                </Link>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Container>
  );
}
