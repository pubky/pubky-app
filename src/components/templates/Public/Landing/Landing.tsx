import { Container } from '@/atoms/Container/Container';
import { ImageBackground } from '@/atoms/ImageBackground/ImageBackground';
import { HomeActions, HomeFooter, HomePageHeading, HomeSectionTitle } from '@/molecules/Home/Home';
import { PageContainer } from '@/molecules/Page/Page';


export function Landing() {
  return (
    <>
      <ImageBackground image="/images/bg-home.svg" mobileImage="/images/bg-home-mobile.svg" />
      <Container size="container" className="px-6">
        <PageContainer size="narrow" className="mx-0 flex flex-col items-start gap-6">
          <HomePageHeading />
          <HomeSectionTitle />
          <HomeActions />
          <HomeFooter />
        </PageContainer>
      </Container>
    </>
  );
}
