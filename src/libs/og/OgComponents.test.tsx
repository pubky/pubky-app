import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OgAvatar, OgHeader } from './OgComponents';
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
