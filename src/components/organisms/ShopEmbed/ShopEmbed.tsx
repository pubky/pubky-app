'use client';

import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { SHOP_CAPABILITIES } from '@/config/auth';
import { useShopEmbed } from '@/hooks/useShopEmbed/useShopEmbed';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { SessionUpgradePanel } from '@/organisms/SessionUpgradePanel/SessionUpgradePanel';
import { ShopUnavailable } from '@/organisms/ShopUnavailable/ShopUnavailable';

/** The layout owns this frame so catch-all navigation does not unmount its account lifecycle. */
export function ShopEmbed() {
  const { iframe, initialSrc, unavailable, upgradeOpen, closeUpgrade, requestLogin, handleFrameLoad } = useShopEmbed();
  if (unavailable) return <ShopUnavailable />;
  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
    >
      {initialSrc ? (
        <iframe
          ref={iframe}
          src={initialSrc}
          title="Pubky Shop"
          onLoad={handleFrameLoad}
          className="min-h-[75dvh] w-full flex-1 border-0"
          // Trusted first-party code shares this origin. Payments may navigate the top window
          // after asynchronous approval, so a user-activation sandbox would break their return flow.
          allow="clipboard-write"
        />
      ) : (
        <Skeleton className="min-h-[75dvh] w-full" />
      )}
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
    </ContentLayout>
  );
}
