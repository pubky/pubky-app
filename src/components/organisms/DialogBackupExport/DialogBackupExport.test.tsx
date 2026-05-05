import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogBackupExport } from './DialogBackupExport';

vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog">{children}</div>,
    DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="dialog-trigger" data-as-child={asChild}>
        {children}
      </div>
    ),
    DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-content" className={className}>
        {children}
      </div>
    ),
    DialogHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-header" className={className}>
        {children}
      </div>
    ),
    DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <h2 data-testid="dialog-title" className={className}>
        {children}
      </h2>
    ),
    DialogDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <p data-testid="dialog-description" className={className}>
        {children}
      </p>
    ),
  };
});

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => <img src={src} alt={alt} width={width} height={height} className={className} data-testid="next-image" />,
}));

// Mock QRCodeSVG component
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, size }: { value: string; size: number }) => (
    <div data-testid="qr-code" data-value={value} data-size={size}>
      QR Code
    </div>
  ),
}));

// Mock window.open
const mockWindowOpen = vi.fn();
const originalOpen = window.open;

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      variant,
      size,
      className,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      variant?: string;
      size?: string;
      className?: string;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button
        data-testid={variant ? `button-${variant}` : 'button'}
        data-variant={variant}
        data-size={size}
        className={className}
        onClick={onClick}
        {...props}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      target,
      className,
    }: {
      children: React.ReactNode;
      href: string;
      target?: string;
      className?: string;
    }) => (
      <a data-testid="link" href={href} target={target} className={className}>
        {children}
      </a>
    ),
  };
});

describe('DialogBackupExport', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: mockWindowOpen,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: originalOpen,
    });
  });

  it('renders with default props', () => {
    render(<DialogBackupExport />);

    const dialog = screen.getByTestId('dialog');
    const trigger = screen.getByTestId('dialog-trigger');
    const content = screen.getByTestId('dialog-content');

    expect(dialog).toBeInTheDocument();
    expect(trigger).toBeInTheDocument();
    expect(content).toBeInTheDocument();
  });

  it('handles click events on trigger button', () => {
    render(<DialogBackupExport />);

    const buttons = screen.getAllByTestId('button');
    const triggerButton = buttons.find((btn) => btn.textContent === 'Continue');

    expect(triggerButton).toBeInTheDocument();
    fireEvent.click(triggerButton!);
  });

  it('renders desktop version with correct classes', () => {
    const { container } = render(<DialogBackupExport />);

    const desktopVersion = container.querySelector('.hidden.lg\\:flex');
    expect(desktopVersion).toBeInTheDocument();
  });

  it('renders mobile version with correct classes', () => {
    const { container } = render(<DialogBackupExport />);

    const mobileVersion = container.querySelector('.flex.lg\\:hidden');
    expect(mobileVersion).toBeInTheDocument();
  });

  describe('Desktop version', () => {
    it('contains proper desktop content structure', () => {
      render(<DialogBackupExport />);

      // Check that all main elements are present
      const titles = screen.getAllByText('Pubky Ring export');
      expect(titles.length).toBeGreaterThan(0);

      expect(screen.getByText(/Open Pubky Ring, tap 'Add pubky'/)).toBeInTheDocument();

      // Desktop version should have QR code
      const qrCodes = screen.getAllByTestId('qr-code');
      expect(qrCodes.length).toBeGreaterThan(0);
      const desktopQrCode = qrCodes[0];
      expect(desktopQrCode).toBeInTheDocument();
      expect(desktopQrCode).toHaveAttribute('data-size', '174');

      expect(screen.getByAltText('App preview')).toBeInTheDocument();
      expect(screen.getByAltText('App Store')).toBeInTheDocument();
      expect(screen.getByAltText('Google Play')).toBeInTheDocument();
    });

    it('has correct QR code container padding', () => {
      const { container } = render(<DialogBackupExport />);

      const qrContainer = container.querySelector('[class*="p-[9px]"]');
      expect(qrContainer).toBeInTheDocument();
    });

    it('has correct container alignment (items-start)', () => {
      render(<DialogBackupExport />);

      const containers = screen.getAllByTestId('container');
      const mainContainer = containers.find(
        (container) => container.className.includes('justify-between') && container.className.includes('items-start'),
      );
      expect(mainContainer).toBeInTheDocument();
    });

    it('has correct gap between phone and QR sections (gap-8)', () => {
      render(<DialogBackupExport />);

      const containers = screen.getAllByTestId('container');
      const flexRowContainer = containers.find(
        (container) => container.className.includes('flex-row') && container.className.includes('gap-8'),
      );
      expect(flexRowContainer).toBeInTheDocument();
    });

    it('has correct max-width (max-w-md)', () => {
      render(<DialogBackupExport />);

      const content = screen.getByTestId('dialog-content');
      expect(content).toHaveClass('max-w-md');
    });
  });

  describe('Mobile version', () => {
    it('renders mobile description text', () => {
      render(<DialogBackupExport />);

      expect(
        screen.getByText(/Tap the button below to export your pubky and import it into Pubky Ring/),
      ).toBeInTheDocument();
    });

    it('renders mobile button', () => {
      render(<DialogBackupExport />);

      const buttons = screen.getAllByTestId('button');
      const mobileButton = buttons.find((btn) => btn.textContent === 'Import to Pubky Ring');
      expect(mobileButton).toBeInTheDocument();
      expect(mobileButton).toHaveClass('w-full');
    });

    it('opens deeplink when mobile button is clicked', () => {
      render(<DialogBackupExport />);

      const buttons = screen.getAllByTestId('button');
      const mobileButton = buttons.find((btn) => btn.textContent === 'Import to Pubky Ring');

      fireEvent.click(mobileButton!);

      expect(mockWindowOpen).toHaveBeenCalled();
    });

    it('does not render QR code or store badges in mobile version', () => {
      const { container } = render(<DialogBackupExport />);

      // QR codes should only exist in desktop version
      const qrCodes = screen.getAllByTestId('qr-code');
      expect(qrCodes.length).toBeGreaterThan(0);

      // Store badges should only exist in desktop version
      const links = screen.getAllByTestId('link');
      expect(links.length).toBeGreaterThan(0);

      // Mobile version should not have QR codes or links
      const mobileContainer = container.querySelector('.flex.lg\\:hidden');
      const mobileQrCode = mobileContainer?.querySelector('[data-testid="qr-code"]');
      const mobileLinks = mobileContainer?.querySelectorAll('[data-testid="link"]');
      expect(mobileQrCode).not.toBeInTheDocument();
      expect(mobileLinks?.length || 0).toBe(0);
    });
  });

  describe('with mnemonic prop', () => {
    it('renders with mnemonic-specific title', () => {
      const testMnemonic = 'wood fox silver drive march fee palace flame earn door case almost';
      render(<DialogBackupExport mnemonic={testMnemonic} />);

      const titles = screen.getAllByTestId('dialog-title');
      titles.forEach((title) => {
        expect(title).toHaveTextContent('Import recovery phrase');
      });
    });

    it('renders mobile import description for mnemonic', () => {
      const testMnemonic = 'wood fox silver drive march fee palace flame earn door case almost';
      render(<DialogBackupExport mnemonic={testMnemonic} />);

      expect(
        screen.getByText(/Tap the button below to import your recovery phrase into Pubky Ring/),
      ).toBeInTheDocument();
    });

    it('opens correct deeplink when mobile button is clicked with mnemonic', () => {
      const testMnemonic = 'wood fox silver drive march fee palace flame earn door case almost';
      render(<DialogBackupExport mnemonic={testMnemonic} />);

      const buttons = screen.getAllByTestId('button');
      const mobileButton = buttons.find((btn) => btn.textContent === 'Import to Pubky Ring');

      fireEvent.click(mobileButton!);

      expect(mockWindowOpen).toHaveBeenCalled();
    });

    it('renders desktop version with correct QR code size for mnemonic', () => {
      const testMnemonic = 'wood fox silver drive march fee palace flame earn door case almost';
      render(<DialogBackupExport mnemonic={testMnemonic} />);

      const qrCodes = screen.getAllByTestId('qr-code');
      expect(qrCodes.length).toBeGreaterThan(0);
      const desktopQrCode = qrCodes[0];
      expect(desktopQrCode).toHaveAttribute('data-size', '174');
    });
  });
});

describe('DialogBackupExport - Snapshots', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: mockWindowOpen,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: originalOpen,
    });
  });

  it('matches snapshot for default DialogBackupExport', () => {
    const { container } = render(<DialogBackupExport />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for DialogBackupExport with mnemonic', () => {
    const testMnemonic = 'wood fox silver drive march fee palace flame earn door case almost';
    const { container } = render(<DialogBackupExport mnemonic={testMnemonic} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for DialogBackupExport with special mnemonic', () => {
    const specialMnemonic = 'test phrase with spaces & symbols!';
    const { container } = render(<DialogBackupExport mnemonic={specialMnemonic} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
