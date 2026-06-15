'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserRoundPlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { LANDING_HERO_SECTION_ID } from '@/templates/Public/Landing/Landing.constants';
import { HeaderSocialLinks } from '../Header/Header';
import { HeaderButtonSignIn } from '../HeaderButtonSignIn/HeaderButtonSignIn';

export const HeaderHome = ({ ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const router = useRouter();
  const t = useTranslations('landing');
  const [showJoinButton, setShowJoinButton] = React.useState(false);

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const heroSection = document.getElementById(LANDING_HERO_SECTION_ID);

    if (!heroSection) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.find(({ target }) => target === heroSection);

        if (entry) {
          setShowJoinButton(!entry.isIntersecting);
        }
      },
      {
        rootMargin: '-30% 0px -35% 0px',
        threshold: 0,
      },
    );

    observer.observe(heroSection);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleJoin = () => {
    router.push(ONBOARDING_ROUTES.HUMAN);
  };

  return (
    <Container className="flex-1 flex-row items-center justify-end" {...props}>
      <HeaderSocialLinks />
      <AnimatePresence initial={false}>
        {showJoinButton && (
          <motion.div
            className="mr-1 flex shrink-0 items-center overflow-hidden"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <div className="flex shrink-0 items-center p-2">
              <Button
                id="header-join-btn"
                variant="brand"
                onClick={handleJoin}
                className="shrink-0 gap-2 whitespace-nowrap"
              >
                <UserRoundPlus className="size-4" />
                {t('join')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <HeaderButtonSignIn />
    </Container>
  );
};
