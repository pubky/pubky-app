'use client';

import { Fragment, type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, MapPinOff } from 'lucide-react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { MAP_ATTRIBUTION, MAP_FIT_MAX_ZOOM, MAP_FIT_PADDING_PX, MAP_PREVIEW_ZOOM, MAP_STYLE_URLS } from '@/config/maps';
import { useThemePreference } from '@/hooks/useThemePreference/useThemePreference';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { loadMapLibrary, toPrivateMapRequest } from '@/libs/maps/maplibre';
import { cn } from '@/libs/utils/utils';
import type { TPinakesPoint } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { formatCoordinates } from './ResourceMap.utils';

/** West, south, east, north in degrees. */
export type TResourceMapBounds = [number, number, number, number];

/** One pin of a map: a place or an event, or several too close to tell apart at the map's zoom. */
export type TResourceMapMarker = {
  id: string;
  point: TPinakesPoint;
  /** What the pin is: a name, or "3 results here". The pin's accessible name on a map to explore. */
  label: string;
  /** How many results the pin stands for, shown on it when more than one. */
  count?: number;
  /** The area a group's results lie in: a press zooms there. Without one (results at one spot) it selects. */
  bounds?: TResourceMapBounds;
};

export interface ResourceMapProps {
  /** The pins; a map without any is not rendered. */
  markers: TResourceMapMarker[];
  /** The map's accessible name ("Map of <place>"). */
  label: string;
  /**
   * `preview` (a card's map): drawn but inert until tapped. `explore` (a map of results): moved at
   * once, each pin a button.
   */
  mode?: 'preview' | 'explore';
  /** `small` on a card, `large` on the resource page, `wide` for a map of results. */
  size?: 'small' | 'large' | 'wide';
  /** How close a map of one point shows it. */
  zoom?: number;
  /** The points the map shows at first, and again whenever they change; the pins' own without. */
  fit?: readonly TPinakesPoint[];
  /** The pin shown as picked. */
  selectedId?: string | null;
  /** A pin was pressed (`explore`). */
  onSelect?: (id: string) => void;
  /** How close the map is, once drawn and after every zoom: what its pins are grouped for. */
  onZoom?: (zoom: number) => void;
  /** A control in the map's top right corner in every state: "Open in Maps". */
  corner?: ReactNode;
  className?: string;
}

type TMapStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** The box of some points; `null` for none. */
function getBounds(points: readonly TPinakesPoint[]): TResourceMapBounds | null {
  if (points.length === 0) return null;
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

const SIZE_CLASSES: Record<NonNullable<ResourceMapProps['size']>, string> = {
  small: 'h-36',
  large: 'h-64 sm:h-80',
  wide: 'h-80 sm:h-96',
};

const FIT_OPTIONS = { padding: MAP_FIT_PADDING_PX, maxZoom: MAP_FIT_MAX_ZOOM };

/**
 * A map of one or more points (MapLibre GL on OpenFreeMap's tiles, `@/config/maps`), for a place's
 * or an event's card, its page and a map of search results.
 *
 * Nothing is loaded before the map is on screen: not the library, not a tile. It is removed again
 * when it leaves the screen or its card goes away, so no card off screen holds a WebGL context. A
 * viewer who turned platform embeds up front off (Settings, Links & Media) gets "Show map" first.
 * Every request goes out without credentials or a referrer (`toPrivateMapRequest`).
 *
 * A card's map (`preview`) cannot be moved, scrolled or focused until it is tapped; any map then
 * asks for two fingers or a modifier key, so the page's scroll never stops on it. Where the map
 * cannot be drawn (no WebGL, the style or its first tiles failed, the context was lost) it says so
 * and keeps the `corner` control, as it does while off screen and while it loads. A drawn map shows
 * its credit; the library's own is off.
 */
export function ResourceMap({
  markers,
  label,
  mode = 'preview',
  size = 'small',
  zoom = MAP_PREVIEW_ZOOM,
  fit,
  selectedId = null,
  onSelect,
  onZoom,
  corner,
  className,
}: ResourceMapProps) {
  const { ref, isVisible } = useViewportObserver();
  const { isLightApplied } = useThemePreference();
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  const [optedIn, setOptedIn] = useState(false);
  const [isTapped, setIsTapped] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; status: TMapStatus } | null>(null);
  const [pins, setPins] = useState<{ marker: TResourceMapMarker; element: HTMLElement }[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const live = useRef<{ map: MapLibreMap; createMarker: (element: HTMLElement) => Marker } | null>(null);

  const styleUrl = isLightApplied ? MAP_STYLE_URLS.light : MAP_STYLE_URLS.dark;
  const fitPoints = fit ?? markers.map((marker) => marker.point);
  const fitKey = JSON.stringify(fitPoints);
  const fitted = useRef(fitKey);
  const hasPoints = fitPoints.length > 0;
  const isAllowed = embedsUpFront || optedIn;
  const shouldLoad = isVisible && isAllowed && hasPoints;
  const status: TMapStatus = shouldLoad ? (loaded?.key === styleUrl ? loaded.status : 'loading') : 'idle';
  const isReady = status === 'ready';
  const isInteractive = mode === 'explore' || isTapped;
  const reportZoom = useEffectEvent((value: number) => onZoom?.(value));

  useEffect(() => {
    const container = canvasRef.current;
    if (!shouldLoad || !container) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const fail = () => {
      map?.remove();
      map = null;
      live.current = null;
      if (!cancelled) setLoaded({ key: styleUrl, status: 'failed' });
    };
    loadMapLibrary().then((maplibre) => {
      if (cancelled) return;
      const bounds = getBounds(fitPoints);
      if (!bounds) return;
      const isOnePoint = bounds[0] === bounds[2] && bounds[1] === bounds[3];
      try {
        map = new maplibre.Map({
          container,
          style: styleUrl,
          ...(isOnePoint ? { center: [bounds[0], bounds[1]], zoom } : { bounds, fitBoundsOptions: FIT_OPTIONS }),
          attributionControl: false,
          cooperativeGestures: true,
          transformRequest: toPrivateMapRequest,
        });
      } catch {
        // No WebGL (an old device, a locked-down browser): the fallback says so
        fail();
        return;
      }
      const made = map;
      let isDrawn = false;
      fitted.current = fitKey;
      live.current = {
        map: made,
        createMarker: (element) => new maplibre.Marker({ element, anchor: 'bottom' }),
      };
      made.on('load', () => {
        isDrawn = true;
        if (cancelled) return;
        setLoaded({ key: styleUrl, status: 'ready' });
        reportZoom(made.getZoom());
      });
      made.on('zoomend', () => {
        if (!cancelled) reportZoom(made.getZoom());
      });
      // A style or tile that fails before the first drawing leaves no map to show; later, a
      // missing tile is a gap in a map that is still one
      made.on('error', () => {
        if (!isDrawn) fail();
      });
      made.on('webglcontextlost', fail);
    }, fail);
    return () => {
      cancelled = true;
      map?.remove();
      live.current = null;
      setLoaded(null);
      setIsTapped(false);
    };
    // The map is made once per time on screen and style; its points are fitted by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLoad, styleUrl]);

  // The pins: one MapLibre marker each, its content rendered by React into the marker's element
  const markersKey = JSON.stringify(markers);
  useEffect(() => {
    const current = live.current;
    if (!isReady || !current) return;
    const made = markers.map((marker) => {
      const element = document.createElement('div');
      const handle = current.createMarker(element).setLngLat([marker.point.lon, marker.point.lat]).addTo(current.map);
      return { marker, element, handle };
    });
    setPins(made.map(({ marker, element }) => ({ marker, element })));
    return () => {
      for (const { handle } of made) handle.remove();
      setPins([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, markersKey]);

  // What the map shows changed (another page of results): fit it again
  useEffect(() => {
    const bounds = getBounds(fitPoints);
    if (!isReady || !live.current || !bounds || fitted.current === fitKey) return;
    fitted.current = fitKey;
    live.current.map.fitBounds(bounds, FIT_OPTIONS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, fitKey]);

  if (!hasPoints) return null;

  const pressPin = (marker: TResourceMapMarker) => {
    if (marker.bounds && live.current) live.current.map.fitBounds(marker.bounds, FIT_OPTIONS);
    else onSelect?.(marker.id);
  };

  return (
    <Container overrideDefaults className={cn('flex min-w-0 flex-col gap-1', className)}>
      <Container
        overrideDefaults
        ref={ref}
        role="group"
        aria-label={label}
        data-resource-controls
        data-testid="resource-map"
        data-status={status}
        className={cn('relative w-full cursor-auto overflow-hidden rounded-md bg-muted', SIZE_CLASSES[size])}
      >
        <Container
          overrideDefaults
          ref={canvasRef}
          inert={!isInteractive || !isReady}
          data-testid="resource-map-canvas"
          className={cn('absolute inset-0', status === 'failed' && 'hidden')}
        />
        {status === 'loading' && (
          <Skeleton className="absolute inset-0 rounded-none" data-testid="resource-map-loading" />
        )}
        {status === 'idle' && !isAllowed && (
          <Container overrideDefaults className="absolute inset-0 flex items-center justify-center">
            <Button type="button" variant={ButtonVariant.SECONDARY} size="sm" onClick={() => setOptedIn(true)}>
              <MapPin aria-hidden="true" />
              Show map
            </Button>
          </Container>
        )}
        {status === 'failed' && (
          <Container
            overrideDefaults
            data-testid="resource-map-fallback"
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center"
          >
            <MapPinOff aria-hidden="true" className="size-5 text-muted-foreground" />
            <Typography size="sm" className="font-medium text-muted-foreground">
              Map unavailable
            </Typography>
            {markers.length === 1 && (
              <Typography size="xs" className="font-normal text-muted-foreground">
                {formatCoordinates(markers[0].point)}
              </Typography>
            )}
          </Container>
        )}
        {isReady && !isInteractive && (
          <Button
            type="button"
            overrideDefaults
            aria-label="Interact with the map"
            title="Interact with the map"
            onClick={() => setIsTapped(true)}
            className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
        )}
        {corner && (
          <Container overrideDefaults className="absolute top-2 right-2 z-10 flex">
            {corner}
          </Container>
        )}
        {pins.map(({ marker, element }) =>
          createPortal(
            <ResourceMapPin
              marker={marker}
              isSelected={marker.id === selectedId}
              onPress={mode === 'explore' ? () => pressPin(marker) : undefined}
            />,
            element,
            marker.id,
          ),
        )}
      </Container>
      {isReady && (
        <Typography
          size="xs"
          data-testid="resource-map-attribution"
          className="font-normal wrap-anywhere text-muted-foreground"
        >
          {MAP_ATTRIBUTION.map(({ label: text, href }, index) => (
            <Fragment key={href}>
              {index > 0 && ' '}
              <Link href={href} overrideDefaults className="hover:text-brand hover:underline">
                {text}
              </Link>
            </Fragment>
          ))}
        </Typography>
      )}
    </Container>
  );
}

/**
 * A pin: on a card's map the point itself, no control; on a map to explore a button named by what
 * it stands for, pressed when picked, with its count when it stands for several results.
 */
function ResourceMapPin({
  marker,
  isSelected,
  onPress,
}: {
  marker: TResourceMapMarker;
  isSelected: boolean;
  onPress?: () => void;
}) {
  const isGroup = (marker.count ?? 1) > 1;
  const pin = isGroup ? (
    <Typography
      as="span"
      overrideDefaults
      className={cn(
        'flex size-8 items-center justify-center rounded-full border-2 border-background bg-brand text-xs font-bold text-brand-foreground shadow-md',
        isSelected && 'ring-2 ring-foreground',
      )}
    >
      {marker.count}
    </Typography>
  ) : (
    <MapPin
      aria-hidden="true"
      className={cn('size-7 fill-brand text-background drop-shadow-md', isSelected && 'size-9 fill-foreground')}
    />
  );
  if (!onPress) {
    return (
      <Container overrideDefaults aria-hidden="true" data-testid="resource-map-pin" className="flex">
        {pin}
      </Container>
    );
  }
  return (
    <Button
      type="button"
      overrideDefaults
      aria-label={marker.label}
      aria-pressed={isSelected}
      title={marker.label}
      onClick={onPress}
      data-testid="resource-map-pin"
      className="flex cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {pin}
    </Button>
  );
}
