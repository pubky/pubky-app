import type { ReactNode } from 'react';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/** The details a card shows beyond name, description, image and source, by schema.org family. */
export enum ResourceFamily {
  /** `Event` and every type below it: when it happens, and where when placed. */
  EVENT = 'event',
  /** `Place` and every type below it (`City`, `Restaurant`, ...): where it is. */
  PLACE = 'place',
  /** Every other type: a plain web card. */
  WEB = 'web',
}

/** The resource read's fields the card shows when it has them. */
type TResourceCardDetailField =
  | 'tz'
  | 'all_day'
  | 'venue'
  | 'event_status'
  | 'organizer'
  | 'attendance'
  | 'address'
  | 'category'
  | 'stream'
  | 'facts';

export interface ResourceCardProps {
  /**
   * A card from any Pinakes read; a resource read (`by-uri`) adds the details: an event's `tz`,
   * `all_day`, `venue`, `event_status`, `organizer` and `attendance`, a place's `address` and
   * `category`, an episode's `stream`, and the source's `facts`.
   */
  card: TPinakesCard & Partial<Pick<TPinakesResourceDetail, TResourceCardDetailField>>;
  /**
   * Where the source (and the title, where links may not navigate) link to: the link as written in
   * the post. Defaults to the card's `uri`. Only an `http(s)` value becomes a link; anything else
   * renders as text.
   */
  href?: string;
  /**
   * What closes the card: the action row and the tag bar. Absent while composing, where there is
   * nothing to act on yet.
   */
  actions?: ReactNode;
  /**
   * `default`: a card in a post, whose title opens the resource's page. `large`: the card heading
   * that page, whose title is no link (its header's "Open in <site>" opens the resource).
   */
  size?: 'default' | 'large';
  /**
   * Whether the card is on screen: a default card reads what it lacks (its group, the link's own
   * preview) only once it has been, the large card always. Defaults to `true`.
   */
  isOnScreen?: boolean;
  /**
   * Wraps the card's image and text, e.g. to put a service's player in their place
   * (`useCardPlayer`); the header, details, credits and `actions` stay.
   */
  renderBody?: (body: ReactNode) => ReactNode;
  /**
   * Whether `renderBody` shows a service's player or a platform's embed in place of the body now:
   * that body is then its own set of controls, never a click-through. The `large` card leaves out
   * its Details then (the resource page's X post shows them itself).
   */
  isBodyReplaced?: boolean;
  /** A control in the header, next to the type: a card's embed/card switch (`useCardPlayer`'s `switcher`). */
  headerControl?: ReactNode;
}
