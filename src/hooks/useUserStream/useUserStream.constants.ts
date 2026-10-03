// Nexus rejects `limit` above 20 on `/v0/stream/users/ids` with a 400, so no page size here may go
// above it. This cap is stricter than NEXUS_STREAM_MAX_LIMIT, which only holds for post streams.
export const DEFAULT_USER_STREAM_LIMIT = 3;
export const DEFAULT_USER_STREAM_PAGE_SIZE = 20;
export const DEFAULT_USER_STREAM_BUFFER_SIZE = 10;
export const DEFAULT_USER_STREAM_REFILL_THRESHOLD = 6;
export const WHO_TO_FOLLOW_USER_LIMIT = 3;
export const WHO_TO_FOLLOW_BUFFER_SIZE = 10;
export const WHO_TO_FOLLOW_REFILL_THRESHOLD = 6;
export const WHO_TO_FOLLOW_PAGE_SIZE = 20;
