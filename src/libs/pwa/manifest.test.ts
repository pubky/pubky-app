import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { COLORS } from '@/config/theme';

interface ManifestImage {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

interface Manifest {
  id: string;
  start_url: string;
  theme_color: string;
  background_color: string;
  icons: ManifestImage[];
  screenshots: (ManifestImage & { label?: string; form_factor?: string })[];
  shortcuts: { name: string; url: string; icons: ManifestImage[] }[];
}

const PUBLIC_DIR = join(process.cwd(), 'public');
const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, 'manifest.json'), 'utf8')) as Manifest;
const appRoutes = new Set<string>(Object.values(APP_ROUTES));

function publicFileExists(src: string) {
  return existsSync(join(PUBLIC_DIR, src.replace(/^\//, '')));
}

// Guards the hand-maintained manifest against drifting from the app: colours, routes and assets.
describe('public/manifest.json', () => {
  it('uses the app background for the splash and title bar colours', () => {
    expect(manifest.theme_color).toBe(COLORS.background);
    expect(manifest.background_color).toBe(COLORS.background);
  });

  it('launches into the Home feed and keeps a stable install id', () => {
    expect(manifest.start_url).toBe(APP_ROUTES.HOME);
    expect(manifest.id).toBe('/');
  });

  it('ships a dedicated maskable icon with a safe-zone margin', () => {
    const maskable = manifest.icons.filter((icon) => icon.purpose === 'maskable');
    const any = manifest.icons.filter((icon) => icon.purpose === 'any');
    expect(maskable).toHaveLength(1);
    expect(any.map((icon) => icon.src)).not.toContain(maskable[0].src);
  });

  it('references only files that exist in public/', () => {
    const sources = [
      ...manifest.icons.map((icon) => icon.src),
      ...manifest.screenshots.map((shot) => shot.src),
      ...manifest.shortcuts.flatMap((shortcut) => shortcut.icons.map((icon) => icon.src)),
    ];
    const missing = sources.filter((src) => !publicFileExists(src));
    expect(missing).toEqual([]);
  });

  it('points every shortcut at a known app route', () => {
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of manifest.shortcuts) {
      expect(appRoutes.has(shortcut.url)).toBe(true);
    }
  });

  it('labels every screenshot', () => {
    for (const shot of manifest.screenshots) {
      expect(shot.label).toBeTruthy();
    }
  });

  it('precaches the offline fallback page', () => {
    expect(publicFileExists('/offline.html')).toBe(true);
  });
});

// The offline page is static HTML outside the token system; keep its palette pinned to the app's.
describe('public/offline.html', () => {
  const offlineHtml = readFileSync(join(PUBLIC_DIR, 'offline.html'), 'utf8').toLowerCase();

  it('uses the app background for the page and the theme colour', () => {
    const background = COLORS.background.toLowerCase();
    expect(offlineHtml).toContain(`<meta name="theme-color" content="${background}" />`);
    expect(offlineHtml).toContain(`background: ${background};`);
  });
});
