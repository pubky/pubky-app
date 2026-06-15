'use client';

import { useEffect } from 'react';
import {
  LANDING_FINAL_SECTION_ID,
  LANDING_FREEDOM_SECTION_ID,
  LANDING_HERO_SECTION_ID,
  LANDING_HOW_SECTION_ID,
  LANDING_NEXT_SECTION_ID,
} from './Landing.constants';

export function LandingSwirlState() {
  useEffect(() => {
    const root = document.documentElement;
    const sections = [
      { id: LANDING_HERO_SECTION_ID, state: 'home' },
      { id: LANDING_NEXT_SECTION_ID, state: 'broken' },
      { id: LANDING_HOW_SECTION_ID, state: 'how' },
      { id: LANDING_FREEDOM_SECTION_ID, state: 'freedom' },
      { id: LANDING_FINAL_SECTION_ID, state: 'final' },
    ] as const;
    const targets = sections.flatMap((section) => {
      const element = document.getElementById(section.id);

      return element ? [{ ...section, element }] : [];
    });

    if (!targets.length) return;

    let animationFrame = 0;

    const updateState = () => {
      const viewportAnchor = window.innerHeight * 0.5;
      const activeTarget =
        targets.find(({ element }) => {
          const rect = element.getBoundingClientRect();

          return rect.top <= viewportAnchor && rect.bottom > viewportAnchor;
        }) ??
        targets.reduce((closest, target) => {
          const closestDistance = Math.abs(closest.element.getBoundingClientRect().top - viewportAnchor);
          const targetDistance = Math.abs(target.element.getBoundingClientRect().top - viewportAnchor);

          return targetDistance < closestDistance ? target : closest;
        });

      if (root.dataset.landingSwirl !== activeTarget.state) {
        root.dataset.landingSwirl = activeTarget.state;
      }
    };

    const scheduleUpdate = () => {
      if (animationFrame) return;

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateState();
      });
    };

    updateState();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      delete root.dataset.landingSwirl;
    };
  }, []);

  return null;
}
