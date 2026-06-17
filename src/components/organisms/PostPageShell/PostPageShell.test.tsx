import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostMissing } from '@/hooks/usePostMissing/usePostMissing';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE } from '@/test-utils/pubky';
import { PostPageShell } from './PostPageShell';

const VALID_COMPOSITE_POST_ID = `${PUBKY_52_STAGING_FIXTURE}:${POST_ID_STAGING_FIXTURE}`;

vi.mock('@/hooks/usePostMissing/usePostMissing', () => ({
  usePostMissing: vi.fn(),
}));

vi.mock('@/organisms/HotDiscoveryContentLayout/HotDiscoveryContentLayout', () => ({
  HotDiscoveryContentLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="hot-discovery-content-layout">{children}</div>
  ),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({
    children,
    leftSidebarContent,
    rightSidebarContent,
    leftDrawerContent,
    leftDrawerContentMobile,
    rightDrawerContent,
    classNameWrapperContent,
  }: {
    children: React.ReactNode;
    leftSidebarContent?: React.ReactNode;
    rightSidebarContent?: React.ReactNode;
    leftDrawerContent?: React.ReactNode;
    leftDrawerContentMobile?: React.ReactNode;
    rightDrawerContent?: React.ReactNode;
    classNameWrapperContent?: string;
  }) => (
    <div data-testid="content-layout" data-wrapper-class-name={classNameWrapperContent}>
      {leftSidebarContent && <div data-testid="left-sidebar">{leftSidebarContent}</div>}
      {rightSidebarContent && <div data-testid="right-sidebar">{rightSidebarContent}</div>}
      {leftDrawerContent && <div data-testid="left-drawer">{leftDrawerContent}</div>}
      {leftDrawerContentMobile && <div data-testid="left-drawer-mobile">{leftDrawerContentMobile}</div>}
      {rightDrawerContent && <div data-testid="right-drawer">{rightDrawerContent}</div>}
      {children}
    </div>
  ),
}));

vi.mock('@/organisms/SinglePostLeftSidebar/SinglePostLeftSidebar', () => ({
  SinglePostLeftSidebar: () => <div data-testid="single-post-left-sidebar">SinglePostLeftSidebar</div>,
  SinglePostLeftDrawer: () => <div data-testid="single-post-left-drawer">SinglePostLeftDrawer</div>,
  SinglePostLeftDrawerMobile: () => <div data-testid="single-post-left-drawer-mobile">SinglePostLeftDrawerMobile</div>,
}));

vi.mock('@/organisms/SinglePostRightPanel/SinglePostRightPanel', () => ({
  SinglePostRightPanel: ({ postId, showFeedback = true }: { postId: string; showFeedback?: boolean }) => (
    <div data-testid="single-post-right-panel" data-post-id={postId} data-show-feedback={String(showFeedback)}>
      SinglePostRightPanel
    </div>
  ),
}));

describe('PostPageShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePostMissing).mockReturnValue({
      postMissing: false,
      postDetails: undefined,
      isLoading: true,
    });
  });

  it('renders post body without in-column search or header navigation', () => {
    render(
      <PostPageShell postId={VALID_COMPOSITE_POST_ID}>
        <div data-testid="post-body">body</div>
      </PostPageShell>,
    );

    expect(screen.queryByTestId('search-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-body')).toBeInTheDocument();
  });

  it('renders SinglePostLeftSidebar in left sidebar', () => {
    render(
      <PostPageShell postId={VALID_COMPOSITE_POST_ID}>
        <div>body</div>
      </PostPageShell>,
    );

    expect(screen.getByTestId('single-post-left-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('left-sidebar')).toContainElement(screen.getByTestId('single-post-left-sidebar'));
  });

  it('passes the mobile left drawer variant to ContentLayout', () => {
    render(
      <PostPageShell postId={VALID_COMPOSITE_POST_ID}>
        <div>body</div>
      </PostPageShell>,
    );

    expect(screen.getByTestId('left-drawer-mobile')).toContainElement(
      screen.getByTestId('single-post-left-drawer-mobile'),
    );
  });

  it('renders SinglePostRightPanel in right sidebar with postId', () => {
    render(
      <PostPageShell postId={VALID_COMPOSITE_POST_ID}>
        <div>body</div>
      </PostPageShell>,
    );

    const rightSidebar = screen.getByTestId('right-sidebar');
    const rightPanel = within(rightSidebar).getByTestId('single-post-right-panel');

    expect(rightPanel).toHaveAttribute('data-post-id', VALID_COMPOSITE_POST_ID);
    expect(rightPanel).toHaveAttribute('data-show-feedback', 'true');
  });

  it('swaps to discovery layout without post sidebars when the post is missing', () => {
    vi.mocked(usePostMissing).mockReturnValue({
      postMissing: true,
      postDetails: null,
      isLoading: false,
    });

    render(
      <PostPageShell postId={VALID_COMPOSITE_POST_ID}>
        <div data-testid="post-body">body</div>
      </PostPageShell>,
    );

    const discoveryLayout = screen.getByTestId('hot-discovery-content-layout');
    expect(discoveryLayout).toContainElement(screen.getByTestId('post-body'));
    expect(screen.queryByTestId('content-layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('single-post-left-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('single-post-right-panel')).not.toBeInTheDocument();
  });
});
