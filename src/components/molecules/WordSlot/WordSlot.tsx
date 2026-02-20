import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Types from './WordSlot.types';

export const WordSlot = (props: Types.WordSlotProps) => {
  const { index, word, mode } = props;

  if (mode === 'editable') {
    const { isError, showError, isRestoring, onChange, onValidate, onKeyDown } = props;
    const hasError = isError && showError;

    const containerClasses = Libs.cn(
      'flex-row px-3 py-2 rounded-md border overflow-hidden relative',
      'inline-flex w-full items-center bg-transparent transition-colors',
      hasError && 'border-red-500 bg-red-500/10',
      !hasError && 'border-border hover:bg-secondary/50',
    );

    const badgeClasses = Libs.cn(
      'z-10 h-6 w-6 rounded-full flex-shrink-0 absolute left-3 top-1/2 -translate-y-1/2',
      hasError && 'bg-red-500 text-white',
      !hasError && 'bg-muted text-muted-foreground',
    );

    const inputColor = Libs.cn(
      '!border-none !bg-transparent !px-0 !pl-10 !pr-3 flex-row flex-1 min-w-0',
      hasError && '!text-red-500',
    );

    return (
      <Atoms.Container className="relative">
        <Atoms.Container className={containerClasses}>
          <Atoms.Badge variant="outline" className={badgeClasses}>
            {index + 1}
          </Atoms.Badge>
          <Atoms.Input
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
        </Atoms.Container>
      </Atoms.Container>
    );
  }

  // readonly mode
  const { isCorrect, isError, onClear } = props;
  const canClear = word !== '';

  const containerClasses = Libs.cn(
    'flex-row px-3 py-3 sm:px-5 sm:py-4 rounded-md border border-dashed overflow-hidden relative',
    'inline-flex w-full items-center transition-colors',
    'bg-background/10',
    canClear && 'cursor-pointer',
    isCorrect && 'border-brand hover:bg-brand/10',
    isError && 'border-destructive hover:bg-destructive/20',
    !isCorrect && !isError && 'border-input hover:bg-secondary/80',
  );

  const badgeClasses = Libs.cn(
    'z-10 h-5 min-w-5 rounded-full flex-shrink-0 absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 px-1',
    !isCorrect && !isError && 'bg-secondary text-secondary-foreground border border-transparent',
    isCorrect && 'bg-brand text-primary-foreground border border-transparent',
    isError && 'bg-destructive text-destructive-foreground border border-transparent',
  );

  const inputColor = Libs.cn(
    '!border-none !bg-transparent !px-0 !pl-9 sm:!pl-[52px] !pr-2 sm:!pr-5 flex-row flex-1 min-w-0 text-base font-medium leading-[24px]',
    !isCorrect && !isError && word === '' && 'text-muted-foreground',
    isCorrect && '!text-brand',
    isError && '!text-destructive',
  );

  const title = canClear ? 'Click to remove this word' : '';

  const handleClick = () => {
    if (canClear) onClear(index);
  };

  return (
    <Atoms.Container className="relative">
      <Atoms.Container className={containerClasses} onClick={handleClick} title={title}>
        <Atoms.Badge variant="outline" className={badgeClasses}>
          {index + 1}
        </Atoms.Badge>
        <Atoms.Input
          value={word}
          placeholder="word"
          className={inputColor}
          readOnly
          onClick={(e) => {
            e.stopPropagation();
            if (canClear) onClear(index);
          }}
        />
      </Atoms.Container>
    </Atoms.Container>
  );
};
