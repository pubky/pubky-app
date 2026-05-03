import { Container } from '../Container/Container';

interface PostThreadSpacerProps {
  'data-testid'?: string;
}

export const PostThreadSpacer = ({ 'data-testid': dataTestId }: PostThreadSpacerProps) => {
  return (
    <Container overrideDefaults className="flex h-3" data-testid={dataTestId}>
      <Container overrideDefaults className="w-3 border-l border-border" />
      <Container overrideDefaults className="flex-1" />
    </Container>
  );
};
