/** What people did with one link, as a row of a resource list shows it (0 = none or not counted). */
export interface TResourceRowCounts {
  /** Its tags (labels), as the card's Tags button counts them. */
  tags: number;
  /** Nexus answered with as many tags as a card asks for: the link may have more (`20+`). */
  isTagsAtReadLimit: boolean;
  /** Posts replying to it (comments). */
  replies: number;
  /** Posts sharing it (embedding the link). */
  posts: number;
}
