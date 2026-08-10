'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
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
    backgroundImage: '/images/landing-experience4.png',
    title: 'Tag everything',
    description: 'Tag posts, media, and profiles to add context, find better content, discover people, and react quickly.',
  },
  {
    key: 'collections',
    backgroundImage: '/images/landing-experience5.png',
    title: 'Collect what matters',
    description: 'Save posts worth keeping, curate your own ideas, and share your collections with others.',
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
  }, [activeSlide, handleNextSlide, isSectionVisible]);

  const activeFeature = FEATURES[activeSlide];
  const slideNumber = String(activeSlide + 1).padStart(2, '0');

  return (
    <section
      ref={sectionRef}
      id={LANDING_FREEDOM_SECTION_ID}
      className="relative z-0 min-h-svh scroll-mt-[48px] py-10 sm:py-24"
    >
      <Container size="container" className="gap-10 px-6">
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
        <article className="relative min-h-[560px] overflow-hidden rounded-md bg-card/80 p-12 shadow-sm backdrop-blur-sm md:min-h-[368px]">
          {FEATURES.map(({ key, backgroundImage }, index) => (
            <div
              key={key}
              className={`absolute inset-x-0 bottom-0 h-[58%] bg-[length:auto_100%] bg-no-repeat opacity-0 transition-opacity duration-500 ease-in-out [background-position:calc(50%+100px)_100%] md:inset-0 md:h-auto md:bg-cover md:bg-center ${
                activeSlide === index ? 'opacity-100' : ''
              }`}
              style={{ backgroundImage: `url(${backgroundImage})` }}
              aria-hidden
            />
          ))}
          <div className="relative z-10 flex items-start gap-5 md:ml-auto md:w-[30%]">
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
            <div className="min-w-0">
              <Typography as="h3" size="lg" className="text-xl">
                {activeFeature.title}
              </Typography>
              <Typography size="sm" className="mt-1 text-muted-foreground sm:text-base">
                {activeFeature.description}
              </Typography>
            </div>
          </div>
          <button
            type="button"
            className="absolute right-8 bottom-8 z-20 flex size-12 cursor-pointer items-center justify-center text-brand transition-all duration-200 hover:scale-110 hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none md:right-10 md:bottom-10"
            onClick={handleNextSlide}
            aria-label={'Next slide'}
          >
            <ChevronRight className="size-10" strokeWidth={2.5} />
          </button>
        </article>
      </Container>
    </section>
  );
}
