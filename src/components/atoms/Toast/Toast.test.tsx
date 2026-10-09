import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toast, ToastAction, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './Toast';

function renderToast(ui: React.ReactNode) {
  return render(
    <ToastProvider>
      {ui}
      <ToastViewport />
    </ToastProvider>,
  );
}

describe('Toast', () => {
  it('defaults to the default variant', () => {
    renderToast(<Toast open>Toast content</Toast>);

    const toast = screen.getByText('Toast content').closest('[data-variant]');
    expect(toast).toHaveAttribute('data-variant', 'default');
    expect(toast).toHaveClass('border-brand/32');
  });

  it.each([
    ['default', 'border-brand/32'],
    ['error', 'border-destructive/32'],
    ['warning', 'border-yellow-500/32'],
    ['info', 'border-accent/32'],
  ] as const)('applies variant=%s', (variant, className) => {
    renderToast(
      <Toast variant={variant} open>
        Toast content
      </Toast>,
    );

    const toast = screen.getByText('Toast content').closest('[data-variant]');
    expect(toast).toHaveAttribute('data-variant', variant);
    expect(toast).toHaveClass(className);
  });

  it('renders title and description inside the toast', () => {
    renderToast(
      <Toast open>
        <ToastTitle>Saved</ToastTitle>
        <ToastDescription>Your changes are live.</ToastDescription>
      </Toast>,
    );

    expect(screen.getByText('Saved')).toHaveClass('font-bold');
    expect(screen.getByText('Your changes are live.')).toHaveClass('text-muted-foreground');
  });
});

describe('ToastAction', () => {
  it('defaults to the muted variant', () => {
    renderToast(
      <Toast open>
        <ToastAction altText="OK">OK</ToastAction>
      </Toast>,
    );

    const action = screen.getByRole('button', { name: 'OK' });
    expect(action).toHaveClass('bg-toast-action-muted');
  });

  it.each([
    ['brand', 'bg-brand/16'],
    ['muted', 'bg-toast-action-muted'],
  ] as const)('applies variant=%s', (variant, className) => {
    renderToast(
      <Toast open>
        <ToastAction altText="OK" variant={variant}>
          OK
        </ToastAction>
      </Toast>,
    );

    expect(screen.getByRole('button', { name: 'OK' })).toHaveClass(className);
  });
});

describe('ToastProvider and ToastViewport', () => {
  it('renders provider children', () => {
    render(
      <ToastProvider>
        <div data-testid="toast-child">Test content</div>
      </ToastProvider>,
    );
    expect(screen.getByTestId('toast-child')).toHaveTextContent('Test content');
  });

  it('renders a fixed viewport and merges className', () => {
    render(
      <ToastProvider>
        <ToastViewport data-testid="toast-viewport" className="custom-viewport" />
      </ToastProvider>,
    );

    const viewport = screen.getByTestId('toast-viewport');
    expect(viewport).toHaveClass('fixed');
    expect(viewport).toHaveClass('custom-viewport');
  });
});
