import { Container } from '@/atoms/Container/Container';
import { Spinner } from '@/atoms/Spinner/Spinner';

export default function ProfileLoading() {
  return (
    <Container overrideDefaults={true} className="flex min-h-[400px] items-center justify-center">
      <Spinner />
    </Container>
  );
}
