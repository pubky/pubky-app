export class BotPhraseRevealController {
  #phrase: string | undefined;
  #revealed = false;
  #mismatches = 0;

  set(phrase: string): void {
    this.clear();
    this.#phrase = phrase;
  }

  reveal(): boolean {
    if (!this.#phrase) return false;
    this.#revealed = true;
    return true;
  }

  words(): string[] {
    return this.#revealed && this.#phrase ? this.#phrase.split(' ') : [];
  }

  phraseForConfirmation(): string | undefined {
    return this.#revealed ? this.#phrase : undefined;
  }

  recordMismatch(): boolean {
    this.#mismatches += 1;
    if (this.#mismatches < 3) return false;
    this.clear();
    return true;
  }

  clear(): void {
    this.#phrase = undefined;
    this.#revealed = false;
    this.#mismatches = 0;
  }
}
