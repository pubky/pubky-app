import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseDialogKeyboardOrchestratorResult } from '@/hooks/useDialogKeyboardOrchestrator/useDialogKeyboardOrchestrator.types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog';

const mockUseDialogKeyboardOrchestrator = vi.hoisted(() =>
  vi.fn<() => UseDialogKeyboardOrchestratorResult>(() => ({
    isKeyboardVisible: false,
    spacerHeight: 0,
    contentStyle: undefined,
  })),
);

vi.mock('@/hooks/useDialogKeyboardOrchestrator/useDialogKeyboardOrchestrator', () => ({
  useDialogKeyboardOrchestrator: mockUseDialogKeyboardOrchestrator,
}));

beforeEach(() => {
  mockUseDialogKeyboardOrchestrator.mockReturnValue({
    isKeyboardVisible: false,
    spacerHeight: 0,
    contentStyle: undefined,
  });
});

describe('Dialog', () => {
  it('renders with default props', () => {
    render(<Dialog>Default Dialog</Dialog>);
    const dialog = screen.getByText('Default Dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('closes dialog when overlay is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).toBeInTheDocument();

    await user.click(overlay as Element);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders close button with hidden class when showCloseButton is false', () => {
    render(
      <Dialog open={true}>
        <DialogContent showCloseButton={false}>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const closeButton = document.querySelector('[data-slot="dialog-close"]');
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toHaveClass('hidden');
  });

  it('does not apply keyboard orchestrator styles by default', () => {
    mockUseDialogKeyboardOrchestrator.mockReturnValue({
      isKeyboardVisible: true,
      spacerHeight: 120,
      contentStyle: { scrollPaddingBottom: '144px' },
    });

    render(
      <Dialog open={true}>
        <DialogContent>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent).not.toHaveClass('will-change-transform');
    expect(dialogContent).not.toHaveStyle({ scrollPaddingBottom: '144px' });
    expect(document.querySelector('[data-slot="dialog-keyboard-spacer"]')).not.toBeInTheDocument();
  });

  it('applies keyboard spacer and scroll padding when keyboard is visible', () => {
    mockUseDialogKeyboardOrchestrator.mockReturnValue({
      isKeyboardVisible: true,
      spacerHeight: 120,
      contentStyle: { scrollPaddingBottom: '144px' },
    });

    render(
      <Dialog open={true}>
        <DialogContent avoidKeyboard>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent).not.toHaveClass('will-change-transform');
    expect(dialogContent).not.toHaveStyle({ transform: 'translateY(-120px)' });
    expect(dialogContent).toHaveStyle({ scrollPaddingBottom: '144px' });

    const spacer = document.querySelector('[data-slot="dialog-keyboard-spacer"]');
    expect(spacer).toBeInTheDocument();
    expect(spacer).toHaveAttribute('aria-hidden', 'true');
    expect(spacer).toHaveStyle({ height: '120px' });
  });

  it('uses the mobile bottom-drawer treatment by default', () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent.parentElement).toHaveClass('items-end', 'sm:items-center');
    expect(dialogContent).toHaveClass('data-[state=open]:slide-in-from-bottom', 'rounded-t-lg', 'm-0', 'sm:m-4');
  });

  it('centers on every breakpoint with a mobile gutter when centered', () => {
    render(
      <Dialog open={true}>
        <DialogContent centered>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent.parentElement).toHaveClass('items-center');
    expect(dialogContent.parentElement).not.toHaveClass('items-end');
    // No drawer slide — fade + zoom at all widths, fully rounded, with its own margin.
    expect(dialogContent).not.toHaveClass('data-[state=open]:slide-in-from-bottom');
    expect(dialogContent).toHaveClass('data-[state=open]:zoom-in-95', 'data-[state=open]:fade-in-0');
    expect(dialogContent).toHaveClass('rounded-xl', 'm-6', 'sm:m-4');
    expect(dialogContent).not.toHaveClass('rounded-t-lg');
  });

  it('keeps centered layout classes when overrideDefaults drops the default styling', () => {
    render(
      <Dialog open={true}>
        <DialogContent centered overrideDefaults>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent.parentElement).toHaveClass('items-center');
    expect(dialogContent).toHaveClass('m-6', 'sm:m-4', 'data-[state=open]:zoom-in-95');
    expect(dialogContent).not.toHaveClass('rounded-xl', 'bg-background');
  });
});

describe('Dialog - Snapshots', () => {
  it('matches snapshot for Dialog with default props', () => {
    const { container } = render(
      <Dialog>
        <div>Dialog Content</div>
      </Dialog>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for DialogTrigger with default props', () => {
    const { container } = render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
      </Dialog>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for DialogTrigger with asChild', () => {
    const { container } = render(
      <Dialog>
        <DialogTrigger asChild>
          <button>Open Dialog</button>
        </DialogTrigger>
      </Dialog>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for DialogContent with default props', () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );
    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent.parentElement).toMatchSnapshot();
  });

  it('matches snapshot for DialogContent with close button', () => {
    render(
      <Dialog open={true}>
        <DialogContent showCloseButton={true}>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );
    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent.parentElement).toMatchSnapshot();
  });

  it('matches snapshot for DialogContent without close button', () => {
    render(
      <Dialog open={true}>
        <DialogContent showCloseButton={false}>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );
    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent.parentElement).toMatchSnapshot();
  });

  it('matches snapshot for DialogContent with overrideDefaults', () => {
    render(
      <Dialog open={true}>
        <DialogContent overrideDefaults={true}>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogHeader>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );
    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent.parentElement).toMatchSnapshot();
  });

  it('matches snapshot for DialogContent without overrideDefaults', () => {
    render(
      <Dialog open={true}>
        <DialogContent overrideDefaults={false}>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogHeader>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );
    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent.parentElement).toMatchSnapshot();
  });

  it('matches snapshot for DialogHeader', () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog Description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const dialogHeader = screen.getByTestId('dialog-header');
    expect(dialogHeader).toMatchSnapshot();
  });

  it('matches snapshot for DialogFooter', () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogFooter>
            <button>Cancel</button>
            <button>OK</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    const dialogContent = screen.getByTestId('dialog-content');
    const footer = dialogContent.querySelector('[data-slot="dialog-footer"]');
    expect(footer).toMatchSnapshot();
  });

  it('matches snapshot for complete dialog structure', () => {
    render(
      <Dialog open={true}>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog Description</DialogDescription>
          </DialogHeader>
          <div>Dialog body content</div>
          <DialogFooter>
            <button>Cancel</button>
            <button>OK</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent.parentElement).toMatchSnapshot();
  });
});
