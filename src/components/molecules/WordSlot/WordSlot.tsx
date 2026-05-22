import { Badge } from '@/atoms/Badge/Badge';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { cn } from '@/libs/utils/utils';
import type { WordSlotProps } from './WordSlot.types';

export const WordSlot = (props: WordSlotProps) => {
  const { index, word, mode } = props;

  if (mode === 'editable') {
    const { isError, showError, isRestoring, onChange, onValidate, onKeyDown } = props;
    const hasError = isError && showError;

    const containerClasses = cn(
      'relative flex-row overflow-hidden rounded-md border border-dashed px-3 py-2',
      'inline-flex w-full items-center bg-transparent transition-colors',
      hasError && 'border-red-500 bg-red-500/10',
      !hasError && 'border-border hover:bg-secondary/50',
    );

    const badgeClasses = cn(
      'absolute top-1/2 left-3 z-10 h-6 w-6 flex-shrink-0 -translate-y-1/2 rounded-full',
      hasError && 'bg-red-500 text-white',
      !hasError && 'bg-muted text-muted-foreground',
    );

    const inputColor = cn(
      'min-w-0 flex-1 flex-row !border-none !bg-transparent !px-0 !pr-3 !pl-10',
      hasError && '!text-red-500',
    );

    return (
      <Container className="relative">
        <Container className={containerClasses}>
          <Badge variant="outline" className={badgeClasses}>
            {index + 1}
          </Badge>
          <Input
            id={`word-slot-input-${index + 1}`}
            value={word}
            placeholder="word"
            className={inputColor}
            onChange={(e) => onChange(index, e.target.value.toLowerCase().trim())}
            onBlur={() => onValidate(index, word)}
            onKeyDown={onKeyDown}
            disabled={isRestoring}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </Container>
      </Container>
    );
  }

  // readonly mode
  const { isCorrect, isError, onClear } = props;
  const canClear = word !== '';

  const containerClasses = cn(
    'relative flex-row overflow-hidden rounded-md border border-dashed px-3 py-3 sm:px-5 sm:py-4',
    'inline-flex w-full items-center transition-colors',
    'bg-background/10',
    canClear && 'cursor-pointer',
    isCorrect && 'border-brand hover:bg-brand/10',
    isError && 'border-destructive hover:bg-destructive/20',
    !isCorrect && !isError && 'border-input hover:bg-secondary/80',
  );

  const badgeClasses = cn(
    'absolute top-1/2 left-3 z-10 h-5 min-w-5 flex-shrink-0 -translate-y-1/2 rounded-full px-1 sm:left-5',
    !isCorrect && !isError && 'border border-transparent bg-secondary text-secondary-foreground',
    isCorrect && 'border border-transparent bg-brand text-primary-foreground',
    isError && 'border border-transparent bg-destructive text-destructive-foreground',
  );

  const inputColor = cn(
    'min-w-0 flex-1 flex-row !border-none !bg-transparent !px-0 !pr-2 !pl-9 text-base leading-[24px] font-medium sm:!pr-5 sm:!pl-[52px]',
    !isCorrect && !isError && word === '' && 'text-muted-foreground',
    isCorrect && '!text-brand',
    isError && '!text-destructive',
  );

  const title = canClear ? 'Click to remove this word' : '';

  const handleClick = () => {
    if (canClear) onClear(index);
  };

  return (
    <Container className="relative">
      <Container className={containerClasses} onClick={handleClick} title={title}>
        <Badge variant="outline" className={badgeClasses}>
          {index + 1}
        </Badge>
        <Input
          value={word}
          placeholder="word"
          className={inputColor}
          readOnly
          onClick={(e) => {
            e.stopPropagation();
            if (canClear) onClear(index);
          }}
        />
      </Container>
    </Container>
  );
};
