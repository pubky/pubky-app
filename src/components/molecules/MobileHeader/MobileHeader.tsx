'use client';
import { Activity, SlidersHorizontal } from 'lucide-react';
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
}
const Placeholder = () => <Container overrideDefaults className="w-10" />;
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
      <Container overrideDefaults className="flex w-full items-center justify-between p-6">
        {/* Left icon - filters (authenticated only) */}
        {showLeftIcon ? (
          <Button variant="ghost" size="icon" onClick={onLeftIconClick}>
            <SlidersHorizontal className="size-6" />
          </Button>
        ) : (
          <Placeholder />
        )}

        <Logo />

        {/* Right icon - always Activity; action depends on auth */}
        {showRightButton ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (!isAuthenticated) {
                setShowSignInDialog(true);
                return;
              }
              onRightIconClick?.();
            }}
          >
            <Activity className="size-6" />
          </Button>
        ) : (
          <Placeholder />
        )}
      </Container>
    </Container>
  );
}
