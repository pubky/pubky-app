import { Container } from '@/atoms/Container/Container';
import { ProfileTagged } from '@/organisms/ProfileTagged/ProfileTagged';

/**
 * ProfileTaggedPage Template
 *
 * Static layout template that renders the ProfileTagged organism.
 * Templates should only handle layout concerns, not data fetching.
 */
export function ProfileTaggedPage() {
  return (
    <Container className="mt-6 lg:mt-0">
      <ProfileTagged />
    </Container>
  );
}
