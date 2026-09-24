import { FileVariant } from '@/services/nexus/file/file.types';

/**
 * The two variants the article hero picks between, and the media query that picks.
 *
 * Below the desktop breakpoint the hero renders `feed` (a 720 px WebP, 43 KB for the post in
 * #2633) and above it the original upload, so a phone never downloads a multi-megabyte file at
 * any device pixel ratio while a wide screen keeps the detail `feed` cannot.
 *
 * A `srcset` cannot express that choice: the browser picks a candidate by `sizes × DPR`, so a 3x
 * phone asks for roughly 1170w and takes the original upload. Measured on a 390 CSS px viewport
 * with `srcset="feed 720w, main 2048w"` and `sizes="100vw"`: DPR 1 fetches `feed`, DPR 2 and
 * DPR 3 fetch `main`.
 *
 * The preload and the `<img>` read these constants, so the URL the browser is told about early
 * is the one it renders: one download, never two.
 *
 * pubky/pubky-nexus#1083 tracks a ~1440 px WebP hero variant, which takes the desktop slot here
 * (and then earns a `srcset` of its own) once it exists.
 */
export const POST_COVER_MOBILE_VARIANT = FileVariant.FEED;
export const POST_COVER_DESKTOP_VARIANT = FileVariant.MAIN;

/** Tailwind `lg`: at and above it the hero's column is wide enough to want the original. */
export const POST_COVER_DESKTOP_MEDIA = '(min-width: 1024px)';

/**
 * The complement of {@link POST_COVER_DESKTOP_MEDIA}, so exactly one of the two preloads (and
 * exactly one `<source>` candidate) matches on every viewport.
 */
export const POST_COVER_MOBILE_MEDIA = '(max-width: 1023.98px)';
