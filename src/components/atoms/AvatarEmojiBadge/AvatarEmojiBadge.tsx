import { Container } from '../Container/Container';

export interface AvatarEmojiBadgeProps {
  emoji: string;
}

export function AvatarEmojiBadge({ emoji }: AvatarEmojiBadgeProps) {
  return (
    <Container
      overrideDefaults={true}
      className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center text-3xl leading-none lg:size-16 lg:text-5xl"
    >
      {emoji}
    </Container>
  );
}
