import { Container } from '@/atoms/Container/Container';
import { HomeActions, HomeFooter, HomePageHeading, HomeSectionTitle } from '@/molecules/Home/Home';
import { PageContainer } from '@/molecules/Page/Page';
import { LANDING_HERO_SECTION_ID } from './Landing.constants';
import { LandingBrokenSection } from './LandingBrokenSection';
import { LandingFinalSection } from './LandingFinalSection';
import { LandingFreedomSection } from './LandingFreedomSection';
import { LandingHowItWorksSection } from './LandingHowItWorksSection';
import { LandingScrollCue } from './LandingScrollCue';
import { LandingSwirlState } from './LandingSwirlState';
import { LandingVideo } from './LandingVideo';

export function Landing() {
  return (
    <>
      <div aria-hidden className="landing-swirl-background">
        <div className="landing-swirl-background__graphic" />
        <div className="landing-swirl-background__graphic landing-swirl-background__graphic--secondary" />
      </div>
      <LandingSwirlState />
      <LandingScrollCue />
      <Container id={LANDING_HERO_SECTION_ID} as="section" size="container" className="relative min-h-svh px-6 pb-24">
        <div className="grid w-full items-start gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,588px)_minmax(320px,560px)] xl:justify-between">
          <PageContainer size="narrow" className="mx-0 flex flex-col items-start gap-6">
            <HomePageHeading />
            <HomeSectionTitle />
            <HomeActions />
            <HomeFooter />
          </PageContainer>
          <LandingVideo />
        </div>
      </Container>
      <LandingBrokenSection />
      <LandingHowItWorksSection />
      <LandingFreedomSection />
      <LandingFinalSection />
    </>
  );
}
