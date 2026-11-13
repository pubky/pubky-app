import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceMap } from './ResourceMap';

type TFakeMapOptions = {
  container: HTMLElement;
  style: string;
  center?: [number, number];
  zoom?: number;
  bounds?: [number, number, number, number];
  interactive?: boolean;
  attributionControl?: unknown;
  cooperativeGestures?: unknown;
  transformRequest?: (url: string) => Record<string, unknown>;
};

const mocks = vi.hoisted(() => {
  const state = {
    isVisible: false,
    /** What the map asked the viewport observer for. */
    observed: undefined as { rootMargin?: string } | undefined,
    embedsUpFront: true,
    isLight: false,
    /** Every map made, in order. */
    maps: [] as FakeMap[],
    imports: 0,
    setWorkerUrl: vi.fn(),
    /** Set to make the map's constructor throw, as a browser without WebGL does. */
    constructorError: null as Error | null,
    /** Set to make the library itself fail to load. */
    importError: null as Error | null,
  };

  class FakeMap {
    listeners = new Map<string, ((event?: unknown) => void)[]>();
    removed = false;
    fitted: unknown[] = [];
    canvas = document.createElement('canvas');
    /** Each time the canvas was focused: whether its container was still inert, and the options. */
    focused: { inert: boolean; options?: FocusOptions }[] = [];
    constructor(public options: TFakeMapOptions) {
      const focus = this.canvas.focus.bind(this.canvas);
      this.canvas.focus = (focusOptions?: FocusOptions) => {
        this.focused.push({ inert: options.container.hasAttribute('inert'), options: focusOptions });
        focus(focusOptions);
      };
      // As the library does: it marks the container and draws into it before WebGL may fail
      options.container.classList.add('maplibregl-map');
      this.canvas.tabIndex = 0;
      options.container.appendChild(this.canvas);
      if (state.constructorError) throw state.constructorError;
      state.maps.push(this);
    }
    getCanvas() {
      return this.canvas;
    }
    on(type: string, listener: (event?: unknown) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
      return this;
    }
    fire(type: string, event?: unknown) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
    remove() {
      this.removed = true;
    }
    getZoom() {
      return this.options.zoom ?? 0;
    }
    fitBounds(...args: unknown[]) {
      this.fitted.push(args);
    }
  }

  class FakeMarker {
    element: HTMLElement;
    lngLat: [number, number] | null = null;
    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
    addTo(map: FakeMap) {
      map.options.container.appendChild(this.element);
      return this;
    }
    remove() {
      this.element.remove();
    }
  }

  return { state, FakeMap, FakeMarker };
});

vi.mock('maplibre-gl', () => {
  mocks.state.imports += 1;
  if (mocks.state.importError) throw mocks.state.importError;
  return { Map: mocks.FakeMap, Marker: mocks.FakeMarker, setWorkerUrl: mocks.state.setWorkerUrl };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: (options?: { rootMargin?: string }) => {
    mocks.state.observed = options;
    return { ref: vi.fn(), isVisible: mocks.state.isVisible };
  },
}));
vi.mock('@/hooks/useThemePreference/useThemePreference', () => ({
  useThemePreference: () => ({ isLightApplied: mocks.state.isLight }),
}));
vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: (select: (state: { media: { embedsUpFront: boolean } }) => unknown) =>
    select({ media: { embedsUpFront: mocks.state.embedsUpFront } }),
}));

const CAFE = { id: 'cafe', point: { lat: 47.3708689, lon: 8.5418241 }, label: 'Conditorei schober' };

const renderMap = (props: Partial<React.ComponentProps<typeof ResourceMap>> = {}) =>
  render(<ResourceMap markers={[CAFE]} label="Map of Conditorei schober" {...props} />);

/** The one map made so far, once the library has loaded. */
const madeMap = async () => {
  await waitFor(() => expect(mocks.state.maps).toHaveLength(1));
  return mocks.state.maps[0];
};

describe('ResourceMap', () => {
  beforeEach(() => {
    mocks.state.isVisible = false;
    mocks.state.embedsUpFront = true;
    mocks.state.isLight = false;
    mocks.state.maps.length = 0;
    mocks.state.constructorError = null;
    mocks.state.importError = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('visibility gate', () => {
    it('loads nothing while the map is off screen: no library, no map, no credit', async () => {
      const importsBefore = mocks.state.imports;
      renderMap();
      await act(async () => {});

      expect(mocks.state.imports).toBe(importsBefore);
      expect(mocks.state.maps).toHaveLength(0);
      expect(screen.getByTestId('resource-map')).toHaveAttribute('data-status', 'idle');
      expect(screen.queryByTestId('resource-map-attribution')).toBeNull();
    });

    it('counts as on screen only what is in the viewport itself, with no margin around it', () => {
      renderMap();

      expect(mocks.state.observed).toEqual({ rootMargin: '0px' });
    });

    it('makes the map once it is on screen, centred on its point', async () => {
      mocks.state.isVisible = true;
      renderMap();

      const map = await madeMap();
      expect(map.options.container).toBe(screen.getByTestId('resource-map-canvas'));
      expect(map.options.center).toEqual([8.5418241, 47.3708689]);
      expect(map.options.style).toBe('https://tiles.openfreemap.org/styles/dark');
      // The library is told where its worker file is, once
      expect(mocks.state.setWorkerUrl).toHaveBeenCalledTimes(1);
      expect(mocks.state.setWorkerUrl).toHaveBeenCalledWith(expect.stringContaining('maplibre-gl-worker.mjs'));
    });
  });

  describe('layout', () => {
    it('sizes the container the library draws into by its box, not by positioning the library’s stylesheet overrides', async () => {
      mocks.state.isVisible = true;
      renderMap();
      await madeMap();

      // `.maplibregl-map` sets `position: relative` outside any layer, which beats Tailwind's layered
      // `absolute`: an `absolute inset-0` container collapses to no height and the map is not seen
      const canvas = screen.getByTestId('resource-map-canvas');
      expect(canvas).toHaveClass('size-full');
      expect(canvas).not.toHaveClass('absolute');
    });

    it('keeps the library’s own overlays inside the map’s box, under the app’s menus and bars', () => {
      renderMap();

      // The library's gesture hint has a z-index far above the app's scale
      expect(screen.getByTestId('resource-map')).toHaveClass('isolate');
    });
  });

  describe('what the tile host gets', () => {
    it('sends every map request without credentials or a referrer, to the address as the style gives it', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();

      const tile = 'https://tiles.openfreemap.org/planet/20261111_001001_pt/14/8581/5735.pbf';
      expect(map.options.transformRequest?.(tile)).toEqual({
        url: tile,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    });

    it('credits the map once it is drawn, each part linked, and draws no second credit of the library’s own', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      expect(screen.queryByTestId('resource-map-attribution')).toBeNull();

      act(() => map.fire('load'));

      const credit = screen.getByTestId('resource-map-attribution');
      expect(credit).toHaveTextContent('OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
      const links = Array.from(credit.querySelectorAll('a')).map((link) => link.getAttribute('href'));
      expect(links).toEqual([
        'https://openfreemap.org',
        'https://www.openmaptiles.org/',
        'https://www.openstreetmap.org/copyright',
      ]);
      expect(map.options.attributionControl).toBe(false);
      expect(screen.getByTestId('resource-map')).toHaveAttribute('data-status', 'ready');
    });
  });

  describe('cleanup', () => {
    it('removes the map when it leaves the screen and makes a new one when it comes back', async () => {
      mocks.state.isVisible = true;
      const { rerender } = renderMap();
      const first = await madeMap();

      mocks.state.isVisible = false;
      rerender(<ResourceMap markers={[CAFE]} label="Map of Conditorei schober" />);

      expect(first.removed).toBe(true);
      expect(screen.getByTestId('resource-map')).toHaveAttribute('data-status', 'idle');
      expect(screen.queryByTestId('resource-map-attribution')).toBeNull();

      mocks.state.isVisible = true;
      rerender(<ResourceMap markers={[CAFE]} label="Map of Conditorei schober" />);
      await waitFor(() => expect(mocks.state.maps).toHaveLength(2));
      expect(mocks.state.maps[1].removed).toBe(false);
    });

    it('removes the map when its card goes away', async () => {
      mocks.state.isVisible = true;
      const { unmount } = renderMap();
      const map = await madeMap();

      unmount();

      expect(map.removed).toBe(true);
    });

    it('makes no map for a card that went away while the library was loading', async () => {
      mocks.state.isVisible = true;
      const { unmount } = renderMap();
      unmount();
      await act(async () => {});

      expect(mocks.state.maps).toHaveLength(0);
    });
  });

  describe('a card’s preview', () => {
    it('cannot be moved, scrolled or focused until it is tapped, so scrolling the page never stops on it', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      act(() => map.fire('load'));

      const canvas = screen.getByTestId('resource-map-canvas');
      expect(canvas).toHaveAttribute('inert');

      fireEvent.click(screen.getByRole('button', { name: 'Interact with the map' }));

      expect(canvas).not.toHaveAttribute('inert');
      expect(screen.queryByRole('button', { name: 'Interact with the map' })).toBeNull();
      // The keyboard goes on to the map itself, not back to the top of the page: once the map is no
      // longer inert (a browser focuses nothing inside an inert part), and without scrolling to it
      expect(map.getCanvas()).toHaveFocus();
      expect(map.focused).toEqual([{ inert: false, options: { preventScroll: true } }]);
    });

    it('asks for two fingers or a modifier key to move the map, so a tapped map does not trap the page’s scroll either', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();

      expect(map.options.cooperativeGestures).toBe(true);
    });

    it('is a preview again after it left the screen', async () => {
      mocks.state.isVisible = true;
      const { rerender } = renderMap();
      act(() => mocks.state.maps[0]?.fire('load'));
      const first = await madeMap();
      act(() => first.fire('load'));
      fireEvent.click(screen.getByRole('button', { name: 'Interact with the map' }));

      mocks.state.isVisible = false;
      rerender(<ResourceMap markers={[CAFE]} label="Map of Conditorei schober" />);
      mocks.state.isVisible = true;
      rerender(<ResourceMap markers={[CAFE]} label="Map of Conditorei schober" />);
      await waitFor(() => expect(mocks.state.maps).toHaveLength(2));
      act(() => mocks.state.maps[1].fire('load'));

      expect(screen.getByTestId('resource-map-canvas')).toHaveAttribute('inert');
    });

    it('shows its point as a pin that is no control', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      act(() => map.fire('load'));

      const pin = await screen.findByTestId('resource-map-pin');
      expect(map.options.container).toContainElement(pin);
      expect(pin.closest('button')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Conditorei schober' })).toBeNull();
    });
  });

  describe('fallback', () => {
    it('says the map is unavailable where WebGL is, keeps the corner control and credits nothing', async () => {
      mocks.state.isVisible = true;
      mocks.state.constructorError = new Error('Failed to initialize WebGL');
      renderMap({ corner: <button type="button">Open in Maps</button> });

      const fallback = await screen.findByTestId('resource-map-fallback');
      expect(fallback).toHaveTextContent('Map unavailable');
      expect(fallback).toHaveTextContent('47.37087, 8.54182');
      expect(screen.getByRole('button', { name: 'Open in Maps' })).toBeInTheDocument();
      expect(screen.queryByTestId('resource-map-attribution')).toBeNull();
      expect(screen.getByTestId('resource-map')).toHaveAttribute('data-status', 'failed');
      // What the library left in the container before it failed is gone
      expect(screen.getByTestId('resource-map-canvas')).toBeEmptyDOMElement();
      expect(screen.getByTestId('resource-map-canvas')).not.toHaveClass('maplibregl-map');
    });

    it('falls back when the style or a tile fails before the map is drawn, and removes the map', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();

      act(() => map.fire('error', { error: new Error('Failed to fetch') }));

      expect(screen.getByTestId('resource-map-fallback')).toBeInTheDocument();
      await act(async () => {});
      expect(map.removed).toBe(true);
    });

    it('keeps a drawn map when a later tile fails', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      act(() => map.fire('load'));

      act(() => map.fire('error', { error: new Error('Failed to fetch') }));

      expect(screen.queryByTestId('resource-map-fallback')).toBeNull();
      expect(map.removed).toBe(false);
    });

    it('falls back when the browser loses the map’s WebGL context and does not give it back', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      act(() => map.fire('load'));
      vi.useFakeTimers();

      act(() => map.fire('webglcontextlost'));
      expect(screen.queryByTestId('resource-map-fallback')).toBeNull();
      await act(async () => vi.advanceTimersByTime(3000));

      expect(screen.getByTestId('resource-map-fallback')).toBeInTheDocument();
      expect(map.removed).toBe(true);
    });

    it('keeps the map when the context comes back, as it does when the library restarts its workers', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      act(() => map.fire('load'));
      vi.useFakeTimers();

      act(() => map.fire('webglcontextlost'));
      act(() => map.fire('webglcontextrestored'));
      await act(async () => vi.advanceTimersByTime(10_000));

      expect(screen.queryByTestId('resource-map-fallback')).toBeNull();
      expect(map.removed).toBe(false);
    });

    it('waits for the context again once the page is back in view: a page left in the background is not given up on', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      act(() => map.fire('load'));
      vi.useFakeTimers();
      const visibility = vi.spyOn(document, 'visibilityState', 'get');

      // Lost while the page goes to the background; its timers run late or all at once on return
      visibility.mockReturnValue('hidden');
      act(() => map.fire('webglcontextlost'));
      await act(async () => vi.advanceTimersByTime(5000));
      expect(screen.queryByTestId('resource-map-fallback')).toBeNull();

      visibility.mockReturnValue('visible');
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      await act(async () => vi.advanceTimersByTime(1000));
      act(() => map.fire('webglcontextrestored'));
      await act(async () => vi.advanceTimersByTime(10_000));

      expect(screen.queryByTestId('resource-map-fallback')).toBeNull();
      expect(map.removed).toBe(false);
    });

    it('gives up on a context that is still lost once the page has been back in view for a while', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      act(() => map.fire('load'));
      vi.useFakeTimers();
      const visibility = vi.spyOn(document, 'visibilityState', 'get');
      visibility.mockReturnValue('hidden');
      act(() => map.fire('webglcontextlost'));
      // The wait ran out in the background, where it decides nothing
      await act(async () => vi.advanceTimersByTime(5000));

      visibility.mockReturnValue('visible');
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      await act(async () => vi.advanceTimersByTime(1999));
      expect(screen.queryByTestId('resource-map-fallback')).toBeNull();
      await act(async () => vi.advanceTimersByTime(1));

      expect(screen.getByTestId('resource-map-fallback')).toBeInTheDocument();
      expect(map.removed).toBe(true);
    });

    it('fails a map once, however many failures the library tells of', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      let removals = 0;
      const remove = map.remove.bind(map);
      map.remove = () => {
        removals += 1;
        remove();
      };

      const container = map.options.container;
      let stillWhole: boolean | null = null;
      await act(async () => {
        map.fire('error', { error: new Error('tile 1') });
        map.fire('error', { error: new Error('tile 2') });
        // The second failure leaves the map alone until the library is done with it: it is not
        // taken for a map that was never made, whose container is emptied at once
        stillWhole = container.contains(map.getCanvas()) && container.classList.contains('maplibregl-map');
      });

      expect(stillWhole).toBe(true);
      expect(removals).toBe(1);
      expect(screen.getByTestId('resource-map-fallback')).toBeInTheDocument();
    });

    it('removes a failed map only after the library has finished telling of the failure', async () => {
      mocks.state.isVisible = true;
      renderMap();
      const map = await madeMap();
      let removedWhileTelling: boolean | null = null;
      map.on('error', () => {
        removedWhileTelling = map.removed;
      });

      await act(async () => map.fire('error', { error: new Error('Failed to fetch') }));

      expect(removedWhileTelling).toBe(false);
      expect(map.removed).toBe(true);
    });

    it('shows the corner control while the map is off screen and while it loads', async () => {
      const { rerender } = renderMap({ corner: <button type="button">Open in Maps</button> });
      expect(screen.getByRole('button', { name: 'Open in Maps' })).toBeInTheDocument();

      mocks.state.isVisible = true;
      rerender(
        <ResourceMap
          markers={[CAFE]}
          label="Map of Conditorei schober"
          corner={<button type="button">Open in Maps</button>}
        />,
      );
      expect(screen.getByTestId('resource-map')).toHaveAttribute('data-status', 'loading');
      expect(screen.getByRole('button', { name: 'Open in Maps' })).toBeInTheDocument();
      await madeMap();
    });
  });

  describe('consent', () => {
    it('loads nothing with platform embeds up front off, until Show map is pressed', async () => {
      mocks.state.isVisible = true;
      mocks.state.embedsUpFront = false;
      renderMap();
      await act(async () => {});
      expect(mocks.state.maps).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: 'Show map' }));

      await madeMap();
      expect(screen.queryByRole('button', { name: 'Show map' })).toBeNull();
    });
  });

  describe('theme', () => {
    it('draws the light style in the light theme', async () => {
      mocks.state.isVisible = true;
      mocks.state.isLight = true;
      renderMap();

      expect((await madeMap()).options.style).toBe('https://tiles.openfreemap.org/styles/positron');
    });
  });

  describe('a map to explore', () => {
    const HENRICI = { id: 'henrici', point: { lat: 47.3726776, lon: 8.5436817 }, label: 'Henrici' };
    const CLUSTER = {
      id: 'cluster',
      point: { lat: 47.37, lon: 8.54 },
      label: '3 results here',
      count: 3,
      bounds: [8.53, 47.36, 8.55, 47.38] as [number, number, number, number],
    };

    it('fits all its points, can be moved at once and has no tap-to-interact step', async () => {
      mocks.state.isVisible = true;
      renderMap({ markers: [CAFE, HENRICI], mode: 'explore' });
      const map = await madeMap();
      act(() => map.fire('load'));

      expect(map.options.center).toBeUndefined();
      expect(map.options.bounds).toEqual([8.5418241, 47.3708689, 8.5436817, 47.3726776]);
      expect(screen.getByTestId('resource-map-canvas')).not.toHaveAttribute('inert');
      expect(screen.queryByRole('button', { name: 'Interact with the map' })).toBeNull();
    });

    it('has one button per pin, named by what it is, that selects it', async () => {
      mocks.state.isVisible = true;
      const onSelect = vi.fn();
      renderMap({ markers: [CAFE, HENRICI], mode: 'explore', selectedId: 'henrici', onSelect });
      const map = await madeMap();
      act(() => map.fire('load'));

      const cafe = await screen.findByRole('button', { name: 'Conditorei schober' });
      expect(cafe).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Henrici' })).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(cafe);

      expect(onSelect).toHaveBeenCalledWith('cafe');
    });

    it('zooms into a group of pins that can be told apart, and selects one that cannot', async () => {
      mocks.state.isVisible = true;
      const onSelect = vi.fn();
      const stacked = { id: 'stacked', point: { lat: 47.41, lon: 8.55 }, label: '2 results here', count: 2 };
      renderMap({ markers: [CLUSTER, stacked], mode: 'explore', onSelect });
      const map = await madeMap();
      act(() => map.fire('load'));

      fireEvent.click(await screen.findByRole('button', { name: '3 results here' }));
      expect(map.fitted).toHaveLength(1);
      expect(map.fitted[0]).toEqual([[8.53, 47.36, 8.55, 47.38], expect.objectContaining({ maxZoom: 16 })]);
      expect(onSelect).not.toHaveBeenCalled();
      // The pin pressed is about to be replaced by the ones it stood for: the keyboard stays on the map,
      // which is not scrolled to
      expect(map.getCanvas()).toHaveFocus();
      expect(map.focused).toEqual([{ inert: false, options: { preventScroll: true } }]);

      fireEvent.click(screen.getByRole('button', { name: '2 results here' }));
      expect(onSelect).toHaveBeenCalledWith('stacked');
      expect(screen.getByRole('button', { name: '2 results here' })).toHaveTextContent('2');
    });

    it('reports how close the map is, at first and after each zoom, so its pins can be grouped', async () => {
      mocks.state.isVisible = true;
      const onZoom = vi.fn();
      renderMap({ markers: [CAFE, HENRICI], mode: 'explore', onZoom });
      const map = await madeMap();
      map.options.zoom = 12.4;

      act(() => map.fire('load'));
      expect(onZoom).toHaveBeenLastCalledWith(12.4);

      map.options.zoom = 15;
      act(() => map.fire('zoomend'));
      expect(onZoom).toHaveBeenLastCalledWith(15);
    });

    it('keeps the map and moves its pins when they change, fitting again only when what it shows changed', async () => {
      mocks.state.isVisible = true;
      const { rerender } = renderMap({ markers: [CAFE], mode: 'explore', fit: [CAFE.point] });
      const map = await madeMap();
      act(() => map.fire('load'));
      await screen.findByRole('button', { name: 'Conditorei schober' });

      rerender(<ResourceMap markers={[HENRICI]} label="Map of Conditorei schober" mode="explore" fit={[CAFE.point]} />);
      await screen.findByRole('button', { name: 'Henrici' });
      expect(screen.queryByRole('button', { name: 'Conditorei schober' })).toBeNull();
      expect(mocks.state.maps).toHaveLength(1);
      expect(map.fitted).toHaveLength(0);

      rerender(
        <ResourceMap
          markers={[HENRICI]}
          label="Map of Conditorei schober"
          mode="explore"
          fit={[CAFE.point, HENRICI.point]}
        />,
      );
      await waitFor(() => expect(map.fitted).toHaveLength(1));
      expect(map.fitted[0]).toEqual([[8.5418241, 47.3708689, 8.5436817, 47.3726776], expect.anything()]);
    });
  });

  it('fails as a map without a point: nothing is loaded and nothing is drawn', async () => {
    mocks.state.isVisible = true;
    renderMap({ markers: [] });
    await act(async () => {});

    expect(mocks.state.maps).toHaveLength(0);
    expect(screen.queryByTestId('resource-map')).toBeNull();
  });
});
