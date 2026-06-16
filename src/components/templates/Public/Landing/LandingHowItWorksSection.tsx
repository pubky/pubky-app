import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { LANDING_HOW_SECTION_ID } from './Landing.constants';

const FEATURES: Array<{ key: 'core' | 'taggable' | 'social' | 'portable'; image: string }> = [
  { key: 'core', image: '/images/landing-keys.png' },
  { key: 'taggable', image: '/images/landing-tag.png' },
  { key: 'social', image: '/images/landing-user.png' },
  { key: 'portable', image: '/images/landing-move.png' },
];

export function LandingHowItWorksSection() {
  const t = useTranslations('landing.howItWorks');

  return (
    <section id={LANDING_HOW_SECTION_ID} className="relative z-0 min-h-svh scroll-mt-[48px] py-10 sm:py-24">
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map(({ key, image }) => (
            <article
              key={key}
              className="group relative flex flex-col overflow-hidden rounded-md bg-card/80 p-6 shadow-sm backdrop-blur-sm md:max-xl:flex-row md:max-xl:items-start md:max-xl:gap-6"
            >
              <Image
                src={image}
                alt=""
                width={336}
                height={336}
                className="mb-6 size-32 transition-transform duration-300 ease-out group-hover:scale-125 md:max-xl:mb-0 md:max-xl:shrink-0 xl:mx-auto"
                aria-hidden
              />
              <div className="min-w-0">
                <Typography as="h3" size="lg" className="relative text-xl">
                  {t(`features.${key}.title`)}
                </Typography>
                <Typography size="md" className="relative mt-1 text-muted-foreground">
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
