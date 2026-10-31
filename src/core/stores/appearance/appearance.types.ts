import { DEFAULT_TAG_LIGHT_PALETTE, type TagLightPalette } from '@/config/theme';

export interface AppearanceState {
  tagLightPalette: TagLightPalette;
}

export interface AppearanceActions {
  setTagLightPalette: (tagLightPalette: TagLightPalette) => void;
}

export type AppearanceStore = AppearanceState & AppearanceActions;

export const appearanceInitialState: AppearanceState = {
  tagLightPalette: DEFAULT_TAG_LIGHT_PALETTE,
};

export enum AppearanceActionTypes {
  SET_TAG_LIGHT_PALETTE = 'SET_TAG_LIGHT_PALETTE',
}
