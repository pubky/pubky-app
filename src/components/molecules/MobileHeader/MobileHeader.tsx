'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Core from '@/core';
import * as Libs from '@/libs';

export interface MobileHeaderProps {
  onLeftIconClick?: () => void;
  onRightIconClick?: () => void;
  showLeftButton?: boolean;
  showRightButton?: boolean;
  hasGradientBackground?: boolean;
}

const Placeholder = () => <Atoms.Container overrideDefaults className="w-10" />;

export function MobileHeader({
  onLeftIconClick,
  onRightIconClick,
  showLeftButton = true,
  showRightButton = true,
  hasGradientBackground = true,
}: MobileHeaderProps) {
  const isAuthenticated = Core.useAuthStore((state) => Boolean(state.currentUserPubky));
  const setShowSignInDialog = Core.useAuthStore((state) => state.setShowSignInDialog);

  const showLeftIcon = showLeftButton && isAuthenticated;

  return (
    <Atoms.Container
      overrideDefaults
      className={Libs.cn(
        'sticky top-0 z-(--z-mobile-menu) lg:hidden',
        hasGradientBackground
          ? 'bg-linear-to-b from-(--background) from-65% to-transparent'
          : 'bg-background shadow-xs-dark',
      )}
    >
      <Atoms.Container overrideDefaults className="px-6 pt-6 pb-0">
        <Atoms.Container overrideDefaults className="flex items-center justify-between py-3">
          {/* Left icon - filters (authenticated only) */}
          {showLeftIcon ? (
            <Atoms.Button variant="ghost" size="icon" onClick={onLeftIconClick}>
              <Libs.SlidersHorizontal className="size-6" />
            </Atoms.Button>
          ) : (
            <Placeholder />
          )}

          <Molecules.Logo />

          {/* Right icon - Join for unauthenticated, Activity for authenticated */}
          {!isAuthenticated ? (
            <Atoms.Button
              variant="secondary"
              size="icon"
              className="size-12"
              onClick={() => setShowSignInDialog(true)}
              aria-label="Join Pubky"
            >
              <Libs.UserRound className="size-6" />
            </Atoms.Button>
          ) : showRightButton ? (
            <Atoms.Button variant="ghost" size="icon" onClick={onRightIconClick}>
              <Libs.Activity className="size-6" />
            </Atoms.Button>
          ) : (
            <Placeholder />
          )}
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Container>
  );
}
