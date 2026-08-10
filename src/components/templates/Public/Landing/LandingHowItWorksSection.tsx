import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { LANDING_HOW_SECTION_ID } from './Landing.constants';

const FEATURES: Array<{ key: string; image: string; title: string; description: string }> = [
  {
    key: 'core',
    image: '/images/landing-keys.png',
    title: 'You are your keys',
    description: 'Accounts are powered by cryptographic keys. No central server, no gatekeepers.',
  },
  {
    key: 'taggable',
    image: '/images/landing-tag.png',
    title: 'The taggable web',
    description: 'Tag posts, media, and profiles. Tags add meaning and help shape your social graph.',
  },
  {
    key: 'social',
    image: '/images/landing-user.png',
    title: 'Social, but personal',
    description: 'You are in charge of your feed, content, and connections. You choose your experience.',
  },
  {
    key: 'portable',
    image: '/images/landing-move.png',
    title: 'A portable identity',
    description: 'Move between apps without starting over. Your identity, data, and friends stay yours.',
  },
];

export function LandingHowItWorksSection() {
  return (
    <section id={LANDING_HOW_SECTION_ID} className="relative z-0 min-h-svh scroll-mt-[48px] py-10 sm:py-24">
      <Container size="container" className="gap-10 px-6">
        <Container className="mx-0 max-w-[760px] gap-5">
          <Typography as="span" size="xs" className="text-brand tracking-[1.2px] uppercase">
            {'The solution'}
          </Typography>
          <Heading level={2} size="xl" className="max-w-[680px] text-4xl sm:text-6xl">
            <span className="text-brand">{'Pubky'}</span>
            {' is different.'}
          </Heading>
          <Typography size="md" className="max-w-[680px] text-muted-foreground sm:text-xl">
            {'It puts you back in control of your digital life.'}
          </Typography>
        </Container>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map(({ key, image, title, description }) => (
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
                  {title}
                </Typography>
                <Typography size="sm" className="relative mt-1 text-muted-foreground sm:text-base">
                  {description}
                </Typography>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
