'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { CONTENT_GUTTER_CLASS } from '@/config/layoutClasses';
import { cn } from '@/libs/utils/utils';
import { LANDING_FREEDOM_SECTION_ID } from './Landing.constants';

const SLIDE_DURATION_MS = 6000;

const FEATURES: Array<{ key: string; backgroundImage: string; title: string; description: string }> = [
  {
    key: 'creation',
    backgroundImage: '/images/landing-experience1.png',
    title: 'Create without limits',
    description: 'Post anything: thoughts, articles, photos, videos, links. Your content starts with you, and stays with you.',
  },
  {
    key: 'browsing',
    backgroundImage: '/images/landing-experience2.png',
    title: 'Browse your way',
    description: 'Switch between layouts or change your reach to filter out the noise, and focus on what matters.',
  },
  {
    key: 'feeds',
    backgroundImage: '/images/landing-experience3.png',
    title: 'Shape perspectives',
    description: 'Build dynamic feeds that update in real time and stay saved as reusable perspectives.',
  },
  {
    key: 'tagging',
    backgroundImage: '/images/landing-experience4.webp',
    title: 'Tag everything',
    description: 'Tag posts, media, and profiles to add context, find better content, discover people, and react quickly.',
  },
  {
    key: 'collections',
    backgroundImage: '/images/landing-experience5.png',
    title: 'Collect what matters',
    description: 'Save posts worth keeping, curate your own ideas, and share your collections with others.',
  },
  {
    key: 'locks',
    backgroundImage: '/images/landing-experience6.webp',
    title: 'Sell your content',
    description: 'Put a price on your content with Pubky Locks. Let people pay to unlock the value you create.',
  },
  {
    key: 'market',
    backgroundImage: '/images/landing-experience7.webp',
    title: 'Make a living',
    description: 'Sell products on Pubky Market. Turn your key into a shop and connect directly with buyers.',
  },
];

export function LandingFreedomSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isSectionVisible, setIsSectionVisible] = useState(false);
  const [carouselRun, setCarouselRun] = useState(0);

  const handleNextSlide = useCallback(() => {
    setActiveSlide((currentSlide) => (currentSlide + 1) % FEATURES.length);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.isIntersecting;
        setIsSectionVisible(isVisible);

        if (isVisible) {
          setActiveSlide(0);
          setCarouselRun((currentRun) => currentRun + 1);
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isSectionVisible) return;

    const timeoutId = window.setTimeout(handleNextSlide, SLIDE_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeSlide, carouselRun, handleNextSlide, isSectionVisible]);

  const slideNumber = String(activeSlide + 1).padStart(2, '0');

  return (
    <section
      ref={sectionRef}
      id={LANDING_FREEDOM_SECTION_ID}
      className="relative z-0 min-h-svh scroll-mt-[48px] py-10 sm:py-24"
    >
      <Container size="container" className={cn('gap-10', CONTENT_GUTTER_CLASS)}>
        <Container className="mx-0 max-w-[760px] gap-5">
          <Typography as="span" size="xs" className="text-brand tracking-[1.2px] uppercase">
            {'Built for freedom'}
          </Typography>
          <Heading level={2} size="xl" className="max-w-[680px] text-4xl sm:text-6xl lg:max-w-none lg:whitespace-nowrap">
            {'You are '}
            <br className="sm:hidden" />
            <span className="text-brand">{'the algorithm'}</span>
            {'.'}
          </Heading>
          <Typography size="md" className="max-w-[680px] text-muted-foreground sm:text-xl">
            {'Nobody feeds you. Create, shape, and experience the web on your terms.'}
          </Typography>
        </Container>
        <article className="relative min-h-[560px] overflow-hidden rounded-md bg-card/80 p-12 pb-80 shadow-sm backdrop-blur-sm md:min-h-[368px] md:pb-24">
          {FEATURES.map(({ key, backgroundImage }, index) => (
            <div
              key={key}
              className={`absolute inset-x-0 bottom-0 h-80 bg-[length:auto_100%] bg-no-repeat opacity-0 transition-opacity duration-500 ease-in-out [background-position:calc(50%+100px)_100%] md:inset-0 md:h-auto md:bg-cover md:bg-center ${
                activeSlide === index ? 'opacity-100' : ''
              }`}
              style={{ backgroundImage: `url(${backgroundImage})` }}
              aria-hidden
            />
          ))}
          <div className="relative z-10 flex items-start gap-5 md:ml-auto md:w-3/10 md:min-w-80">
            <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand/15 text-brand">
              <div
                key={`${carouselRun}-${activeSlide}`}
                className="absolute inset-0 origin-bottom animate-[landing-carousel-progress-fill_6000ms_linear_forwards] bg-brand/32"
                aria-hidden
              />
              <Typography as="span" overrideDefaults className="text-xl font-semibold leading-none">
                {slideNumber}
              </Typography>
            </div>
            <div className="grid min-w-0 flex-1">
              {FEATURES.map(({ key, title, description }, index) => (
                <div
                  key={key}
                  className={cn('col-start-1 row-start-1', activeSlide !== index && 'invisible')}
                  aria-hidden={activeSlide !== index}
                >
                  <Typography as="h3" size="lg" className="text-xl">
                    {title}
                  </Typography>
                  <Typography size="sm" className="mt-1 text-muted-foreground sm:text-base">
                    {description}
                  </Typography>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 md:absolute md:inset-x-12 md:bottom-10 md:z-10 md:mt-0">
            <div className="pl-12 md:ml-auto md:w-3/10 md:min-w-80">
              <div className="-mr-4 ml-5 flex items-center md:-mr-2">
                <div role="group" aria-label="Slide navigation" className="relative z-10 -ml-2.25 flex w-42 shrink-0">
                  {FEATURES.map(({ key, title }, index) => (
                    <Button
                      key={key}
                      overrideDefaults
                      type="button"
                      className="group/dot flex h-12 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                      aria-label={`Go to slide ${index + 1}: ${title}`}
                      aria-current={activeSlide === index ? 'true' : undefined}
                      onClick={() => {
                        setActiveSlide(index);
                        setCarouselRun((currentRun) => currentRun + 1);
                      }}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'size-1.5 shrink-0 rounded-full bg-brand transition-all duration-200 group-hover/dot:scale-125',
                          activeSlide === index ? 'opacity-100' : 'opacity-30 group-hover/dot:opacity-50',
                        )}
                      />
                    </Button>
                  ))}
                </div>
                <Button
                  overrideDefaults
                  type="button"
                  className="absolute right-8 bottom-8 z-10 ml-auto flex size-12 shrink-0 cursor-pointer items-center justify-center text-brand transition-all duration-200 hover:scale-110 hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none md:static"
                  onClick={handleNextSlide}
                  aria-label={'Next slide'}
                >
                  <ChevronRight className="size-10" strokeWidth={2.5} />
                </Button>
              </div>
            </div>
          </div>
        </article>
      </Container>
    </section>
  );
}
