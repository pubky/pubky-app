import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostPreviewNavigableProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceCard } from './ResourceCard';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));
const mockCopy = vi.fn();
vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: mockCopy }),
}));

const TXID = '3d365ba65953e39c2ff64186022fe9ccf4ac0694888d9bf0c57a45de23e46fd5';
const BLOCK_HASH = '0000000000000000000008dfb288144ec4626cad43656ff2cdd8cb278886fe80';

/** The transaction card as Pinakes reads it (candidate, 2026-11-11), without `related`. */
const TX: TPinakesResourceDetail = {
  id: 'b23ede6e564df021fba62194fcd1cdd0',
  uri: `btc:tx/${TXID}`,
  status: 'ok',
  type: 'BitcoinTransaction',
  type_path: ['Thing', 'BitcoinTransaction'],
  name: `Transaction ${TXID}`,
  site: 'mempool.space',
  start: '2026-11-10T03:32:51Z',
  refs: [`https://mempool.space/tx/${TXID}`],
  aliases: [`https://mempool.space/tx/${TXID}`],
  keys: [],
  also_on: [],
  open_in: [],
  collections: 0,
  facts: {
    block_hash: BLOCK_HASH,
    block_height: '975251',
    coinbase: 'false',
    confirmed: 'true',
    fee: '118488',
    inputs: '400',
    output_value: '129015985',
    outputs: '1',
    page_url: `https://mempool.space/tx/${TXID}`,
    size: '59057',
    vsize: '59057',
    weight: '236228',
  },
};

/** A line as it reads, its separators' no-break spaces as spaces. */
const lineText = (line: HTMLElement) => line.textContent?.replace(/\u00a0/g, ' ');

const BLOCK_ROUTE = `/resource?uri=${encodeURIComponent(`btc:block/${BLOCK_HASH}`)}`;

describe('ResourceCard, a Bitcoin or Lightning card', () => {
  afterEach(() => {
    mockPush.mockClear();
    mockCopy.mockClear();
  });

  it('heads its page with the short ID, a copy button and its block linked; Details keep only the rest', () => {
    render(<ResourceCard card={TX} size="large" />);

    const title = screen.getByTestId('resource-card-title');
    expect(title.textContent).toBe('Transaction 3d365b…e46fd5');
    expect(title).toHaveAttribute('title', `Transaction ${TXID}`);
    const copy = screen.getByRole('button', { name: `Copy transaction ID: ${TXID}` });
    fireEvent.click(copy);
    expect(mockCopy).toHaveBeenCalledWith(TXID);
    expect(mockPush).not.toHaveBeenCalled();

    const lines = screen.getAllByTestId('resource-chain-line').map(lineText);
    expect(lines).toEqual([
      'In block 975,251 · Nov 10, 2026 · 400 inputs → 1 output',
      'Fee 118,488 sats · 2.01 sat/vB · 1.29 BTC out',
    ]);
    // The heading's name is the title alone; the copy button sits next to it.
    expect(screen.getByRole('heading', { level: 2 })).toHaveAccessibleName('Transaction 3d365b…e46fd5');
    const block = screen.getByRole('link', { name: 'block 975,251' });
    expect(block).toHaveAttribute('title', BLOCK_HASH);
    expect(block).toHaveAttribute('href', BLOCK_ROUTE);
    expect(block).not.toHaveAttribute('target');
    expect(screen.queryByTestId('resource-card-summary')).not.toBeInTheDocument();

    // No "Confirmed" twice, no raw block hash: Details list what the body does not show.
    const keys = within(screen.getByTestId('resource-facts'))
      .getAllByTestId('resource-fact')
      .map((row) => row.getAttribute('data-key'));
    expect(keys).toEqual(['size', 'vsize', 'weight']);
  });

  it('shows one linked line in a feed card, which opens the block, not the card', () => {
    render(<ResourceCard card={TX} href={`https://mempool.space/tx/${TXID}`} />);

    expect(screen.getByTestId('resource-card-title')).toHaveTextContent('Transaction 3d365b…e46fd5');
    expect(screen.getAllByTestId('resource-chain-line').map(lineText)).toEqual([
      'In block 975,251 · Nov 10, 2026 · 400 inputs → 1 output',
    ]);
    expect(screen.queryByTestId('resource-chain-copy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resource-facts')).not.toBeInTheDocument();

    // A link in the body is one of the card's controls: the card's own click-through stays out of it.
    fireEvent.click(screen.getByRole('link', { name: /^block 975,251/ }));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens its links in a new tab where links may not navigate', () => {
    render(
      <PostPreviewNavigableProvider navigable={false}>
        <ResourceCard card={TX} href={`https://mempool.space/tx/${TXID}`} />
      </PostPreviewNavigableProvider>,
    );
    expect(screen.getByRole('link', { name: /^block 975,251/ })).toHaveAttribute('target', '_blank');
  });

  it("draws a transaction's inputs and outputs from `related` on its page", () => {
    const related = [
      { rel: 'input', uri: 'btc:address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', amount_sat: 2_000_000 },
      { rel: 'output', uri: null, name: 'OP_RETURN', amount_sat: 0 },
    ];
    render(<ResourceCard card={{ ...TX, related, related_total: { input: 400 } }} size="large" />);

    const [inputs, outputs] = screen.getAllByTestId('resource-chain-list');
    expect(within(inputs).getByRole('heading')).toHaveTextContent('Inputs');
    expect(within(inputs).getByRole('link')).toHaveAttribute(
      'href',
      `/resource?uri=${encodeURIComponent('btc:address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')}`,
    );
    expect(within(inputs).getByRole('progressbar', { hidden: true })).toBeInTheDocument();
    expect(inputs).toHaveTextContent('+399 more');
    expect(within(outputs).queryByRole('link')).not.toBeInTheDocument();
    expect(outputs).toHaveTextContent('OP_RETURN0 sats');
  });

  it('leaves every other card as it was', () => {
    const article = { ...TX, uri: 'https://example.com/a', type: 'Article', type_path: ['Thing', 'Article'] };
    render(<ResourceCard card={article} size="large" />);
    expect(screen.queryByTestId('resource-chain-line')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resource-chain-copy')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-card-title')).toHaveTextContent(`Transaction ${TXID}`);
  });
});
