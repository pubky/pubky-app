'use client';

import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { SHOP_CAPABILITIES } from '@/config/auth';
import { useShopEmbed } from '@/hooks/useShopEmbed/useShopEmbed';
import { MobileFooter } from '@/molecules/MobileFooter/MobileFooter';
import { MobileHeader } from '@/molecules/MobileHeader/MobileHeader';
import { SessionUpgradePanel } from '@/organisms/SessionUpgradePanel/SessionUpgradePanel';
import { ShopUnavailable } from '@/organisms/ShopUnavailable/ShopUnavailable';

/** The layout owns this frame so catch-all navigation does not unmount its account lifecycle. */
export function ShopEmbed() {
  const { iframe, initialSrc, unavailable, upgradeOpen, closeUpgrade, requestLogin, handleFrameLoad } = useShopEmbed();
  if (unavailable) return <ShopUnavailable />;
  return (
    <Container
      overrideDefaults
      className="flex h-dvh flex-col lg:h-[calc(100dvh-var(--header-offset-main))]"
      data-testid="shop-shell"
    >
      <MobileHeader showLeftButton={false} showRightButton={false} />
      {/* Shop owns document scrolling. Desktop reserves space for the App header;
          mobile chrome shares the full-height shell with the frame. The frame spans the
          window width so the wheel reaches Shop beside its content; Shop centres its own column. */}
      <Container overrideDefaults className="flex min-h-0 flex-1 flex-col">
        {initialSrc ? (
          <iframe
            ref={iframe}
            src={initialSrc}
            title="Pubky Shop"
            onLoad={handleFrameLoad}
            className="min-h-0 w-full flex-1 border-0"
            // Trusted first-party code shares this origin. Payments may navigate the top window
            // after asynchronous approval, so a user-activation sandbox would break their return flow.
            allow="clipboard-write"
          />
        ) : (
          <Skeleton className="min-h-0 w-full flex-1" />
        )}
      </Container>
      <MobileFooter className="relative shrink-0" />
      <Dialog
        open={upgradeOpen}
        onOpenChange={(open) => {
          if (!open) closeUpgrade();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{'Enable Shop'}</DialogTitle>
            <DialogDescription>
              {
                'Use Pubky Ring or Bitkit to approve access to your Shop and Paykit data with the Pubky account you are signed in with.'
              }
            </DialogDescription>
          </DialogHeader>
          {upgradeOpen && <SessionUpgradePanel requiredCapabilities={SHOP_CAPABILITIES} />}
          <Button variant="outline" onClick={requestLogin}>
            {'Use Passport or recovery key'}
          </Button>
          <Button variant="outline" onClick={closeUpgrade}>
            {'Cancel'}
          </Button>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
