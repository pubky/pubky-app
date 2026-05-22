import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ElementType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareTarget } from './ShareTarget';

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new Map<string, string>();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) ?? null,
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Share to Pubky',
      cancel: 'Cancel',
    };
    return translations[key] || key;
  },
}));

const { mockGetSharedFiles } = vi.hoisted(() => ({
  mockGetSharedFiles: vi.fn(),
}));

vi.mock('@/libs/share/shareTarget', async () => {
  const actual = await vi.importActual<typeof import('@/libs/share/shareTarget')>('@/libs/share/shareTarget');
  return {
    ...actual,
    getSharedFiles: () => mockGetSharedFiles(),
  };
});

// Mock Atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      variant,
      size,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      variant?: string;
      size?: string;
    }) => (
      <button data-testid="button" data-variant={variant} data-size={size} onClick={onClick}>
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

vi.mock('@/atoms/Skeleton/Skeleton', () => {
  return {
    Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
  };
});

vi.mock('@/atoms/Spinner/Spinner', () => {
  return {
    Spinner: () => <div data-testid="spinner">Loading...</div>,
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, as: Tag = 'span' }: { children: React.ReactNode; as?: ElementType; size?: string }) => {
      const Comp = Tag as ElementType;
      return <Comp data-testid="typography">{children}</Comp>;
    },
  };
});

// Mock Organisms
vi.mock('@/organisms/ContentLayout/ContentLayout', () => {
  return {
    ContentLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="content-layout">{children}</div>,
  };
});

vi.mock('@/organisms/PostInput/PostInput', () => {
  return {
    PostInput: ({
      dataCy,
      variant,
      expanded,
      onSuccess,
      initialContent,
      initialAttachments,
    }: {
      dataCy?: string;
      variant?: string;
      expanded?: boolean;
      onSuccess?: () => void;
      initialContent?: string;
      initialAttachments?: File[];
    }) => (
      <div
        data-testid="post-input"
        data-cy={dataCy}
        data-variant={variant}
        data-expanded={expanded}
        data-initial-content={initialContent}
        data-has-attachments={initialAttachments && initialAttachments.length > 0}
      >
        <button data-testid="post-submit" onClick={onSuccess}>
          Submit
        </button>
      </div>
    ),
  };
});

describe('ShareTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.clear();
    mockGetSharedFiles.mockResolvedValue([]);
  });

  it('renders without errors', async () => {
    render(<ShareTarget />);

    await waitFor(() => {
      expect(screen.getByTestId('content-layout')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton while retrieving shared files', () => {
    mockSearchParams.set('hasFiles', 'true');
    mockGetSharedFiles.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<ShareTarget />);

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders title correctly', async () => {
    render(<ShareTarget />);

    await waitFor(() => {
      expect(screen.getByText('Share to Pubky')).toBeInTheDocument();
    });
  });

  it('renders cancel button', async () => {
    render(<ShareTarget />);

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('navigates to home when cancel is clicked', async () => {
    render(<ShareTarget />);

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));

    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  it('navigates to home on successful post', async () => {
    render(<ShareTarget />);

    await waitFor(() => {
      expect(screen.getByTestId('post-input')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('post-submit'));

    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  it('composes content from URL search params', async () => {
    mockSearchParams.set('title', 'Test Title');
    mockSearchParams.set('text', 'Test text content');
    mockSearchParams.set('url', 'https://example.com');

    render(<ShareTarget />);

    await waitFor(() => {
      expect(screen.getByTestId('post-input')).toHaveAttribute(
        'data-initial-content',
        'Test text content\n\nhttps://example.com',
      );
    });
  });

  it('retrieves shared files when hasFiles is true', async () => {
    mockSearchParams.set('hasFiles', 'true');
    const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
    mockGetSharedFiles.mockResolvedValue([mockFile]);

    render(<ShareTarget />);

    await waitFor(() => {
      expect(mockGetSharedFiles).toHaveBeenCalled();
    });
  });

  it('does not retrieve files when hasFiles is not set', async () => {
    render(<ShareTarget />);

    await waitFor(() => {
      expect(screen.getByTestId('post-input')).toBeInTheDocument();
    });

    expect(mockGetSharedFiles).not.toHaveBeenCalled();
  });

  it('renders PostInput with correct props', async () => {
    render(<ShareTarget />);

    await waitFor(() => {
      const postInput = screen.getByTestId('post-input');
      expect(postInput).toHaveAttribute('data-cy', 'share-target-post-input');
      expect(postInput).toHaveAttribute('data-variant', 'post');
      expect(postInput).toHaveAttribute('data-expanded', 'true');
    });
  });

  it('passes initial content to PostInput', async () => {
    mockSearchParams.set('text', 'Test shared content');

    render(<ShareTarget />);

    await waitFor(() => {
      const postInput = screen.getByTestId('post-input');
      expect(postInput).toHaveAttribute('data-initial-content', 'Test shared content');
    });
  });

  it('passes initial attachments to PostInput when files are shared', async () => {
    mockSearchParams.set('hasFiles', 'true');
    const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
    mockGetSharedFiles.mockResolvedValue([mockFile]);

    render(<ShareTarget />);

    await waitFor(() => {
      const postInput = screen.getByTestId('post-input');
      expect(postInput).toHaveAttribute('data-has-attachments', 'true');
    });
  });
});

describe('ShareTarget - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.clear();
    mockGetSharedFiles.mockResolvedValue([]);
  });

  it('matches snapshot for loading state', () => {
    mockSearchParams.set('hasFiles', 'true');
    mockGetSharedFiles.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { container } = render(<ShareTarget />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for content state', async () => {
    mockSearchParams.set('text', 'Shared content from another app');

    const { container } = render(<ShareTarget />);

    await waitFor(() => {
      expect(screen.getByTestId('post-input')).toBeInTheDocument();
    });

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with text content only', async () => {
    mockSearchParams.set('text', 'Just some text');

    const { container } = render(<ShareTarget />);

    await waitFor(() => {
      expect(screen.getByTestId('post-input')).toBeInTheDocument();
    });

    expect(container).toMatchSnapshot();
  });
});
