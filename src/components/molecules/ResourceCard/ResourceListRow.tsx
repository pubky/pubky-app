import { ArrowUpRight, type LucideIcon, MessageCircle, Repeat, Tag } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import type { TResourceRowCounts } from '@/hooks/useResourceRowCounts/useResourceRowCounts.types';
import { cn } from '@/libs/utils/utils';
import { ResourceRowContent } from './ResourceRowContent';

const ROW_CLASS_NAME = 'flex min-w-0 items-center gap-2 rounded-md text-sm';

type TCountItem = { key: string; icon: LucideIcon; count: number; text: string; noun: string };

/** The counts a row shows, in the card's action order (Tags, Reply, Post), 0 left out. */
function getCountItems(counts: TResourceRowCounts | null | undefined): TCountItem[] {
  if (!counts) return [];
  const items: TCountItem[] = [
    {
      key: 'tags',
      icon: Tag,
      count: counts.tags,
      text: `${counts.tags}${counts.isTagsAtReadLimit ? '+' : ''}`,
      noun: 'tag',
    },
    { key: 'replies', icon: MessageCircle, count: counts.replies, text: `${counts.replies}`, noun: 'comment' },
    { key: 'posts', icon: Repeat, count: counts.posts, text: `${counts.posts}`, noun: 'post' },
  ];
  return items.filter((item) => item.count > 0);
}

/** The counts in words ("1 tag, 4 comments, 2 posts"), for the row's name and tooltip. */
function getCountsText(items: TCountItem[]): string {
  return items.map(({ text, noun }) => `${text} ${noun}${text === '1' ? '' : 's'}`).join(', ');
}

interface ResourceListRowProps {
  /** The URI the row's icon is read from. */
  uri: string;
  /**
   * Where the row opens: an `http(s)` link (opens in a new tab) or an app route; `null` lists it as
   * text. Never a non-web URI.
   */
  href: string | null;
  /**
   * The same link on its own service, opened in a new tab by a separate ↗ on the right of the row,
   * while the row itself opens `href`; `null` or left out for none. Callers pass `getHttpUrl(…)`:
   * only an `http(s)` link may leave the app.
   */
  externalHref?: string | null;
  name: string;
  /** A second line under the name, or `null` for none. */
  note: string | null;
  /** Where the row's link came from, in its tooltip only ("Found via musicbrainz"). */
  source?: string | null;
  /**
   * What people did with the link (`useResourceRowCounts`): a small line under the name with the
   * ones that are not 0, said in the row's name and tooltip; none for `null`, left out or all 0.
   */
  counts?: TResourceRowCounts | null;
  /**
   * A control for the row, its sibling in the list item (a language switcher): on its own line
   * under the name, in line with it, so the narrow column keeps room for the name (the ↗ stays on
   * the name's line).
   */
  trailing?: ReactNode;
  testId: string;
}

/**
 * One row of a sidebar card on the resource page (Also on, Similar), with its counts, a link when it
 * has somewhere to open. A name or note cut short in the narrow column is whole in the tooltip, with
 * `source`.
 */
export function ResourceListRow({
  uri,
  href,
  externalHref,
  name,
  note,
  source,
  counts,
  trailing,
  testId,
}: ResourceListRowProps) {
  const countItems = getCountItems(counts);
  const countsText = getCountsText(countItems);
  // As a participant's stats on a post's page (`UserListItem`): small icons with their numbers.
  const countsLine =
    countItems.length > 0 ? (
      <>
        <span
          aria-hidden="true"
          data-testid={`${testId}-counts`}
          className="flex items-center gap-3 text-xs font-medium tracking-[1.2px] text-muted-foreground"
        >
          {countItems.map(({ key, icon: Icon, text }) => (
            <span key={key} data-testid={`${testId}-counts-${key}`} className="flex items-center gap-1">
              <Icon className="size-3" />
              {text}
            </span>
          ))}
        </span>
        <span className="sr-only">{countsText}</span>
      </>
    ) : null;
  const content = <ResourceRowContent uri={uri} name={name} note={note} counts={countsLine} />;
  const tooltip = [name, note, countsText, source].filter(Boolean).join(' · ');
  // Beside a link out, the row takes the room the ↗ leaves; a long name is cut short before it.
  const width = externalHref ? 'flex-1' : trailing && 'w-full';
  const row = href ? (
    <Link
      href={href}
      overrideDefaults
      title={tooltip}
      className={cn(
        ROW_CLASS_NAME,
        'transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring',
        width,
      )}
    >
      {content}
    </Link>
  ) : (
    <span title={tooltip} className={cn(ROW_CLASS_NAME, width)}>
      {content}
    </span>
  );

  return (
    <li data-testid={testId} className={cn('min-w-0', trailing && 'flex flex-col items-start gap-1')}>
      {externalHref ? (
        // The ↗ is the row's sibling, never inside it: each has its own hover and its own link.
        <Container overrideDefaults className={cn('flex min-w-0 items-center gap-2', trailing && 'w-full')}>
          {row}
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <Link
              href={externalHref}
              overrideDefaults
              aria-label={`Open in ${name}`}
              title={`Open in ${name}`}
              data-testid={`${testId}-external`}
            >
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </Container>
      ) : (
        row
      )}
      {/* Under the name: the leading icon's width (`size-8`) and the row's gap (`gap-2`). */}
      {trailing && <span className="max-w-full min-w-0 pl-10">{trailing}</span>}
    </li>
  );
}
