import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './Dialog';

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
