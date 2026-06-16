import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { LANDING_NEXT_SECTION_ID } from './Landing.constants';

const FEATURES: Array<{
  key: 'identity' | 'data' | 'reach';
  image: string;
  hoverClassName: string;
  bubbleClassName: string;
  tipClassName: string;
}> = [
  {
    key: 'identity',
    image: '/images/landing-webbroken1.png',
    hoverClassName: 'group-hover:rotate-[12deg]',
    bubbleClassName: 'top-8 right-8',
    tipClassName: 'right-8 -bottom-2.5',
  },
  {
    key: 'data',
    image: '/images/landing-webbroken2.png',
    hoverClassName: 'group-hover:rotate-[12deg]',
    bubbleClassName: 'right-8 bottom-8',
    tipClassName: 'right-8 -top-2.5',
  },
  {
    key: 'reach',
    image: '/images/landing-webbroken3.png',
    hoverClassName: 'group-hover:-rotate-[12deg]',
    bubbleClassName: 'right-8 bottom-8',
    tipClassName: 'right-8 -top-2.5',
  },
];

export function LandingBrokenSection() {
  const t = useTranslations('landing.broken');

  return (
    <section id={LANDING_NEXT_SECTION_ID} className="relative z-0 min-h-svh scroll-mt-[48px] py-10 sm:py-24">
      <Container size="container" className="gap-10 px-6">
        <Container className="mx-0 max-w-[760px] gap-5">
          <Typography as="span" size="xs" className="text-brand tracking-[1.2px] uppercase">
            {t('eyebrow')}
          </Typography>
          <Heading level={2} size="xl" className="max-w-[680px] text-4xl sm:text-6xl">
            {t.rich('title', {
              highlight: (chunks) => <span className="text-brand">{chunks}</span>,
            })}
          </Heading>
          <Typography size="md" className="max-w-[680px] text-muted-foreground sm:text-xl">
            {t('description')}
          </Typography>
        </Container>
        <div className="grid gap-4 md:grid-cols-3 lg:[&:has(article:hover)>article:not(:hover)]:opacity-[0.32]">
          {FEATURES.map(({ key, image, hoverClassName, bubbleClassName, tipClassName }) => (
            <article
              key={key}
              className="group relative rounded-md bg-card/80 p-6 shadow-sm backdrop-blur-sm transition-opacity duration-300 ease-out lg:hover:z-10"
            >
              <Image
                src={image}
                alt={t(`features.${key}.title`)}
                width={1516}
                height={1516}
                className={`aspect-square w-full rounded-md object-cover transition-all duration-300 ease-out group-hover:scale-120 group-hover:drop-shadow-[0_50px_100px_rgba(0,0,0,1)] ${hoverClassName}`}
              />
              <div
                className={`pointer-events-none absolute hidden max-w-[82%] rounded-md bg-brand px-5 py-4 opacity-0 shadow-[0_50px_100px_rgba(0,0,0,0.8)] transition-opacity duration-300 ease-out group-hover:opacity-100 lg:block ${bubbleClassName}`}
              >
                <Typography size="sm" className="text-background">
                  {t(`features.${key}.description`)}
                </Typography>
                <span className={`absolute size-5 rotate-45 bg-brand ${tipClassName}`} aria-hidden="true" />
              </div>
              <div className="mt-6 min-w-0 lg:hidden">
                <Typography size="md" className="text-muted-foreground">
                  {t(`features.${key}.description`)}
                </Typography>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
