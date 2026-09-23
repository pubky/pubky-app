import { FileVariant } from '@/services/nexus/file/file.types';

/**
 * Variant the post page renders as its cover, and the one its preload must ask
 * for. One constant on purpose: if the preload requested a different variant
 * than the `<img>` renders, the browser would download the image twice.
 *
 * `feed` (720 px WebP) is the hero's source for now. It used to ask for `main`,
 * the original upload (a 2048x683 PNG, 1.9 MB for the post in #2633), and the
 * high-priority preload pulled that over the app JS: FCP got worse, ~4.65 s
 * against ~3.9 s before the preload, and LCP ~5.8 s. With `feed` the cover is
 * 43 KB and FCP/LCP come back to ~4.0 s / ~5.2 s.
 *
 * pubky/pubky-nexus#1083 tracks a ~1440 px WebP hero variant. Once it exists,
 * the hero and the preload move to one `srcset` (`feed 720w` + `1440w`) with
 * matching `imageSrcSet`/`imageSizes` on the preload, and this constant becomes
 * the fallback source. Until then both sides read it from here.
 */
export const POST_COVER_VARIANT = FileVariant.FEED;
