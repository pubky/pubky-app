import { ZustandSet } from '../stores.types';
import { AppearanceActions, AppearanceActionTypes, AppearanceStore } from './appearance.types';

export const createAppearanceActions = (set: ZustandSet<AppearanceStore>): AppearanceActions => ({
  setTagLightPalette: (tagLightPalette) => {
    set({ tagLightPalette }, false, AppearanceActionTypes.SET_TAG_LIGHT_PALETTE);
  },
});
