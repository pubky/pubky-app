import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddContentDialog } from './AddContentDialog';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

describe('AddContentDialog', () => {
  it('renders the Add Content trigger', () => {
    render(<AddContentDialog />);

    expect(screen.getByRole('button', { name: 'collections.single.addContent' })).toBeInTheDocument();
  });

  it('opens the desktop dialog with feed and URL placeholder options', () => {
    render(<AddContentDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'collections.single.addContent' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('collections.addContentDialog.title')).toBeInTheDocument();
    expect(screen.getByText('collections.addContentDialog.fromFeedTitle')).toBeInTheDocument();
    expect(screen.getByText('collections.addContentDialog.pasteTitle')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://')).toBeInTheDocument();
  });
});

describe('AddContentDialog - Snapshots', () => {
  it('matches the closed trigger snapshot', () => {
    const { container } = render(<AddContentDialog />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the opened desktop dialog snapshot', () => {
    render(<AddContentDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'collections.single.addContent' }));

    expect(document.body).toMatchSnapshot();
  });
});
