/** Tags one card asks for: more than a card shows, so its character budget picks the visible ones. */
export const RESOURCE_TAGS_LIMIT = 20;

/**
 * When, after a tag write, a card reads the link's tags again (ms after the write). Until the last
 * read the viewer's write is kept over answers that do not show it yet; then answers show as they are.
 */
export const RESOURCE_TAG_REREADS_MS = [5_000, 15_000] as const;

/** How old a write Nexus' answer still does not show is when it is dropped from the answers. */
export const RESOURCE_TAG_UNCONFIRMED_MS = RESOURCE_TAG_REREADS_MS[RESOURCE_TAG_REREADS_MS.length - 1];

/** Links one `POST /v1/stream/resources/by_ids` request carries (the route's limit). */
export const RESOURCE_BY_IDS_MAX = 100;

/**
 * Tag reads of links are collected into one `by_ids` request until none came for this long (ms): a
 * feed's cards mount a few milliseconds apart, each once its Pinakes card is read.
 */
export const RESOURCE_BY_IDS_BATCH_MS = 10;

/** The longest a tag read waits for others to join its `by_ids` request (ms). */
export const RESOURCE_BY_IDS_BATCH_MAX_MS = 100;

/** The longest URI Nexus takes (bytes); a longer link is read by `by-uri` alone. */
export const RESOURCE_URI_MAX_BYTES = 2048;

/** `by-uri` tag reads at once (a Nexus without `by_ids`, or links a batch did not answer). */
export const RESOURCE_BY_URI_READS_AT_ONCE = 6;

/** How long a tag read (`by_ids` or `by-uri`) may take before it fails as a timeout (ms). */
export const RESOURCE_READ_TIMEOUT_MS = 10_000;

/** The one sorting `GET /v0/stream/resources` serves: the latest tagged first. */
export const RESOURCE_STREAM_SORTING = 'timeline';

/** Tags one `GET /v0/stream/resources` request filters by (the route refuses more). */
export const RESOURCE_STREAM_MAX_TAGS = 5;
