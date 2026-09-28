import { useForm } from 'react-hook-form';
import { expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { customFeedFormDefaults } from '@/hooks/useCustomFeedForm/useCustomFeedForm.types';
import { CustomFeedDialog } from '@/organisms/CustomFeedDialog/CustomFeedDialog';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/home' }));
vi.mock('@/hooks/useCustomFeedForm/useCustomFeedForm', () => ({
  useCustomFeedForm: () => ({
    form: useForm({ defaultValues: customFeedFormDefaults }),
    loading: false,
    submit: vi.fn(),
    deleteFeed: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTagSuggestions/useTagSuggestions', () => ({
  useTagSuggestions: () => ({ suggestions: [] }),
}));

it.each([true, false])('keeps the mobile hint readable after a touch sequence (click: %s)', async (synthesizeClick) => {
  await renderForVRT(
    <TooltipProvider delayDuration={0}>
      <CustomFeedDialog mode="create" open />
    </TooltipProvider>,
    { viewport: VRT_VIEWPORT_MOBILE },
  );
  const trigger = page.getByRole('button', { name: 'About layout settings' });
  const tap = () => {
    trigger
      .element()
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }));
    trigger
      .element()
      .dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch' }));
    if (synthesizeClick) trigger.element().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  };
  tap();
  await expect.element(page.getByRole('tooltip')).toBeVisible();
  tap();
  await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument();
  tap();
  await expect.element(page.getByRole('tooltip')).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument();
  await expect.element(page.getByRole('dialog')).toBeVisible();
});
