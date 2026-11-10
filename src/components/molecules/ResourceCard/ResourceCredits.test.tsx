import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import mbGroupEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-group.enriched.json';
import mbRecordingEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-recording.enriched.json';
import type { TPinakesCredit, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceCredits } from './ResourceCredits';

const MB_GROUP: TPinakesResourceDetail = mbGroupEnrichedFixture;
const MB_RECORDING: TPinakesResourceDetail = mbRecordingEnrichedFixture;
const [TEXT_CREDIT, IMAGE_CREDIT]: TPinakesCredit[] = MB_GROUP.credits ?? [];
const [WORK_TEXT_CREDIT, PUBLIC_DOMAIN_IMAGE_CREDIT]: TPinakesCredit[] = MB_RECORDING.credits ?? [];

const lines = () => screen.getAllByTestId('resource-credit');

function expectLinkOut(link: HTMLElement, href: string) {
  expect(link.tagName).toBe('A');
  expect(link).toHaveAttribute('href', href);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
}

describe('ResourceCredits', () => {
  it.each(['full', 'compact'] as const)('renders nothing without credits (%s)', (variant) => {
    const { container } = render(<ResourceCredits credits={[]} variant={variant} />);

    expect(container).toBeEmptyDOMElement();
  });

  describe('full', () => {
    it('lists the sources under a heading, one line per credit', () => {
      render(<ResourceCredits credits={[TEXT_CREDIT, IMAGE_CREDIT]} variant="full" />);

      const section = screen.getByRole('region', { name: 'Sources' });
      expect(section).toHaveAttribute('data-variant', 'full');
      // Under the large card's title, an h2.
      expect(within(section).getByRole('heading', { level: 3, name: 'Sources' })).toBeInTheDocument();
      expect(lines().map((line) => line.textContent)).toEqual([
        'Text: Wikipedia (en), excerpt · CC BY-SA 4.0',
        'Image: Sony Music Entertainment · Wikimedia Commons · CC BY 4.0',
      ]);
    });

    it('links the text’s source to its article and its license to the license', () => {
      render(<ResourceCredits credits={[TEXT_CREDIT]} variant="full" />);

      expectLinkOut(within(lines()[0]).getByRole('link', { name: 'Wikipedia' }), TEXT_CREDIT.source_url);
      expectLinkOut(
        within(lines()[0]).getByRole('link', { name: 'CC BY-SA 4.0' }),
        'https://creativecommons.org/licenses/by-sa/4.0/',
      );
    });

    it('names the image’s author as text and links Wikimedia Commons to the file page', () => {
      render(<ResourceCredits credits={[IMAGE_CREDIT]} variant="full" />);

      const line = lines()[0];
      expect(within(line).queryByRole('link', { name: 'Sony Music Entertainment' })).not.toBeInTheDocument();
      expectLinkOut(within(line).getByRole('link', { name: 'Wikimedia Commons' }), IMAGE_CREDIT.source_url);
    });

    it('says what a text is about when it comes from another entity’s article', () => {
      render(<ResourceCredits credits={[WORK_TEXT_CREDIT]} variant="full" />);

      expect(lines()[0]).toHaveTextContent('Text: Wikipedia (en), excerpt, about its MusicBrainz work · CC BY-SA 4.0');
      expectLinkOut(
        within(lines()[0]).getByRole('link', { name: 'its MusicBrainz work' }),
        'https://musicbrainz.org/work/41c94a08-a551-3c86-bb17-d9a52e3a618b',
      );
    });

    it('shows a license without a URL as text', () => {
      render(<ResourceCredits credits={[PUBLIC_DOMAIN_IMAGE_CREDIT]} variant="full" />);

      expect(lines()[0]).toHaveTextContent('Image: Queen · Wikimedia Commons · Public domain');
      expect(screen.getByTestId('resource-credit-license').tagName).toBe('SPAN');
    });

    it('says when a text was modified and leaves out what a credit does not carry', () => {
      render(
        <ResourceCredits
          credits={[{ ...TEXT_CREDIT, excerpted: false, modified: true, lang: null, license: null }]}
          variant="full"
        />,
      );

      expect(lines()[0].textContent).toBe('Text: Wikipedia, modified');
    });

    it('never links a URL that is not http(s)', () => {
      render(
        <ResourceCredits
          credits={[
            {
              ...TEXT_CREDIT,
              source_url: 'javascript:alert(1)',
              license_url: 'data:text/html,x',
              subject: 'javascript:alert(2)',
            },
          ]}
          variant="full"
        />,
      );

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(lines()[0].textContent).toBe('Text: Wikipedia (en), excerpt · CC BY-SA 4.0');
    });

    it('names an unknown provider by its source’s host', () => {
      render(
        <ResourceCredits
          credits={[{ ...IMAGE_CREDIT, provider: 'flickr', source_url: 'https://www.flickr.com/photos/x/1' }]}
          variant="full"
        />,
      );

      expectLinkOut(screen.getByRole('link', { name: 'flickr.com' }), 'https://www.flickr.com/photos/x/1');
    });
  });

  describe('compact', () => {
    it('names each value’s source and licence in one line, an image’s author first, sources linked', () => {
      render(<ResourceCredits credits={[TEXT_CREDIT, IMAGE_CREDIT]} variant="compact" />);

      const line = screen.getByTestId('resource-credits');
      expect(line).toHaveAttribute('data-variant', 'compact');
      expect(line).not.toHaveClass('truncate');
      expect(line).toHaveTextContent(
        'Sources: Text: Wikipedia, CC BY-SA 4.0 · Image: Sony Music Entertainment, Wikimedia Commons, CC BY 4.0',
      );
      expectLinkOut(screen.getByRole('link', { name: 'Wikipedia' }), TEXT_CREDIT.source_url);
      expectLinkOut(screen.getByRole('link', { name: 'Wikimedia Commons' }), IMAGE_CREDIT.source_url);
    });

    it('links the licence to its text', () => {
      render(<ResourceCredits credits={[TEXT_CREDIT]} variant="compact" />);

      expectLinkOut(screen.getByRole('link', { name: 'CC BY-SA 4.0' }), TEXT_CREDIT.license_url!);
    });

    it('shows a source that is not http(s) as text', () => {
      render(
        <ResourceCredits
          credits={[{ ...TEXT_CREDIT, source_url: 'javascript:alert(1)', license_url: null }]}
          variant="compact"
        />,
      );

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-credit-source')).toHaveTextContent('Wikipedia');
    });
  });

  it.each(['full', 'compact'] as const)('leaves out a credit for a field it has no label for (%s)', (variant) => {
    render(<ResourceCredits credits={[{ ...TEXT_CREDIT, field: 'name' }, IMAGE_CREDIT]} variant={variant} />);

    expect(screen.getByTestId('resource-credits')).not.toHaveTextContent('Wikipedia');
    expect(screen.getByTestId('resource-credits')).toHaveTextContent('Wikimedia Commons');
  });

  it.each(['full', 'compact'] as const)('renders nothing when no credit has a label (%s)', (variant) => {
    const { container } = render(<ResourceCredits credits={[{ ...TEXT_CREDIT, field: 'name' }]} variant={variant} />);

    expect(container).toBeEmptyDOMElement();
  });
});
