import { type Browser, type BrowserContext, type BrowserContextOptions, type Page, test } from '@playwright/test';

// Phone projects are the Playwright device profiles (Pixel, iPhone). Desktop projects are not.
export const isMobileProject = () => Boolean(test.info().project.use.isMobile);

export async function clickVisible(page: Page, selector: string) {
  await page.locator(selector).filter({ visible: true }).first().click();
}

// Issue #3105: a stalled landing video can hold `load` forever in WebKit. Never wait for it.
export async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

export async function reload(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
}

// The Serwist service worker hides requests from page.route, so the context blocks it and this
// route can answer. Aborting the hero video keeps a stalled /pubky.mp4 from sitting on the load
// event if something still waits for it.
export async function prepareContext(context: BrowserContext) {
  await context.route('**/pubky.mp4*', (route) => route.abort());
}

// A second context does not inherit the project device on its own. Copy the fields that define
// the emulated phone or desktop, and block service workers again.
export function deviceContextOptions(): BrowserContextOptions {
  const projectUse = test.info().project.use;
  return {
    baseURL: typeof projectUse.baseURL === 'string' ? projectUse.baseURL : undefined,
    viewport: projectUse.viewport,
    userAgent: projectUse.userAgent,
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
    screen: projectUse.screen,
    locale: projectUse.locale,
    timezoneId: projectUse.timezoneId,
    colorScheme: projectUse.colorScheme,
    serviceWorkers: 'block',
  };
}

/**
 * Runs `run` in a second browser context of the same project (same browser engine and device).
 * IndexedDB keys are non-extractable, so this context signs in through the UI like the first one
 * rather than reusing storageState. Its video and screenshot are attached beside the first
 * context's automatic evidence. Tracing is not started here: with `trace: 'on'` the runner
 * already starts a trace for every context it sees created, and a second start throws.
 */
export async function withSecondPage(browser: Browser, run: (page: Page) => Promise<void>) {
  const testInfo = test.info();
  const context = await browser.newContext({
    ...deviceContextOptions(),
    recordVideo: { dir: testInfo.outputDir },
  });
  await prepareContext(context);
  const page = await context.newPage();
  try {
    await run(page);
  } finally {
    const screenshotPath = testInfo.outputPath('second-context.png');
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    const video = page.video();
    await context.close().catch(() => undefined);
    if (video) {
      const videoPath = testInfo.outputPath('second-context.webm');
      await video.saveAs(videoPath).catch(() => undefined);
      await testInfo
        .attach('second-context-video', { path: videoPath, contentType: 'video/webm' })
        .catch(() => undefined);
    }
    await testInfo
      .attach('second-context-screenshot', { path: screenshotPath, contentType: 'image/png' })
      .catch(() => undefined);
  }
}
