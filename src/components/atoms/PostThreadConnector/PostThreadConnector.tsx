import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import { POST_THREAD_CONNECTOR_VARIANTS } from './PostThreadConnector.constants';
import type { PostThreadConnectorVariant } from './PostThreadConnector.types';

interface PostThreadConnectorProps {
  height?: number;
  variant?: PostThreadConnectorVariant;
  'data-testid'?: string;
}

const DEFAULT_HEIGHT = 96; // Default height in pixels (6rem = 96px)

/**
 * Encapsulates the vertical thread line functionality
 * Used as a building block for thread connectors
 */
const ThreadLine = () => {
  return (
    <Atoms.Container
      className="min-h-px w-full min-w-px shrink-0 grow basis-0 border-l border-border"
      overrideDefaults
    />
  );
};

// Base container props shared by height-based variants
const getBaseContainerProps = (effectiveHeight: number, variant: PostThreadConnectorVariant, dataTestId?: string) => ({
  className: 'flex w-3 flex-col items-start',
  style: { height: `${effectiveHeight}px` } as React.CSSProperties,
  overrideDefaults: true as const,
  'data-testid': dataTestId,
  'data-variant': variant,
});

// Common inner container structure
const InnerContainer = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <Atoms.Container
    className={Libs.cn('relative flex min-h-px w-full min-w-px shrink-0 grow basis-0 flex-col items-start', className)}
    overrideDefaults
  >
    {children}
  </Atoms.Container>
);

// Spacer container
const Spacer = () => <Atoms.Container className="min-h-px w-3 min-w-px shrink-0 grow basis-0" overrideDefaults />;

// Dialog reply variant - completely different structure, doesn't need height
const DialogReplyVariant = ({ dataTestId }: { dataTestId?: string }) => (
  <Atoms.Container overrideDefaults data-testid={dataTestId} data-variant={POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY}>
    {/* Vertical line - 35px long from the post-card edge to the horizontal connector */}
    <Atoms.Container
      className="absolute top-[-13px] -left-3 h-[35px] w-px border-l border-secondary"
      overrideDefaults
    />
    {/* Horizontal connector at avatar level */}
    <Atoms.Container className="absolute top-[22px] -left-3" overrideDefaults>
      <Libs.LineHorizontal />
    </Atoms.Container>
  </Atoms.Container>
);

export const PostThreadConnector = ({
  height,
  variant = POST_THREAD_CONNECTOR_VARIANTS.REGULAR,
  'data-testid': dataTestId,
}: PostThreadConnectorProps) => {
  // Dialog reply is special - doesn't need height calculation
  if (variant === POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY) {
    return <DialogReplyVariant dataTestId={dataTestId} />;
  }

  // Calculate effective height for variants that need it
  const effectiveHeight = height || DEFAULT_HEIGHT;
  const baseProps = getBaseContainerProps(effectiveHeight, variant, dataTestId);

  switch (variant) {
    case POST_THREAD_CONNECTOR_VARIANTS.LAST:
      // Last variant - shows a rounded corner at the end, aligned with action buttons
      return (
        <Atoms.Container {...baseProps}>
          <InnerContainer>
            <ThreadLine />
            <Atoms.Container className="relative size-3 shrink-0" overrideDefaults>
              <Libs.RoundedCorner />
            </Atoms.Container>
          </InnerContainer>
          {/* Fixed spacer so the curve aligns with action buttons */}
          <Atoms.Container className="h-[28px] w-3 shrink-0" overrideDefaults />
        </Atoms.Container>
      );

    case POST_THREAD_CONNECTOR_VARIANTS.REGULAR:
    default:
      // Regular variant (default) - shows a rounded corner in the middle
      // TODO: Remove -ml-px to have a seamless connection between the thread connector and the post card
      return (
        <Atoms.Container {...baseProps} className={Libs.cn(baseProps.className, 'border-l border-border')}>
          <InnerContainer className="min-w-3">
            <Atoms.Container className="min-h-px w-full min-w-px shrink-0 grow basis-0" overrideDefaults />
            <Atoms.Container className="relative -ml-px size-3 shrink-0" overrideDefaults>
              <Libs.RoundedCorner />
            </Atoms.Container>
          </InnerContainer>
          <Spacer />
        </Atoms.Container>
      );
  }
};
