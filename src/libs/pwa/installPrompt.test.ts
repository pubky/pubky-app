import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeforeInstallPromptEvent } from './pwa.types';

type InstallPromptModule = typeof import('./installPrompt');

function createPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent & {
    prompt: ReturnType<typeof vi.fn>;
  };
  Object.assign(event, {
    platforms: ['web'],
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  return event;
}

describe('installPrompt', () => {
  let installPrompt: InstallPromptModule;

  beforeEach(async () => {
    // The capture listener and its state are module-scoped; start every test fresh.
    vi.resetModules();
    installPrompt = await import('./installPrompt');
  });

  it('starts with nothing captured', () => {
    expect(installPrompt.getInstallPromptSnapshot()).toEqual({ canPrompt: false, installed: false });
    expect(installPrompt.getServerInstallPromptSnapshot()).toEqual({ canPrompt: false, installed: false });
  });

  it('captures beforeinstallprompt, suppresses the browser UI and notifies subscribers', () => {
    const listener = vi.fn();
    installPrompt.subscribeToInstallPrompt(listener);
    const event = createPromptEvent();

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(installPrompt.getInstallPromptSnapshot()).toEqual({ canPrompt: true, installed: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('prompts once with the captured event and reports the outcome', async () => {
    const event = createPromptEvent('dismissed');
    window.dispatchEvent(event);

    const first = installPrompt.promptInstall();
    // The captured event is consumed synchronously so a second click cannot re-prompt.
    expect(installPrompt.getInstallPromptSnapshot().canPrompt).toBe(false);
    await expect(first).resolves.toBe('dismissed');
    expect(event.prompt).toHaveBeenCalledTimes(1);

    await expect(installPrompt.promptInstall()).resolves.toBe('unavailable');
  });

  it('reports unavailable when the browser prompt throws', async () => {
    const event = createPromptEvent();
    event.prompt.mockRejectedValueOnce(new Error('already shown'));
    window.dispatchEvent(event);

    await expect(installPrompt.promptInstall()).resolves.toBe('unavailable');
  });

  it('marks the app installed on appinstalled and drops the captured event', async () => {
    const listener = vi.fn();
    window.dispatchEvent(createPromptEvent());
    installPrompt.subscribeToInstallPrompt(listener);

    window.dispatchEvent(new Event('appinstalled'));

    expect(installPrompt.getInstallPromptSnapshot()).toEqual({ canPrompt: false, installed: true });
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(installPrompt.promptInstall()).resolves.toBe('unavailable');
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = installPrompt.subscribeToInstallPrompt(listener);
    unsubscribe();

    window.dispatchEvent(createPromptEvent());

    expect(listener).not.toHaveBeenCalled();
  });
});
