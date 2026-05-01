import { Container } from '@/atoms/Container/Container';
import { NotificationsContainer } from '@/organisms/NotificationsContainer/NotificationsContainer';

/**
 * Template for the notifications page.
 * Handles only layout - all business logic is in NotificationsContainer organism.
 */
export function ProfileNotificationsPage() {
  return (
    <Container className="mt-6 gap-4 lg:mt-0">
      <NotificationsContainer />
    </Container>
  );
}
