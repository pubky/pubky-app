import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';

/**
 * ProfileTaggedPage Template
 *
 * Static layout template that renders the ProfileTagged organism.
 * Templates should only handle layout concerns, not data fetching.
 */
export function ProfileTaggedPage() {
  return (
    <Atoms.Container className="mt-6 lg:mt-0">
      <Organisms.ProfileTagged />
    </Atoms.Container>
  );
}
