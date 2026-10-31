import { CirclePlay, Download, Image as ImageIcon, Link, type LucideIcon, Newspaper, StickyNote } from 'lucide-react';
import { isLockContentKind, type TLockContentKind } from '@/services/locks/locks.types';
import { DEFAULT_LOCK_TITLE } from './lockTeaser';

export { isLockContentKind };

type TLockContentDisplay = {
  /** Shown when the creator typed no title, and seeded into the composer card. */
  title: string;
  Icon: LucideIcon;
};

const GENERIC_LOCK_CONTENT: TLockContentDisplay = { title: DEFAULT_LOCK_TITLE, Icon: StickyNote };

// The icons are the content filter's (`FilterContent`), so a lock reads as the kind the feed filters by.
// A note or a link has no label of its own and keeps the generic title.
const LOCK_CONTENT_BY_KIND: Record<TLockContentKind, TLockContentDisplay> = {
  note: GENERIC_LOCK_CONTENT,
  article: { title: 'Locked article', Icon: Newspaper },
  image: { title: 'Locked image', Icon: ImageIcon },
  video: { title: 'Locked video', Icon: CirclePlay },
  link: { title: DEFAULT_LOCK_TITLE, Icon: Link },
  file: { title: 'Locked file', Icon: Download },
};

/**
 * The icon and default title for a lock, from the kind saved in its announcement (#2433). The one mapping
 * `LockedPostCard`, `DialogPayToUnlock` and the text previews share. A lock that saved no kind (one from
 * before #2433) or a kind this build does not know reads as generic content.
 */
export function getLockContentDisplay(kind?: string): TLockContentDisplay {
  return isLockContentKind(kind) ? LOCK_CONTENT_BY_KIND[kind] : GENERIC_LOCK_CONTENT;
}
