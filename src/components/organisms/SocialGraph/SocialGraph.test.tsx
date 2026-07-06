import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SocialGraphVisualEdge } from '@/hooks/useSocialGraph/useSocialGraph.utils';
import type { NexusGraphNode } from '@/services/nexus/graph/graph.types';
import { SocialGraph } from './SocialGraph';
import type { SocialGraphHandle } from './SocialGraph.types';

// jsdom has no canvas: the force-graph engine is replaced by a stub that
// records the graph data it receives.
const receivedProps: Record<string, unknown>[] = [];

vi.mock('next/dynamic', () => ({
  default: () => {
    const MockForceGraph = (props: Record<string, unknown>) => {
      receivedProps.push(props);
      return <div data-testid="force-graph-stub" />;
    };
    return MockForceGraph;
  },
}));

vi.mock('usehooks-ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('usehooks-ts')>();
  return {
    ...actual,
    useResizeObserver: () => ({ width: 800, height: 600 }),
  };
});

vi.mock('@/controllers/file/file', () => ({
  FileController: { getAvatarUrl: vi.fn(() => 'https://cdn.example/avatar') },
}));

const nodes: NexusGraphNode[] = [
  { kind: 'user', id: 'user:me', pubky: 'me', name: 'Me', image: null },
  { kind: 'user', id: 'user:friend', pubky: 'friend', name: 'Friend', image: null },
];
const edges: SocialGraphVisualEdge[] = [{ source: 'user:me', target: 'user:friend', type: 'FRIEND' }];

describe('SocialGraph', () => {
  it('renders the canvas wrapper and passes graph data to the engine', () => {
    const ref = createRef<SocialGraphHandle>();
    render(
      <SocialGraph
        ref={ref}
        nodes={nodes}
        edges={edges}
        focusId="user:me"
        selectedId={null}
        relationships={new Map([['user:me', 'self']])}
        spotlight={null}
        pathIds={null}
        communities={null}
        communityLabels={new Map()}
        onNodeClick={vi.fn()}
        onNodeExpand={vi.fn()}
        onBackgroundClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('force-graph-stub')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="social-graph"]')).toBeInTheDocument();

    const props = receivedProps.at(-1) as { graphData: { nodes: unknown[]; links: unknown[] } };
    expect(props.graphData.nodes).toHaveLength(2);
    expect(props.graphData.links).toHaveLength(1);
    // Node objects are passed by reference so the simulation keeps positions
    expect(props.graphData.nodes[0]).toBe(nodes[0]);
    // Link objects are copies so the engine's endpoint mutation stays contained
    expect(props.graphData.links[0]).not.toBe(edges[0]);

    // Edges paint a fat pointer area and advertise clickability on hover
    const interactionProps = receivedProps.at(-1) as {
      linkPointerAreaPaint: unknown;
      onLinkHover: unknown;
    };
    expect(interactionProps.linkPointerAreaPaint).toEqual(expect.any(Function));
    expect(interactionProps.onLinkHover).toEqual(expect.any(Function));

    // The imperative camera handle is exposed
    expect(ref.current).toMatchObject({
      zoomIn: expect.any(Function),
      zoomOut: expect.any(Function),
      fit: expect.any(Function),
      centerOn: expect.any(Function),
      setPaused: expect.any(Function),
      releasePins: expect.any(Function),
    });
  });

  it('colors focus edges by relationship and neighbor edges by recency', () => {
    const manyNodes: NexusGraphNode[] = [
      ...nodes,
      { kind: 'user', id: 'user:a', pubky: 'a', name: 'A', image: null },
      { kind: 'user', id: 'user:b', pubky: 'b', name: 'B', image: null },
    ];
    const manyEdges: SocialGraphVisualEdge[] = [
      { source: 'user:me', target: 'user:friend', type: 'FOLLOWS', indexed_at: 100 },
      { source: 'user:a', target: 'user:b', type: 'FOLLOWS', indexed_at: 100 },
      { source: 'user:b', target: 'user:a', type: 'FOLLOWS', indexed_at: 1000 },
    ];
    render(
      <SocialGraph
        nodes={manyNodes}
        edges={manyEdges}
        focusId="user:me"
        selectedId={null}
        relationships={new Map([['user:friend', 'friend']])}
        spotlight={null}
        pathIds={null}
        communities={null}
        communityLabels={new Map()}
        onNodeClick={vi.fn()}
        onNodeExpand={vi.fn()}
        onBackgroundClick={vi.fn()}
      />,
    );
    const props = receivedProps.at(-1) as { linkColor: (link: unknown) => string };
    const focusEdge = props.linkColor({ source: 'user:me', target: 'user:friend', type: 'FOLLOWS' });
    const oldEdge = props.linkColor({ source: 'user:a', target: 'user:b', type: 'FOLLOWS', indexed_at: 100 });
    const freshEdge = props.linkColor({ source: 'user:b', target: 'user:a', type: 'FOLLOWS', indexed_at: 1000 });
    // Focus edge keeps the relationship palette; neighbor edges do not
    expect(focusEdge).not.toBe(oldEdge);
    // Recency separates neighbor edges: fresh is more opaque than old
    const alphaOf = (rgba: string) => Number(rgba.match(/[\d.]+/g)!.at(-1));
    expect(alphaOf(freshEdge)).toBeGreaterThan(alphaOf(oldEdge));
  });

  it('dims links outside an explicit edge spotlight', () => {
    const manyEdges: SocialGraphVisualEdge[] = [
      { source: 'user:me', target: 'user:friend', type: 'FOLLOWS', indexed_at: 100 },
      { source: 'user:friend', target: 'user:me', type: 'FOLLOWS', indexed_at: 900 },
    ];
    render(
      <SocialGraph
        nodes={nodes}
        edges={manyEdges}
        focusId={null}
        selectedId={null}
        relationships={new Map()}
        spotlight={null}
        spotlightEdges={new Set(['user:friend|FOLLOWS|user:me|'])}
        pathIds={null}
        communities={null}
        communityLabels={new Map()}
        onNodeClick={vi.fn()}
        onNodeExpand={vi.fn()}
        onBackgroundClick={vi.fn()}
      />,
    );
    const props = receivedProps.at(-1) as { linkColor: (link: unknown) => string };
    const alphaOf = (rgba: string) => Number(rgba.match(/[\d.]+/g)!.at(-1));
    const dimmed = props.linkColor({ source: 'user:me', target: 'user:friend', type: 'FOLLOWS', indexed_at: 100 });
    const lit = props.linkColor({ source: 'user:friend', target: 'user:me', type: 'FOLLOWS', indexed_at: 900 });
    expect(alphaOf(dimmed)).toBeLessThanOrEqual(0.05);
    expect(alphaOf(lit)).toBeGreaterThan(0.1);
  });

  it('tints intra-community edges and keeps bridges neutral when communities are on', () => {
    const manyNodes: NexusGraphNode[] = [
      ...nodes,
      { kind: 'user', id: 'user:a', pubky: 'a', name: 'A', image: null },
      { kind: 'user', id: 'user:b', pubky: 'b', name: 'B', image: null },
    ];
    const manyEdges: SocialGraphVisualEdge[] = [
      { source: 'user:a', target: 'user:b', type: 'FOLLOWS', indexed_at: 100 },
      { source: 'user:friend', target: 'user:a', type: 'FOLLOWS', indexed_at: 100 },
    ];
    render(
      <SocialGraph
        nodes={manyNodes}
        edges={manyEdges}
        focusId="user:me"
        selectedId={null}
        relationships={new Map()}
        spotlight={null}
        pathIds={null}
        communities={
          new Map([
            ['user:a', 0],
            ['user:b', 0],
            ['user:friend', 1],
          ])
        }
        communityLabels={new Map()}
        onNodeClick={vi.fn()}
        onNodeExpand={vi.fn()}
        onBackgroundClick={vi.fn()}
      />,
    );
    const props = receivedProps.at(-1) as { linkColor: (link: unknown) => string };
    const intra = props.linkColor({ source: 'user:a', target: 'user:b', type: 'FOLLOWS' });
    const bridge = props.linkColor({ source: 'user:friend', target: 'user:a', type: 'FOLLOWS' });
    expect(intra).not.toBe(bridge);
    expect(bridge).toBe('rgba(245, 245, 255, 0.6)');
  });
});
