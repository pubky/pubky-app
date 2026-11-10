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

export interface ResourceCardProps {
  /**
   * A card from any Pinakes read; a resource read (`by-uri`) adds `tz`, `all_day`, `venue` and
   * `event_status` for events.
   */
  card: TPinakesCard & Partial<Pick<TPinakesResourceDetail, 'tz' | 'all_day' | 'venue' | 'event_status'>>;
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
   * Whether the actions' ⋯ menu lists other services under "Also on" (the card is on other services
   * too). Then the viewer picks the service there and the card is no click-through; else it is,
   * unless large.
   */
  hasAlsoOn?: boolean;
  /**
   * `default`: a card in a post, whose title opens the resource's page. `large`: the card heading
   * that page, whose title is no link (its header's "Open in <site>" opens the resource).
   */
  size?: 'default' | 'large';
}
