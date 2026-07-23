'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { BookOpen, Eye, UserRoundPlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES, AUTH_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { LANDING_HERO_SECTION_ID, LANDING_NEXT_SECTION_ID } from '@/templates/Public/Landing/Landing.constants';
import { HeaderSocialLinks } from '../Header/Header';
import { HeaderButtonSignIn } from '../HeaderButtonSignIn/HeaderButtonSignIn';

export const HeaderHome = ({ ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const router = useRouter();
  const t = useTranslations('landing');
  const pathname = usePathname();
  const [showJoinButton, setShowJoinButton] = React.useState(false);

  const isLandingPage = pathname === '/';
  const isLogoutPage = pathname === AUTH_ROUTES.LOGOUT;

  React.useEffect(() => {
    setShowJoinButton(false);

    if (!isLandingPage) return;
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
  }, [isLandingPage]);

  const handleJoin = () => {
    router.push(ONBOARDING_ROUTES.HUMAN);
  };

  const handleLearn = () => {
    router.push(`/#${LANDING_NEXT_SECTION_ID}`);
  };

  const handleExplore = () => {
    router.push(APP_ROUTES.HOME);
  };

  if (isLogoutPage) {
    return (
      <Container className="flex-1 flex-row items-center justify-end gap-3" {...props}>
        <Button
          id="header-learn-btn"
          data-testid="header-learn-btn"
          variant="outline"
          onClick={handleLearn}
          className="hidden gap-2 md:inline-flex"
        >
          <BookOpen className="size-4" />
          {t('learn')}
        </Button>
        <Button
          id="header-explore-btn"
          data-testid="header-explore-btn"
          variant="outline"
          onClick={handleExplore}
          className="hidden gap-2 md:inline-flex"
        >
          <Eye className="size-4" />
          {t('explore')}
        </Button>
        <HeaderButtonSignIn />
      </Container>
    );
  }

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
            <div className="flex shrink-0 items-center px-2">
              <Button
                id="header-join-btn"
                variant="brand"
                onClick={handleJoin}
                className="size-10 shrink-0 gap-0 px-0 whitespace-nowrap sm:h-10 sm:w-auto sm:gap-2 sm:px-4"
              >
                <UserRoundPlus className="size-4" />
                <span className="sr-only sm:not-sr-only">{t('join')}</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <HeaderButtonSignIn />
    </Container>
  );
};
