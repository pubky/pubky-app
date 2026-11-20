import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { ResourceMapsMenu } from './ResourceMapsMenu';

const mocks = vi.hoisted(() => ({
  isMobile: false,
  isTouch: false,
  isAndroid: false,
  copy: vi.fn<(text: string) => Promise<boolean>>(),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({ useIsTouchDevice: () => mocks.isTouch }));
vi.mock('@/libs/pwa/platform', () => ({ isAndroidDevice: () => mocks.isAndroid }));
vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: mocks.copy }),
}));

const CAFE = {
  point: { lat: 47.3708689, lon: 8.5418241 },
  label: 'Conditorei schober',
  address: 'Stegengasse, 8001 Zürich, Switzerland',
};

const trigger = () => screen.getByRole('button', { name: 'Open in Maps' });

/** Opens the menu as a pointer does (Radix opens its dropdown on pointer down). */
function openMenu() {
  // Read once: the open menu hides the rest of the page from the accessibility tree
  const button = trigger();
  fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
  fireEvent.click(button);
}

describe('ResourceMapsMenu', () => {
  let open: MockInstance<typeof window.open>;

  beforeEach(() => {
    mocks.isMobile = false;
    mocks.isTouch = false;
    mocks.isAndroid = false;
    mocks.copy.mockReset().mockResolvedValue(true);
    open = vi.spyOn(window, 'open').mockReturnValue(null);
  });

  it('is one round button named Open in Maps that lists the maps apps and what can be copied', () => {
    render(<ResourceMapsMenu destination={CAFE} />);
    expect(screen.queryByText('Google Maps')).toBeNull();

    openMenu();

    const labels = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(labels).toEqual(['Apple Maps', 'Google Maps', 'OpenStreetMap', 'Copy coordinates', 'Copy address']);
  });

  it('opens the place in the picked maps app, in a new tab that cannot reach this one', async () => {
    render(<ResourceMapsMenu destination={CAFE} />);
    openMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Google Maps' }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://www.google.com/maps/search/?api=1&query=47.37087%2C8.54182',
        '_blank',
        'noopener,noreferrer',
      ),
    );
  });

  it('copies the coordinates and the address as text', async () => {
    render(<ResourceMapsMenu destination={CAFE} />);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy coordinates' }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith('47.37087, 8.54182'));

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy address' }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith('Stegengasse, 8001 Zürich, Switzerland'));
  });

  it('offers no coordinates for an address without a point, and no address for a point without one', () => {
    const { unmount } = render(<ResourceMapsMenu destination={{ ...CAFE, point: null }} />);
    openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Copy coordinates' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Copy address' })).toBeInTheDocument();
    unmount();

    render(<ResourceMapsMenu destination={{ ...CAFE, address: null }} />);
    openMenu();
    expect(screen.getByRole('menuitem', { name: 'Copy coordinates' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Copy address' })).toBeNull();
  });

  it('offers the default maps app first on an Android phone, through a geo link in this tab', async () => {
    mocks.isTouch = true;
    mocks.isAndroid = true;
    render(<ResourceMapsMenu destination={CAFE} />);
    openMenu();

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Default maps app');
    fireEvent.click(items[0]);

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('geo:47.37087,8.54182?q=47.37087,8.54182(Conditorei%20schober)', '_self'),
    );
  });

  it('leaves the geo link out where nothing is sure to open it: a desktop, a touch laptop, an iPhone (Apple Maps opens the app there)', () => {
    // Touch alone is not a phone with a maps app behind `geo:`
    mocks.isTouch = true;
    const { unmount } = render(<ResourceMapsMenu destination={CAFE} />);
    openMenu();
    expect(screen.queryByText('Default maps app')).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Apple Maps' })).toBeInTheDocument();
    unmount();

    mocks.isTouch = false;
    mocks.isAndroid = true;
    render(<ResourceMapsMenu destination={CAFE} />);
    openMenu();
    expect(screen.queryByText('Default maps app')).toBeNull();
  });

  it('opens from the keyboard and closes on Escape, back on its button', async () => {
    render(<ResourceMapsMenu destination={CAFE} />);
    const button = trigger();
    button.focus();

    fireEvent.keyDown(button, { key: 'Enter' });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('is a bottom sheet of the same choices on a phone-sized screen', () => {
    mocks.isMobile = true;
    render(<ResourceMapsMenu destination={CAFE} />);

    fireEvent.click(trigger());

    expect(screen.getByRole('dialog', { name: 'Open in Maps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google Maps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeInTheDocument();
  });
});
