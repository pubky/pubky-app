import { useId } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import type { TResourceFactRow } from './ResourceFacts.utils';

interface ResourceFactListProps {
  /** The rows to list (`getResourceDetailRows`); renders nothing when empty and there is no `note`. */
  rows: TResourceFactRow[];
  /** One plain line over the rows (`getBlockedNote`: the site shared nothing more). */
  note?: string | null;
}

/**
 * The resource page's "Details": every fact Pinakes has for the resource, one labelled row each, in
 * two columns from `sm` and stacked on a phone. A value that is an `http(s)` link opens it. A `note`
 * stands as a plain line above the rows.
 */
export function ResourceFactList({ rows, note }: ResourceFactListProps) {
  const headingId = useId();
  if (rows.length === 0 && !note) return null;
  return (
    <Container as="section" aria-labelledby={headingId} data-testid="resource-facts" className="gap-1">
      <Typography as="h3" id={headingId} size="xs" className="text-muted-foreground">
        Details
      </Typography>
      {note && (
        <Typography size="sm" data-testid="resource-facts-note" className="font-normal text-foreground">
          {note}
        </Typography>
      )}
      {rows.length > 0 && (
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
      )}
    </Container>
  );
}
