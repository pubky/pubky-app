'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import { SlidersHorizontal, UserRound, Activity } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
import { useAuthStore } from '@/stores/auth/auth.store';
export interface MobileHeaderProps {
  onLeftIconClick?: () => void;
  onRightIconClick?: () => void;
  showLeftButton?: boolean;
  showRightButton?: boolean;
  hasGradientBackground?: boolean;
  fixed?: boolean;
}
const Placeholder = () => <Atoms.Container overrideDefaults className="w-10" />;
export function MobileHeader({
  onLeftIconClick,
  onRightIconClick,
  showLeftButton = true,
  showRightButton = true,
  hasGradientBackground = true,
  fixed = false,
}: MobileHeaderProps) {
  const isAuthenticated = useAuthStore((state) => Boolean(state.currentUserPubky));
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);
  const showLeftIcon = showLeftButton && isAuthenticated;
  return (
    <Atoms.Container
      overrideDefaults
      className={cn(
        fixed ? 'fixed inset-x-0' : 'sticky',
        'top-0 z-(--z-mobile-menu) w-full lg:hidden',
        hasGradientBackground
          ? 'bg-linear-to-b from-(--background) from-35% to-transparent'
          : 'bg-background shadow-xs',
      )}
    >
      <Atoms.Container overrideDefaults className="flex w-full items-center justify-between p-6">
        {/* Left icon - filters (authenticated only) */}
        {showLeftIcon ? (
          <Atoms.Button variant="ghost" size="icon" onClick={onLeftIconClick}>
            <SlidersHorizontal className="size-6" />
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
            <UserRound className="size-6" />
          </Atoms.Button>
        ) : showRightButton ? (
          <Atoms.Button variant="ghost" size="icon" onClick={onRightIconClick}>
            <Activity className="size-6" />
          </Atoms.Button>
        ) : (
          <Placeholder />
        )}
      </Atoms.Container>
    </Atoms.Container>
  );
}
