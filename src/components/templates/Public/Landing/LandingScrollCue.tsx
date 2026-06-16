'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/libs/utils/utils';
import {
  LANDING_FINAL_SECTION_ID,
  LANDING_FREEDOM_SECTION_ID,
  LANDING_HERO_SECTION_ID,
  LANDING_HOW_SECTION_ID,
  LANDING_NEXT_SECTION_ID,
} from './Landing.constants';

export function LandingScrollCue() {
  const t = useTranslations('landing');
  const [targetSectionId, setTargetSectionId] = useState(LANDING_NEXT_SECTION_ID);
  const [isBackToTop, setIsBackToTop] = useState(false);
  const [showCueOnMobile, setShowCueOnMobile] = useState(true);

  useEffect(() => {
    const sections = [
      { id: LANDING_HERO_SECTION_ID, state: 'hero' },
      { id: LANDING_NEXT_SECTION_ID, state: 'broken' },
      { id: LANDING_HOW_SECTION_ID, state: 'how' },
      { id: LANDING_FREEDOM_SECTION_ID, state: 'freedom' },
      { id: LANDING_FINAL_SECTION_ID, state: 'final' },
    ] as const;
    const visibleSections = new Set<(typeof sections)[number]['state']>();
    const targets = sections.flatMap((section) => {
      const element = document.getElementById(section.id);

      return element ? [{ ...section, element }] : [];
    });

    if (!targets.length) return;

    const updateTarget = () => {
      if (!visibleSections.size) return;

      setShowCueOnMobile(visibleSections.has('hero') || visibleSections.has('final'));

      if (visibleSections.has('final')) {
        setTargetSectionId(LANDING_HERO_SECTION_ID);
        setIsBackToTop(true);
        return;
      }

      setIsBackToTop(false);
      setTargetSectionId(
        visibleSections.has('freedom')
          ? LANDING_FINAL_SECTION_ID
          : visibleSections.has('how')
            ? LANDING_FREEDOM_SECTION_ID
            : visibleSections.has('broken')
              ? LANDING_HOW_SECTION_ID
              : LANDING_NEXT_SECTION_ID,
      );
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const section = targets.find((target) => target.element === entry.target);

          if (!section) return;

          if (entry.isIntersecting) {
            visibleSections.add(section.state);
          } else {
            visibleSections.delete(section.state);
          }
        });
        updateTarget();
      },
      {
        rootMargin: '-30% 0px -35% 0px',
        threshold: 0,
      },
    );

    targets.forEach(({ element }) => observer.observe(element));

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleClick = () => {
    if (isBackToTop) {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      return;
    }

    document.getElementById(targetSectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      className={cn(
        'landing-scroll-cue group fixed bottom-12 left-1/2 z-20 flex size-12 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-300 hover:text-brand focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none sm:bottom-6',
        !showCueOnMobile && 'max-sm:hidden',
      )}
      aria-label={isBackToTop ? t('scrollToTop') : t('scrollToNext')}
      onClick={handleClick}
    >
      <span className={cn('transition-transform duration-300', isBackToTop && 'rotate-180')}>
        <ChevronDown className="landing-scroll-cue__icon size-8" strokeWidth={1.5} />
      </span>
    </button>
  );
}
