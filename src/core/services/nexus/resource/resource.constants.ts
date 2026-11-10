/** Tags one card asks for: more than a card shows, so its character budget picks the visible ones. */
export const RESOURCE_TAGS_LIMIT = 20;

/**
 * When, after a tag write, a card reads the link's tags again (ms after the write). Until the last
 * read the viewer's write is kept over answers that do not show it yet; then answers show as they are.
 */
export const RESOURCE_TAG_REREADS_MS = [5_000, 15_000] as const;

/** How old a write Nexus' answer still does not show is when it is dropped from the answers. */
export const RESOURCE_TAG_UNCONFIRMED_MS = RESOURCE_TAG_REREADS_MS[RESOURCE_TAG_REREADS_MS.length - 1];
