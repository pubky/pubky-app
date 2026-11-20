import type { ReactNode } from 'react';
import { Link } from '@/atoms/Link/Link';
import { cn } from '@/libs/utils/utils';
import { ResourceRowContent } from './ResourceRowContent';

const ROW_CLASS_NAME = 'flex min-w-0 items-center gap-2 rounded-md text-sm';

interface ResourceListRowProps {
  /** The URI the row's icon is read from. */
  uri: string;
  /**
   * Where the row opens: an `http(s)` link (opens in a new tab) or an app route; `null` lists it as
   * text. Never a non-web URI.
   */
  href: string | null;
  name: string;
  /** A second line under the name, or `null` for none. */
  note: string | null;
  /** Where the row's link came from, in its tooltip only ("Found via musicbrainz"). */
  source?: string | null;
  /**
   * A control for the row, its sibling in the list item (a language switcher): on its own line
   * under the name, in line with it, so the narrow column keeps room for the name.
   */
  trailing?: ReactNode;
  testId: string;
}

/**
 * One row of a sidebar card on the resource page (Also on, Similar), a link when it has somewhere to
 * open. A name or note cut short in the narrow column is whole in the tooltip, with `source`.
 */
export function ResourceListRow({ uri, href, name, note, source, trailing, testId }: ResourceListRowProps) {
  const content = <ResourceRowContent uri={uri} name={name} note={note} />;
  const tooltip = [name, note, source].filter(Boolean).join(' · ');

  return (
    <li data-testid={testId} className={cn('min-w-0', trailing && 'flex flex-col items-start gap-1')}>
      {href ? (
        <Link
          href={href}
          overrideDefaults
          title={tooltip}
          className={cn(
            ROW_CLASS_NAME,
            'transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring',
            trailing && 'w-full',
          )}
        >
          {content}
        </Link>
      ) : (
        <span title={tooltip} className={cn(ROW_CLASS_NAME, trailing && 'w-full')}>
          {content}
        </span>
      )}
      {/* Under the name: the icon's width (`size-8`) and the row's gap (`gap-2`). */}
      {trailing && <span className="max-w-full min-w-0 pl-10">{trailing}</span>}
    </li>
  );
}
