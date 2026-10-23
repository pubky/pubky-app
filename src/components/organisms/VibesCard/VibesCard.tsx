'use client';

import { WandSparkles } from 'lucide-react';
import { FilterHeader, FilterRoot } from '@/atoms/Filter/Filter';
import { SidebarButton } from '@/atoms/SidebarButton/SidebarButton';
import { VibesLink } from '@/molecules/VibesLink/VibesLink';

/** Permanent sidebar entry point, available even after the home alert is dismissed. */
export function VibesCard() {
  return (
    <FilterRoot data-testid="vibes-card">
      <FilterHeader title="Experimental" subtitle="Get a taste of the future." />
      <SidebarButton icon={WandSparkles} asChild>
        <VibesLink>Try vibes.pubky.app</VibesLink>
      </SidebarButton>
    </FilterRoot>
  );
}
