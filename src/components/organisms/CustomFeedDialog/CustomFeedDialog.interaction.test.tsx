import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { customFeedFormDefaults } from '@/hooks/useCustomFeedForm/useCustomFeedForm.types';
import { CustomFeedDialog } from './CustomFeedDialog';

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

// Keep the real dialog, form and Radix tooltip so focus and click handlers interact.
describe('CustomFeedDialog layout hint', () => {
  it('keeps a completed touch tap open and closes on a second tap', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <CustomFeedDialog mode="create" open />
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'About layout settings' });
    await user.pointer({ target: trigger, keys: '[TouchA]' });
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Cards and List also apply on mobile. Other layouts use a single column on mobile.',
    );
    await user.pointer({ target: trigger, keys: '[TouchA]' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('dismisses a keyboard-opened hint with Escape while retaining the dialog', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <CustomFeedDialog mode="create" open />
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'About layout settings' });
    fireEvent.focus(trigger);
    expect(await screen.findByRole('tooltip')).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});
