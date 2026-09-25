import { FileVariant } from '@/services/nexus/file/file.types';

/**
 * The two variants the article hero picks between, and the media query that picks.
 *
 * Below the desktop breakpoint the hero renders `feed` (a 720 px WebP, 43 KB for the post in
 * #2633) and above it `large`, the 1440 px WebP Nexus derives on request, so a phone never
 * downloads a multi-megabyte file at any device pixel ratio and a wide screen no longer has to
 * fall back to the untouched upload to get more detail than `feed` can carry.
 *
 * A `srcset` cannot express that choice: the browser picks a candidate by `sizes × DPR`, so a 3x
 * phone asks for roughly 1170w and takes the largest candidate. Measured on a 390 CSS px viewport
 * with `srcset="feed 720w, main 2048w"` and `sizes="100vw"`: DPR 1 fetches `feed`, DPR 2 and
 * DPR 3 fetch `main`.
 *
 * The preload and the `<img>` read these constants, so the URL the browser is told about early
 * is the one it renders: one download, never two.
 */
export const POST_COVER_MOBILE_VARIANT = FileVariant.FEED;
export const POST_COVER_DESKTOP_VARIANT = FileVariant.LARGE;

/** Tailwind `lg`: at and above it the hero's column is wide enough to want more than `feed`. */
export const POST_COVER_DESKTOP_MEDIA = '(min-width: 1024px)';

/**
 * The complement of {@link POST_COVER_DESKTOP_MEDIA}, so exactly one of the two preloads (and
 * exactly one `<source>` candidate) matches on every viewport.
 */
export const POST_COVER_MOBILE_MEDIA = '(max-width: 1023.98px)';
