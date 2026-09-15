'use client';

import { useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { usePulseConsent } from '@/hooks/usePulseConsent/usePulseConsent';
import { SettingsSwitchItem } from '@/molecules/Settings/SettingsSwitchItem/SettingsSwitchItem';

const CONSENT_DESCRIPTION =
  'Allow Pubky Pulse to store an anonymous ID in this browser and measure how you use Pubky across visits, including page views, network performance and errors. This helps us improve the app.';
const SAVE_ERROR = 'Analytics is off, but your choice could not be saved. Please check your browser storage settings.';

export function PulseConsentBanner() {
  const { consent, choose, saveFailed } = usePulseConsent();
  const [open, setOpen] = useState(false);
  if (consent === 'unavailable') return null;

  if (consent !== null && !open) {
    // Guests need the same withdrawal access as signed-in users, without creating an account.
    return (
      <Button
        variant="secondary"
        size="sm"
        className="fixed bottom-24 left-4 z-40 text-xs sm:bottom-4"
        onClick={() => setOpen(true)}
      >
        Analytics settings
      </Button>
    );
  }

  return (
    <section
      aria-label="Analytics consent"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-2xl flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-lg sm:bottom-4 sm:p-6"
    >
      <div className="space-y-2">
        <Typography as="h2" size="lg" className="font-semibold">
          Help improve Pubky
        </Typography>
        <Typography size="sm" className="text-muted-foreground">
          {CONSENT_DESCRIPTION}
        </Typography>
        <Typography size="sm" className="text-muted-foreground">
          Optional. You can use Pubky without analytics and change your choice anytime in Analytics settings or Settings
          → Privacy and Safety.
        </Typography>
      </div>
      {saveFailed && (
        <p role="alert" className="text-sm text-destructive">
          {SAVE_ERROR}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(!choose(false))}>
          {consent === 'accepted' ? 'Withdraw consent' : 'Decline'}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(!choose(true))}>
          Accept
        </Button>
        {saveFailed && (
          // A failed save keeps the banner open to show the error, so it needs its own way out.
          <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
            Close
          </Button>
        )}
      </div>
    </section>
  );
}

export function PulseConsentSettings() {
  const { consent, choose, saveFailed } = usePulseConsent();
  if (consent === 'unavailable') return null;
  return (
    <div className="space-y-3">
      <SettingsSwitchItem
        id="pulse-analytics-consent"
        label="Optional analytics"
        description={`${CONSENT_DESCRIPTION} Turn off anytime to withdraw consent on this browser.`}
        checked={consent === 'accepted'}
        onChange={choose}
      />
      {saveFailed && (
        <p role="alert" className="text-sm text-destructive">
          {SAVE_ERROR}
        </p>
      )}
    </div>
  );
}
