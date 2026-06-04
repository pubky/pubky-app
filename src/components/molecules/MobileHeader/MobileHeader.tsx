'use client';
import { Activity, SlidersHorizontal, UserRound } from 'lucide-react';
import type React from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { usePublicRoute } from '@/hooks/usePublicRoute/usePublicRoute';
import { cn } from '@/libs/utils/utils';
import { useAuthStore } from '@/stores/auth/auth.store';
import { Logo } from '../Logo/Logo';

export interface MobileHeaderProps {
  onLeftIconClick?: () => void;
  onRightIconClick?: () => void;
  showLeftButton?: boolean;
  showRightButton?: boolean;
  hasGradientBackground?: boolean;
  fixed?: boolean;
  containerClassName?: string;
}
const SideSlot = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <Container overrideDefaults className={cn('flex size-12 shrink-0 items-center justify-center', className)}>
    {children}
  </Container>
);

export function MobileHeader({
  onLeftIconClick,
  onRightIconClick,
  showLeftButton = true,
  showRightButton = true,
  hasGradientBackground = true,
  fixed = false,
  containerClassName,
}: MobileHeaderProps) {
  const isAuthenticated = useAuthStore((state) => Boolean(state.currentUserPubky));
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);
  const { isCoreExploreRoute } = usePublicRoute();
  const showLeftIcon = showLeftButton && (isAuthenticated || isCoreExploreRoute);
  return (
    <Container
      overrideDefaults
      className={cn(
        fixed ? 'fixed inset-x-0' : 'sticky',
        'top-0 z-(--z-mobile-menu) w-full lg:hidden',
        hasGradientBackground
          ? 'bg-linear-to-b from-(--background) from-35% to-transparent'
          : 'bg-background shadow-xs',
      )}
    >
      <Container
        overrideDefaults
        className={cn('relative flex min-h-12 w-full items-center justify-between p-6', containerClassName)}
      >
        {/* Left icon - filters (authenticated only) */}
        <SideSlot>
          {showLeftIcon ? (
            <Button variant="ghost" size="icon" onClick={onLeftIconClick}>
              <SlidersHorizontal className="size-6" />
            </Button>
          ) : null}
        </SideSlot>

        <Logo />

        {/* Right icon - always Activity; action depends on auth */}
        {showRightButton ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-12 shrink-0"
            onClick={() => {
              if (!isAuthenticated) {
                setShowSignInDialog(true);
                return;
              }
              onRightIconClick?.();
            }}
            aria-label="Join Pubky"
          >
            <UserRound className="size-6" />
          </Button>
        ) : (
          <SideSlot>
            {showRightButton ? (
              <Button variant="ghost" size="icon" onClick={onRightIconClick}>
                <Activity className="size-6" />
              </Button>
            ) : null}
          </SideSlot>
        )}
      </Container>
    </Container>
  );
}
