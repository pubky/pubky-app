import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { PostAttachmentsGenericFiles } from './PostAttachmentsGenericFiles';

// Mock @/atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      asChild,
      variant,
      size,
      className,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
      variant?: string;
      size?: string;
      className?: string;
      'data-testid'?: string;
    }) => (
      <button
        data-testid={dataTestId || 'button'}
        data-variant={variant}
        data-size={size}
        data-aschild={asChild}
        className={className}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      onClick,
      overrideDefaults,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
      overrideDefaults?: boolean;
      'data-testid'?: string;
    }) => {
      const testId = dataTestId || (overrideDefaults ? 'inner-container' : onClick ? 'click-container' : 'container');
      return (
        <div data-testid={testId} className={className} onClick={onClick}>
          {children}
        </div>
      );
    },
  };
});

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      overrideDefaults,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      href: string;
      overrideDefaults?: boolean;
      'data-testid'?: string;
    }) => (
      <a data-testid={dataTestId || 'link'} href={href} data-override-defaults={overrideDefaults}>
        {children}
      </a>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      size,
      className,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      size?: string;
      className?: string;
      'data-testid'?: string;
    }) => (
      <span data-testid={dataTestId || 'typography'} data-size={size} className={className}>
        {children}
      </span>
    ),
  };
});

const createMockFile = (overrides: Partial<AttachmentConstructed> = {}): AttachmentConstructed => {
  const type = overrides.type ?? 'application/pdf';
  const extension = type.split('/')[1] || 'bin';
  return {
    type,
    name: `test-file.${extension}`,
    urls: {
      main: `https://example.com/file.${extension}`,
    },
    ...overrides,
  };
};

describe('PostAttachmentsGenericFiles', () => {
  describe('Basic rendering', () => {
    it('renders without crashing', () => {
      const genericFiles = [createMockFile()];
      const { container } = render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders a single PDF file', () => {
      const genericFiles = [createMockFile({ name: 'report.pdf', urls: { main: 'https://example.com/report.pdf' } })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.getByTestId('link')).toHaveAttribute('href', 'https://example.com/report.pdf');
    });

    it('renders multiple PDF files', () => {
      const genericFiles = [
        createMockFile({ name: 'document1.pdf', urls: { main: 'https://example.com/doc1.pdf' } }),
        createMockFile({ name: 'document2.pdf', urls: { main: 'https://example.com/doc2.pdf' } }),
        createMockFile({ name: 'document3.pdf', urls: { main: 'https://example.com/doc3.pdf' } }),
      ];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(screen.getByText('document1.pdf')).toBeInTheDocument();
      expect(screen.getByText('document2.pdf')).toBeInTheDocument();
      expect(screen.getByText('document3.pdf')).toBeInTheDocument();

      const links = screen.getAllByTestId('link');
      expect(links).toHaveLength(3);
    });

    it('returns null when no PDFs provided', () => {
      const { container } = render(<PostAttachmentsGenericFiles genericFiles={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('returns null when genericFiles contains no PDFs', () => {
      const genericFiles = [
        createMockFile({ type: 'application/zip', name: 'archive.zip' }),
        createMockFile({ type: 'text/plain', name: 'readme.txt' }),
      ];
      const { container } = render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('PDF filtering', () => {
    it('only renders PDF files from mixed file types', () => {
      const genericFiles = [
        createMockFile({ name: 'document.pdf' }),
        createMockFile({ type: 'application/zip', name: 'archive.zip' }),
        createMockFile({ name: 'report.pdf' }),
        createMockFile({ type: 'text/plain', name: 'notes.txt' }),
      ];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.queryByText('archive.zip')).not.toBeInTheDocument();
      expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();

      const links = screen.getAllByTestId('link');
      expect(links).toHaveLength(2);
    });

    it('filters out non-PDF application types', () => {
      const genericFiles = [
        createMockFile({ type: 'application/json', name: 'data.json' }),
        createMockFile({ type: 'application/xml', name: 'config.xml' }),
        createMockFile({ type: 'application/octet-stream', name: 'binary.bin' }),
        createMockFile({ name: 'only-pdf.pdf' }),
      ];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(screen.getByText('only-pdf.pdf')).toBeInTheDocument();
      expect(screen.queryByText('data.json')).not.toBeInTheDocument();
      expect(screen.queryByText('config.xml')).not.toBeInTheDocument();
      expect(screen.queryByText('binary.bin')).not.toBeInTheDocument();
    });
  });

  describe('Icons', () => {
    it('renders FileText icon for each PDF', () => {
      const genericFiles = [createMockFile(), createMockFile({ name: 'second.pdf' })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const fileIcons = document.querySelectorAll('.size-6.shrink-0');
      expect(fileIcons).toHaveLength(2);
    });

    it('renders Download icon for each PDF', () => {
      const genericFiles = [createMockFile(), createMockFile({ name: 'second.pdf' })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const downloadIcons = document.querySelectorAll('.size-4');
      expect(downloadIcons).toHaveLength(2);
    });
  });

  describe('Download link', () => {
    it('renders download link with correct href', () => {
      const genericFiles = [createMockFile({ urls: { main: 'https://example.com/my-document.pdf' } })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('href', 'https://example.com/my-document.pdf');
    });

    it('renders correct href for each PDF in multiple files', () => {
      const genericFiles = [
        createMockFile({ urls: { main: 'https://example.com/first.pdf' } }),
        createMockFile({ urls: { main: 'https://example.com/second.pdf' } }),
      ];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const links = screen.getAllByTestId('link');
      expect(links[0]).toHaveAttribute('href', 'https://example.com/first.pdf');
      expect(links[1]).toHaveAttribute('href', 'https://example.com/second.pdf');
    });
  });

  describe('Click behavior', () => {
    it('stops event propagation when PDF container is clicked', () => {
      const parentClickHandler = vi.fn();
      const genericFiles = [createMockFile()];

      render(
        <div onClick={parentClickHandler}>
          <PostAttachmentsGenericFiles genericFiles={genericFiles} />
        </div>,
      );

      const pdfContainer = screen.getByTestId('click-container');
      fireEvent.click(pdfContainer);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe('Container styling', () => {
    it('applies gap-3 class to main container', () => {
      const genericFiles = [createMockFile()];
      const { container } = render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(container.firstChild).toHaveClass('gap-3');
    });

    it('applies correct styling classes to PDF item container', () => {
      const genericFiles = [createMockFile()];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const pdfItemContainer = screen.getByTestId('click-container');
      expect(pdfItemContainer).toHaveClass('cursor-auto');
      expect(pdfItemContainer).toHaveClass('flex-row');
      expect(pdfItemContainer).toHaveClass('items-center');
      expect(pdfItemContainer).toHaveClass('justify-between');
      expect(pdfItemContainer).toHaveClass('gap-2');
      expect(pdfItemContainer).toHaveClass('rounded-md');
      expect(pdfItemContainer).toHaveClass('bg-muted');
      expect(pdfItemContainer).toHaveClass('p-4');
    });
  });

  describe('Typography styling', () => {
    it('applies correct typography size', () => {
      const genericFiles = [createMockFile()];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const typography = screen.getByTestId('typography');
      expect(typography).toHaveAttribute('data-size', 'sm');
    });

    it('applies font-bold and break-all classes to file name', () => {
      const genericFiles = [createMockFile()];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const typography = screen.getByTestId('typography');
      expect(typography).toHaveClass('font-bold');
      expect(typography).toHaveClass('break-all');
    });

    it('displays full file name', () => {
      const genericFiles = [createMockFile({ name: 'my-very-long-document-name.pdf' })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(screen.getByText('my-very-long-document-name.pdf')).toBeInTheDocument();
    });
  });

  describe('Button styling', () => {
    it('renders button with dark variant', () => {
      const genericFiles = [createMockFile()];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const button = screen.getByTestId('button');
      expect(button).toHaveAttribute('data-variant', 'dark');
    });

    it('renders button with icon size', () => {
      const genericFiles = [createMockFile()];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const button = screen.getByTestId('button');
      expect(button).toHaveAttribute('data-size', 'icon');
    });

    it('renders button with asChild prop', () => {
      const genericFiles = [createMockFile()];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const button = screen.getByTestId('button');
      expect(button).toHaveAttribute('data-aschild', 'true');
    });

    it('applies correct styling classes to button', () => {
      const genericFiles = [createMockFile()];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const button = screen.getByTestId('button');
      expect(button).toHaveClass('h-8');
      expect(button).toHaveClass('w-10');
      expect(button).toHaveClass('shrink-0');
      expect(button).toHaveClass('border-none');
      expect(button).toHaveClass('bg-card');
    });
  });

  describe('Edge cases', () => {
    it('handles PDF with special characters in name', () => {
      const genericFiles = [createMockFile({ name: 'document (1) - final.pdf' })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(screen.getByText('document (1) - final.pdf')).toBeInTheDocument();
    });

    it('handles PDF with special characters in URL', () => {
      const genericFiles = [createMockFile({ urls: { main: 'https://example.com/document%20file.pdf' } })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('href', 'https://example.com/document%20file.pdf');
    });

    it('handles PDF with query parameters in URL', () => {
      const genericFiles = [createMockFile({ urls: { main: 'https://example.com/doc.pdf?token=abc123&v=2' } })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('href', 'https://example.com/doc.pdf?token=abc123&v=2');
    });

    it('handles large number of PDF files', () => {
      const genericFiles = Array.from({ length: 10 }, (_, i) =>
        createMockFile({ name: `document${i}.pdf`, urls: { main: `https://example.com/doc${i}.pdf` } }),
      );
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const links = screen.getAllByTestId('link');
      expect(links).toHaveLength(10);
    });

    it('handles PDF with very long file name', () => {
      const longName = 'this-is-a-very-long-file-name-that-demonstrates-responsive-text-wrapping-behavior.pdf';
      const genericFiles = [createMockFile({ name: longName })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(screen.getByText(longName)).toBeInTheDocument();
    });

    it('handles PDF with unicode characters in name', () => {
      const genericFiles = [createMockFile({ name: 'документ-文件-📄.pdf' })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      expect(screen.getByText('документ-文件-📄.pdf')).toBeInTheDocument();
    });

    it('handles empty file name', () => {
      const genericFiles = [createMockFile({ name: '' })];
      render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);

      const typography = screen.getByTestId('typography');
      expect(typography).toBeInTheDocument();
      expect(typography.textContent).toBe('');
    });
  });
});

describe('PostAttachmentsGenericFiles - Snapshots', () => {
  it('matches snapshot with single PDF', () => {
    const genericFiles = [createMockFile({ name: 'document.pdf', urls: { main: 'https://example.com/document.pdf' } })];
    const { container } = render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple PDFs', () => {
    const genericFiles = [
      createMockFile({ name: 'report.pdf', urls: { main: 'https://example.com/report.pdf' } }),
      createMockFile({ name: 'invoice.pdf', urls: { main: 'https://example.com/invoice.pdf' } }),
      createMockFile({ name: 'contract.pdf', urls: { main: 'https://example.com/contract.pdf' } }),
    ];
    const { container } = render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty array', () => {
    const { container } = render(<PostAttachmentsGenericFiles genericFiles={[]} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with no PDFs in mixed files', () => {
    const genericFiles = [
      createMockFile({ type: 'application/zip', name: 'archive.zip' }),
      createMockFile({ type: 'text/plain', name: 'readme.txt' }),
    ];
    const { container } = render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with mixed file types containing PDFs', () => {
    const genericFiles = [
      createMockFile({ name: 'document.pdf', urls: { main: 'https://example.com/document.pdf' } }),
      createMockFile({ type: 'application/zip', name: 'archive.zip' }),
      createMockFile({ name: 'report.pdf', urls: { main: 'https://example.com/report.pdf' } }),
    ];
    const { container } = render(<PostAttachmentsGenericFiles genericFiles={genericFiles} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
