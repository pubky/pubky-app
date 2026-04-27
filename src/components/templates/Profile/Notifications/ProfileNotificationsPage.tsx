import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';

/**
 * Template for the notifications page.
 * Handles only layout - all business logic is in NotificationsContainer organism.
 */
export function ProfileNotificationsPage() {
  return (
    <Atoms.Container className="mt-6 gap-4 lg:mt-0">
      <Organisms.NotificationsContainer />
    </Atoms.Container>
  );
}
