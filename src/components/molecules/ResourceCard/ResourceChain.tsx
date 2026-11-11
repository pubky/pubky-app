'use client';

import { Fragment, useId } from 'react';
import { Copy } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Progress } from '@/atoms/Progress/Progress';
import { Typography } from '@/atoms/Typography/Typography';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { cn } from '@/libs/utils/utils';
import type { TChainGroup, TChainLine, TChainLink, TChainList, TChainView } from './ResourceChain.utils';

/** The links in a chain card's lines read as the links in its Details do. */
const LINK_CLASS = 'underline underline-offset-2 hover:text-brand';
/** A list row is a link as a whole, as the card's title is: underlined on hover only. */
const ROW_LINK_CLASS = 'hover:text-brand hover:underline';
/** The app's progress bar, its track visible on both card surfaces. */
const BAR_CLASS = 'bg-foreground/10';
/** An amount's bar is data, not progress: muted, so ten of them do not outshout the card. */
const AMOUNT_BAR_CLASS = 'h-1 bg-foreground/10 *:bg-foreground/40';

interface ChainTargetProps {
  /** Where the links open: this tab, or `_blank` where links may not navigate (the card title's). */
  target: string | undefined;
}

function ChainLink({
  link,
  target,
  className = LINK_CLASS,
}: ChainTargetProps & { link: TChainLink; className?: string }) {
  return (
    <Link
      href={link.href}
      target={target}
      rel={target ? 'noopener noreferrer' : undefined}
      overrideDefaults
      title={link.full}
      data-testid="resource-chain-link"
      className={cn(className, link.mono && 'font-mono')}
    >
      {link.label}
    </Link>
  );
}

function ChainPart({ part, target }: ChainTargetProps & { part: string | TChainLink | TChainGroup }) {
  if (typeof part === 'string') return <>{part}</>;
  if (!Array.isArray(part)) return <ChainLink link={part} target={target} />;
  return (
    <>
      {part.map((item, index) => (
        <span key={index}>
          {index > 0 && ' '}
          <ChainPart part={item} target={target} />
        </span>
      ))}
    </>
  );
}

function ChainLineText({ line, target }: ChainTargetProps & { line: TChainLine }) {
  return (
    <Typography
      size="sm"
      dir="auto"
      data-testid="resource-chain-line"
      className="font-medium wrap-anywhere text-foreground/90"
    >
      {/* A line wraps between its parts, not inside a figure ("1.29 BTC"); a group (two nodes) may wrap. */}
      {line.map((part, index) => (
        <Fragment key={index}>
          {/* The dot stays at the end of a line, never starts the next. */}
          {index > 0 && '\u00a0· '}
          <span className={Array.isArray(part) ? undefined : 'whitespace-nowrap'}>
            <ChainPart part={part} target={target} />
          </span>
        </Fragment>
      ))}
    </Typography>
  );
}

interface ResourceChainLinesProps extends ChainTargetProps {
  view: TChainView;
  /** The resource page's large card: every line; a feed card shows the short form. */
  isLarge: boolean;
}

/**
 * The lines of a Bitcoin or Lightning card under its title, where other cards have their summary:
 * the block, transaction or nodes it names, each a link to its own page. A feed card shows the short
 * form (`compact`, with a block's fill).
 */
export function ResourceChainLines({ view, isLarge, target }: ResourceChainLinesProps) {
  const lines = isLarge ? view.lines : view.compact.length > 0 ? [view.compact] : [];
  return (
    <>
      {isLarge && view.figure && (
        <Typography size="lg" data-testid="resource-chain-figure" className="tabular-nums">
          {view.figure}
        </Typography>
      )}
      {lines.map((line, index) => (
        <ChainLineText key={index} line={line} target={target} />
      ))}
      {!isLarge && view.fill && (
        <Progress value={view.fill.value} aria-label={view.fill.label} className={cn('h-1 max-w-48', BAR_CLASS)} />
      )}
    </>
  );
}

/**
 * The large card's visual part under the image and title: how full a block is, and the lists of
 * what the object points at (a transaction's inputs and outputs, an address's latest transactions,
 * a node's biggest channels), each row a link with its amount and a bar.
 */
export function ResourceChainBody({ view, target }: ChainTargetProps & { view: TChainView }) {
  if (!view.fill && view.lists.length === 0) return null;
  return (
    <Container data-testid="resource-chain" data-kind={view.kind} className="min-w-0 gap-4">
      {view.fill && (
        <Container className="gap-1">
          <Progress value={view.fill.value} aria-label={view.fill.label} className={cn('h-1.5', BAR_CLASS)} />
          <Typography size="xs" className="font-normal text-muted-foreground">
            {view.fill.text}
          </Typography>
        </Container>
      )}
      {view.lists.length > 0 && (
        <Container overrideDefaults className={cn('grid min-w-0 gap-4', view.lists.length > 1 && 'sm:grid-cols-2')}>
          {view.lists.map((list) => (
            <ChainList key={list.key} list={list} target={target} />
          ))}
        </Container>
      )}
    </Container>
  );
}

function ChainList({ list, target }: ChainTargetProps & { list: TChainList }) {
  const headingId = useId();
  return (
    <Container
      as="section"
      aria-labelledby={headingId}
      data-testid="resource-chain-list"
      data-key={list.key}
      className="min-w-0 gap-2"
    >
      <Typography as="h3" id={headingId} size="xs" className="text-muted-foreground">
        {list.title}
      </Typography>
      <ul className="flex min-w-0 flex-col gap-3">
        {list.rows.map((row) => (
          <li key={row.key} data-testid="resource-chain-row" className="flex min-w-0 flex-col gap-1">
            <Container overrideDefaults className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
              <Typography as="span" size="sm" className="min-w-0 truncate font-normal">
                {row.lead && <span className="text-muted-foreground">{row.lead} · </span>}
                {row.link ? <ChainLink link={row.link} target={target} className={ROW_LINK_CLASS} /> : row.text}
              </Typography>
              {row.amount && (
                <Typography
                  as="span"
                  size="sm"
                  className={cn(
                    'shrink-0 tabular-nums',
                    row.sign === 'in' && 'text-brand',
                    row.sign === 'out' && 'text-muted-foreground',
                  )}
                >
                  {row.amount}
                </Typography>
              )}
            </Container>
            {row.share !== null && <Progress value={row.share} aria-hidden="true" className={AMOUNT_BAR_CLASS} />}
          </li>
        ))}
      </ul>
      {list.more > 0 && (
        <Typography size="xs" className="font-normal text-muted-foreground">
          +{new Intl.NumberFormat().format(list.more)} more
        </Typography>
      )}
    </Container>
  );
}

/** Copies a chain card's ID (transaction ID, block hash, address, node key), next to its title. */
export function ResourceChainCopy({ copy }: { copy: NonNullable<TChainView['copy']> }) {
  const { copyToClipboard } = useCopyToClipboard({ successTitle: 'Copied to clipboard' });
  return (
    <Button
      type="button"
      variant={ButtonVariant.GHOST}
      size="icon"
      data-testid="resource-chain-copy"
      aria-label={`${copy.label}: ${copy.value}`}
      title={copy.label}
      onClick={() => copyToClipboard(copy.value)}
      className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
    >
      <Copy aria-hidden="true" />
    </Button>
  );
}
