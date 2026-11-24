type WordSlotProps = {
  index: number;
  word: string;
  isCorrect: boolean;
  isError: boolean;
  onClear: (index: number) => void;
};

export type { WordSlotProps };
