import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';

export function DialogAge() {
  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Typography
          as="span"
          size="sm"
          role="button"
          tabIndex={0}
          onKeyDown={handleTriggerKeyDown}
          className="cursor-pointer font-medium text-brand"
        >
          over 18 years old.
        </Typography>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl" hiddenTitle="Age minimum: 18">
        <DialogHeader className="pr-6">
          <DialogTitle>Age minimum: 18</DialogTitle>
        </DialogHeader>
        <Container className="h-full overflow-y-auto pr-4">
          <Container className="gap-4">
            <Typography size="sm" className="font-normal text-muted-foreground">
              You can only use Pubky if you are over 18 years old.
            </Typography>
          </Container>
        </Container>
      </DialogContent>
    </Dialog>
  );
}
