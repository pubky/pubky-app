'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import type { SinglePostProps } from './SinglePost.types';

/**
 * SinglePost Template
 *
 * Displays a single post page with:
 * - Main post card (FULL WIDTH) with tags panel in two-column layout
 * - Below: Two columns with Replies timeline (larger) and Participants sidebar (smaller)
 *
 * This template uses a FIXED layout that doesn't change based on user preferences.
 * All hook logic is delegated to the SinglePostContent organism.
 */
export function SinglePost({ postId }: SinglePostProps) {
  return (
    <>
      {/* Mobile header */}
      <Molecules.MobileHeader showLeftButton={false} showRightButton={false} />

      {/* Main content container */}
      <Atoms.Container
        overrideDefaults
        className={Libs.cn('max-w-(--container-max-width)', 'm-auto w-full px-6 pb-12 xl:px-0', 'pt-0')}
      >
        <Organisms.SinglePostContent postId={postId} />
      </Atoms.Container>

      {/* Mobile footer navigation */}
      <Molecules.MobileFooter />
    </>
  );
}
