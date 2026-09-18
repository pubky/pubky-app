import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OgAvatar, OgHeader, OgText } from './OgComponents';
import { OG_TOKENS } from './ogConstants';

describe('OgAvatar', () => {
  it('renders the brand-colored fallback face when no avatar src is provided', () => {
    const html = renderToStaticMarkup(<OgAvatar src={null} size={80} />);

    expect(html).not.toContain('<img');
    expect(html).toContain('<svg');
    expect(html).toContain(OG_TOKENS.brand);
    expect(html).toMatchSnapshot();
  });

  it('renders a circular image when an avatar src is provided', () => {
    const html = renderToStaticMarkup(<OgAvatar src="data:image/png;base64,AAAA" size={80} />);

    expect(html).toContain('<img');
    expect(html).toContain('border-radius:50%');
    expect(html).toContain('object-fit:cover');
    expect(html).toMatchSnapshot();
  });
});

describe('OgHeader', () => {
  it('renders the author name with the avatar and brand mark', () => {
    const html = renderToStaticMarkup(<OgHeader avatarUrl={null} name="Satoshi Nakamoto" />);

    expect(html).toContain('Satoshi Nakamoto');
    // brand mark (Pubky keyhole) is present via its brand-colored path fill
    expect(html).toContain(OG_TOKENS.brand);
    expect(html).toMatchSnapshot();
  });
});

describe('OgText', () => {
  const plain = (text: string) => `<span style="white-space:pre-wrap">${text}</span>`;
  const brand = (text: string) => `<span style="white-space:pre-wrap;color:${OG_TOKENS.brand}">${text}</span>`;
  const mention = (text: string) => ({ text, isMention: true as const, pubky: 'x' });

  it('renders copy without mentions as one text node, so satori breaks lines as it always did', () => {
    const html = renderToStaticMarkup(
      <OgText
        segments={[{ text: 'see https://example.com/a/b then more', isMention: false }]}
        style={{ fontSize: 60, maxHeight: 216 }}
      />,
    );

    expect(html).toBe(
      '<div style="display:flex;font-size:60px;max-height:216px">see https://example.com/a/b then more</div>',
    );
  });

  it('renders mention-bearing copy as word pieces in a wrapping row, mentions in the brand colour', () => {
    const html = renderToStaticMarkup(
      <OgText
        segments={[
          { text: 'Hi ', isMention: false },
          mention('@Talos'),
          { text: ' and ', isMention: false },
          mention('@Jeb'),
          { text: ', play rock-paper-scissors', isMention: false },
        ]}
      />,
    );

    expect(html).toBe(
      '<div style="display:flex;flex-wrap:wrap">' +
        plain('Hi ') +
        brand('@Talos ') +
        plain('and ') +
        brand('@Jeb') +
        plain(', ') +
        plain('play ') +
        plain('rock-') +
        plain('paper-') +
        plain('scissors') +
        '</div>',
    );
  });

  it('splits a URL after its slashes so it can flow across rows, but never at a run of slashes', () => {
    const html = renderToStaticMarkup(
      <OgText segments={[mention('@Bob'), { text: ' https://pubky.app/post/abc', isMention: false }]} />,
    );

    expect(html).toContain(brand('@Bob ') + plain('https://') + plain('pubky.app/') + plain('post/') + plain('abc'));
  });

  it('collapses ASCII whitespace runs (newlines included) to one space and keeps NBSP glued', () => {
    const html = renderToStaticMarkup(
      <OgText segments={[mention('@Bob'), { text: '  10\u00a0000\n\nsats  ', isMention: false }]} />,
    );

    expect(html).toContain(brand('@Bob ') + plain('10\u00a0000 ') + plain('sats '));
  });
});

describe('OgText - Snapshots', () => {
  it('matches snapshot for mention-bearing copy', () => {
    const html = renderToStaticMarkup(
      <OgText
        segments={[
          { text: 'gm ', isMention: false },
          { text: '@Bob', isMention: true, pubky: 'x' },
          { text: ', welcome', isMention: false },
        ]}
        style={{ fontSize: 60 }}
      />,
    );

    expect(html).toMatchSnapshot();
  });
});
