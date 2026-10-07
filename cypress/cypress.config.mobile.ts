import { defineConfig } from 'cypress';
import baseConfig from './cypress.config';

export default defineConfig({
  ...baseConfig,
  e2e: {
    ...baseConfig.e2e,
    // Mobile viewport settings (iPhone 12 Pro)
    viewportWidth: 390,
    viewportHeight: 844,
    videosFolder: 'videos/mobile',
    screenshotsFolder: 'screenshots/mobile',
    env: {
      ...baseConfig.e2e?.env,
    },
    expose: {
      ...baseConfig.e2e?.expose,
      isMobile: true,
    },
  },
});
