import { OG_CONTENT_TYPE, OG_SIZE } from '@/libs/og/ogConstants';

// Twitter card reuses the same 1200x630 PNG as the OpenGraph image. Only the
// render fn is re-exported; segment/metadata config must be declared locally
// (Next cannot statically parse re-exported `revalidate`/`size`/etc.).
export { default } from './opengraph-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Pubky profile preview';
export const revalidate = 3600;
