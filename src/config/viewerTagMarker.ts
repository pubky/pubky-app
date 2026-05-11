/**
 * Wall-clock TTL for viewer-mutation markers in sessionStorage.
 * Roughly the Nexus indexer lag window — after this, any Nexus response
 * is assumed to reflect the viewer's mutation, so the marker no longer
 * needs to protect anything.
 */
export const MARKER_TTL_MS = 300_000;

/** Prefix for sessionStorage keys storing viewer-mutation markers. */
export const VIEWER_TAG_MARKER_STORAGE_PREFIX = 'pubky-app:viewer-tag-marker:';
