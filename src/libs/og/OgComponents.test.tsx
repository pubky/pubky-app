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

  it('renders words as items of a wrapping flex row, mentions in the brand colour, glued punctuation kept together', () => {
    const html = renderToStaticMarkup(
      <OgText
        segments={[
          { text: 'Hi ', isMention: false },
          { text: '@Talos', isMention: true },
          { text: ' and ', isMention: false },
          { text: '@Jeb', isMention: true },
          { text: ', play rock-paper-scissors', isMention: false },
        ]}
      />,
    );

    expect(html).toBe(
      '<div style="display:flex;flex-wrap:wrap">' +
        plain('Hi ') +
        brand('@Talos ') +
        plain('and ') +
        `<div style="display:flex">${brand('@Jeb')}${plain(', ')}</div>` +
        plain('play ') +
        plain('rock-paper-scissors') +
        '</div>',
    );
  });

  it('collapses whitespace runs (newlines included) to one space and drops leading whitespace', () => {
    const html = renderToStaticMarkup(<OgText segments={[{ text: '  hello\n\nworld  ', isMention: false }]} />);

    expect(html).toBe(`<div style="display:flex;flex-wrap:wrap">${plain('hello ')}${plain('world ')}</div>`);
  });

  it('applies the block style to the row and matches the snapshot', () => {
    const html = renderToStaticMarkup(
      <OgText segments={[{ text: 'hello world', isMention: false }]} style={{ fontSize: 60, maxHeight: 216 }} />,
    );

    expect(html).toContain('<div style="display:flex;flex-wrap:wrap;font-size:60px;max-height:216px">');
    expect(html).toMatchSnapshot();
  });
});
