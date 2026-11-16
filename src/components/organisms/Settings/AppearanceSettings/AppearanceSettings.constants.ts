import type { TagLightPalette, ThemeOption } from '@/config/theme';

interface ThemeChoice {
  value: ThemeOption;
  label: string;
  description: string;
}

interface TagLightPaletteChoice {
  value: TagLightPalette;
  label: string;
}

/** Order matches the Settings → Appearance → Tag colors in Light mode radio group */
export const TAG_LIGHT_PALETTE_CHOICES: TagLightPaletteChoice[] = [
  { value: 'saturated', label: 'Saturated' },
  { value: 'pastel', label: 'Pastel' },
];

/** Sample chips under Tag colors in Light mode: one bright-band hue and two deep ones. */
export const TAG_LIGHT_PALETTE_PREVIEW_TAGS = [
  { name: 'pubky', count: 21 },
  { name: 'art', count: 8 },
  { name: 'music', count: 3 },
];

/** Order matches the Settings → Appearance → Interface radio group */
export const THEME_CHOICES: ThemeChoice[] = [
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use the dark interface.',
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Always use the light interface.',
  },
  {
    value: 'system',
    label: 'Auto',
    description: 'Follow your browser or system setting.',
  },
];
