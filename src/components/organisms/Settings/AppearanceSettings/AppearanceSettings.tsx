'use client';

import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { RadioGroup, RadioGroupItem } from '@/atoms/RadioGroup/RadioGroup';
import { Tag } from '@/atoms/Tag/Tag';
import { Typography } from '@/atoms/Typography/Typography';
import type { TagLightPalette, ThemeOption } from '@/config/theme';
import { useThemePreference } from '@/hooks/useThemePreference/useThemePreference';
import { useAppearanceStore } from '@/stores/appearance/appearance.store';
import {
  TAG_LIGHT_PALETTE_CHOICES,
  TAG_LIGHT_PALETTE_PREVIEW_TAGS,
  THEME_CHOICES,
} from './AppearanceSettings.constants';

export function AppearanceSettings() {
  const { theme, isReady, isLightApplied, setTheme } = useThemePreference();
  const tagLightPalette = useAppearanceStore((state) => state.tagLightPalette);
  const setTagLightPalette = useAppearanceStore((state) => state.setTagLightPalette);

  return (
    <Container overrideDefaults className="flex w-full flex-col items-start justify-start gap-3">
      <Heading level={4} size="md" className="text-xl leading-7">
        Interface
      </Heading>
      <Typography
        as="p"
        size="md"
        overrideDefaults
        className="text-base leading-6 font-medium text-secondary-foreground"
      >
        Choose how Pubky looks to you.
      </Typography>
      <RadioGroup
        aria-label="Interface theme"
        value={theme}
        disabled={!isReady}
        onValueChange={(value) => setTheme(value as ThemeOption)}
        className="w-full gap-3 pt-3 md:auto-cols-fr md:grid-flow-col"
      >
        {THEME_CHOICES.map((choice) => (
          <RadioGroupItem
            key={choice.value}
            id={`appearance-theme-${choice.value}`}
            value={choice.value}
            label={choice.label}
            description={choice.description}
            variant="box"
          />
        ))}
      </RadioGroup>
      {isLightApplied && (
        <Container
          overrideDefaults
          className="flex w-full flex-col gap-3 pt-3"
          data-testid="appearance-tag-light-palette"
        >
          <Container overrideDefaults className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Typography
              as="span"
              id="appearance-tag-light-palette-label"
              overrideDefaults
              className="text-base leading-6 font-medium text-foreground"
            >
              Tag colors in Light mode
            </Typography>
            <RadioGroup
              aria-labelledby="appearance-tag-light-palette-label"
              value={tagLightPalette}
              onValueChange={(value) => setTagLightPalette(value as TagLightPalette)}
              className="auto-cols-max grid-flow-col gap-6"
            >
              {TAG_LIGHT_PALETTE_CHOICES.map((choice) => (
                <RadioGroupItem
                  key={choice.value}
                  id={`appearance-tag-light-palette-${choice.value}`}
                  value={choice.value}
                  label={choice.label}
                />
              ))}
            </RadioGroup>
          </Container>
          <Container
            overrideDefaults
            role="group"
            aria-label="Tag color preview"
            className="flex flex-wrap gap-2"
            data-testid="appearance-tag-light-palette-preview"
          >
            {TAG_LIGHT_PALETTE_PREVIEW_TAGS.map((tag) => (
              <Tag
                key={tag.name}
                name={tag.name}
                count={tag.count}
                className="cursor-default"
                data-testid="appearance-tag-preview"
              />
            ))}
          </Container>
        </Container>
      )}
    </Container>
  );
}
