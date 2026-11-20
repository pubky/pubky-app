import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { SidebarSection } from '@/molecules/SidebarSection/SidebarSection';
import { CompactUserListItemSkeleton } from '@/organisms/CompactUserListItemSkeleton/CompactUserListItemSkeleton';

interface ResourceSectionProps {
  title: string;
  /** Shown after the title (`· N`, `· 50+`), when known. */
  count?: number | string;
  /** A line under the title saying what the list is. */
  description?: string;
  /** Rows (`ResourceListRow`), shown when there is no `message` and the section is not loading. */
  children?: React.ReactNode;
  /** The error line shown instead of the rows. */
  message?: string | null;
  /** Rows to show as skeletons while the list is read; nothing is loading when `0` or absent. */
  loadingRows?: number;
  /**
   * A button under the rows, in the sidebar card's footer (`SidebarSection`): a toggle of rows held
   * back ("Show N more", with `expanded`), or an action that is none (reading more, trying again).
   */
  footer?: { icon: LucideIcon; text: string; onClick: () => void; expanded?: boolean };
  testId: string;
  /** The section's id, for a link to it (`#other-dates`). */
  id?: string;
}

/**
 * One of the resource page's sidebar cards (Also on, Similar), the post page's
 * sidebar card (`SidebarSection`, as Participants): its title, then rows, the participants'
 * loading skeleton, or an error line.
 */
export function ResourceSection({
  title,
  count,
  description,
  children,
  message,
  loadingRows = 0,
  footer,
  testId,
  id,
}: ResourceSectionProps) {
  const isLoading = loadingRows > 0;
  const listId = useId();

  return (
    // A named region (`SidebarSection` is a plain block), busy while its list is read.
    <Container as="section" overrideDefaults id={id} aria-label={title} aria-busy={isLoading} data-testid={testId}>
      {/* The count never wraps alone onto a line of its own in the narrow column. */}
      <SidebarSection
        title={count === undefined ? title : `${title}\u00a0·\u00a0${count}`}
        footerIcon={footer?.icon}
        footerText={footer?.text}
        onFooterClick={footer?.onClick}
        footerTestId={footer ? `${testId}-toggle` : undefined}
        footerExpanded={footer?.expanded}
        footerControls={footer?.expanded !== undefined ? listId : undefined}
      >
        {description && (
          <Typography size="sm" className="font-normal text-muted-foreground">
            {description}
          </Typography>
        )}
        {isLoading ? (
          <Container
            overrideDefaults
            aria-hidden="true"
            data-testid={`${testId}-loading`}
            className="flex flex-col gap-2"
          >
            {Array.from({ length: loadingRows }, (_, index) => (
              <CompactUserListItemSkeleton key={index} />
            ))}
          </Container>
        ) : message ? (
          <Typography size="sm" data-testid={`${testId}-message`} className="font-normal text-muted-foreground">
            {message}
          </Typography>
        ) : (
          <ul id={listId} className="flex min-w-0 flex-col gap-2">
            {children}
          </ul>
        )}
      </SidebarSection>
    </Container>
  );
}
