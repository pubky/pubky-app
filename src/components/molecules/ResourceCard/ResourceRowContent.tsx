import type { ReactNode } from 'react';
import { cn } from '@/libs/utils/utils';
import { ResourceSourceIcon } from './ResourceSourceIcon';

/** A row's note: small capitals in the muted colour (also the "maybe" after a service, `ResourceMaybeLabel`). */
export const RESOURCE_ROW_NOTE_CLASS_NAME = 'text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase';

interface ResourceRowContentProps {
  /** The URI the row's icon is read from. */
  uri: string;
  name: string;
  /** A second line under the name, or `null` for none. */
  note: string | null;
  /** A last line under the name and note (the counts of an Also on row on the resource page). */
  counts?: ReactNode;
}

/**
 * A row of the resource page's lists, styled as a compact participant (`UserListItem`): the icon in
 * an avatar-sized circle, the name in bold, the note in small capitals, then any counts.
 */
export function ResourceRowContent({ uri, name, note, counts }: ResourceRowContentProps) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <ResourceSourceIcon uri={uri} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold text-foreground">{name}</span>
        {/* The space keeps name and note apart in the row's accessible name; a flex column does not render it. */}
        {note && (
          <>
            {' '}
            <span className={cn('truncate', RESOURCE_ROW_NOTE_CLASS_NAME)}>{note}</span>
          </>
        )}
        {counts && <> {counts}</>}
      </span>
    </>
  );
}
