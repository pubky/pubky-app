import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { POST_INPUT_VARIANT } from '../PostInput/PostInput.constants';
import { PostInputExpandableSection } from './PostInputExpandableSection';

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

const defaultProps = {
  content: '',
  tags: [],
  isSubmitting: false,
  isArticle: false,
  submitMode: POST_INPUT_VARIANT.REPLY,
  setTags: vi.fn(),
  onSubmit: vi.fn(),
  showEmojiPicker: false,
  setShowEmojiPicker: vi.fn(),
  onEmojiSelect: vi.fn(),
};

describe('PostInputExpandableSection - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it('matches the desktop snapshot with the real action bar', () => {
    const { container } = render(<PostInputExpandableSection {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('PostInputExpandableSection - Mobile Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsMobile).mockReturnValue(true);
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches the mobile snapshot with the real action bar', () => {
    const { container } = render(<PostInputExpandableSection {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
