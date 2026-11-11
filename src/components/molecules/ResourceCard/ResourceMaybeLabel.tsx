import { cn } from '@/libs/utils/utils';
import { RESOURCE_ROW_NOTE_CLASS_NAME } from './ResourceRowContent';

/**
 * The short "maybe" after a service's name for a link Pinakes matched by metadata (`isMaybeAlsoOn`),
 * possibly not the same thing; in the note style of the resource page's rows (`ResourceRowContent`),
 * where the same entry's note reads "Maybe". The space before it keeps it apart from the name in the
 * row's accessible name.
 */
export function ResourceMaybeLabel() {
  return (
    <>
      {' '}
      <span data-testid="resource-maybe-label" className={cn('shrink-0', RESOURCE_ROW_NOTE_CLASS_NAME)}>
        maybe
      </span>
    </>
  );
}
