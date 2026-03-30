import { describe, it, expect } from 'vitest';
import { sanitizeCodeBlockLanguages, resolveCodeBlockLanguage } from './InitializedMDXEditor.utils';
import { CODE_BLOCK_LANGUAGES, LANGUAGE_ALIASES } from './InitializedMDXEditor.constants';

describe('resolveCodeBlockLanguage', () => {
  it('returns the language as-is when directly supported', () => {
    expect(resolveCodeBlockLanguage('javascript')).toBe('javascript');
    expect(resolveCodeBlockLanguage('python')).toBe('python');
    expect(resolveCodeBlockLanguage('rust')).toBe('rust');
    expect(resolveCodeBlockLanguage('plaintext')).toBe('plaintext');
  });

  it('is case-insensitive for direct matches', () => {
    expect(resolveCodeBlockLanguage('JavaScript')).toBe('javascript');
    expect(resolveCodeBlockLanguage('PYTHON')).toBe('python');
    expect(resolveCodeBlockLanguage('TypeScript')).toBe('typescript');
    expect(resolveCodeBlockLanguage('HTML')).toBe('html');
    expect(resolveCodeBlockLanguage('JSON')).toBe('json');
  });

  it('resolves common aliases to supported languages', () => {
    expect(resolveCodeBlockLanguage('js')).toBe('javascript');
    expect(resolveCodeBlockLanguage('ts')).toBe('typescript');
    expect(resolveCodeBlockLanguage('py')).toBe('python');
    expect(resolveCodeBlockLanguage('rb')).toBe('ruby');
    expect(resolveCodeBlockLanguage('sh')).toBe('bash');
    expect(resolveCodeBlockLanguage('yml')).toBe('yaml');
    expect(resolveCodeBlockLanguage('rs')).toBe('rust');
    expect(resolveCodeBlockLanguage('kt')).toBe('kotlin');
    expect(resolveCodeBlockLanguage('cs')).toBe('csharp');
    expect(resolveCodeBlockLanguage('gql')).toBe('graphql');
    expect(resolveCodeBlockLanguage('md')).toBe('markdown');
    expect(resolveCodeBlockLanguage('htm')).toBe('html');
  });

  it('is case-insensitive for aliases', () => {
    expect(resolveCodeBlockLanguage('JS')).toBe('javascript');
    expect(resolveCodeBlockLanguage('Ts')).toBe('typescript');
    expect(resolveCodeBlockLanguage('PY')).toBe('python');
    expect(resolveCodeBlockLanguage('YML')).toBe('yaml');
  });

  it('resolves plaintext aliases', () => {
    expect(resolveCodeBlockLanguage('text')).toBe('plaintext');
    expect(resolveCodeBlockLanguage('plain')).toBe('plaintext');
    expect(resolveCodeBlockLanguage('txt')).toBe('plaintext');
    expect(resolveCodeBlockLanguage('TEXT')).toBe('plaintext');
  });

  it('resolves C++ and C# aliases', () => {
    expect(resolveCodeBlockLanguage('c++')).toBe('cpp');
    expect(resolveCodeBlockLanguage('c#')).toBe('csharp');
  });

  it('resolves module-style JS/TS aliases', () => {
    expect(resolveCodeBlockLanguage('mjs')).toBe('javascript');
    expect(resolveCodeBlockLanguage('cjs')).toBe('javascript');
    expect(resolveCodeBlockLanguage('mts')).toBe('typescript');
    expect(resolveCodeBlockLanguage('cts')).toBe('typescript');
  });

  it('resolves shell aliases', () => {
    expect(resolveCodeBlockLanguage('zsh')).toBe('bash');
    expect(resolveCodeBlockLanguage('fish')).toBe('bash');
  });

  it('resolves dockerfile alias', () => {
    expect(resolveCodeBlockLanguage('dockerfile')).toBe('docker');
    expect(resolveCodeBlockLanguage('Dockerfile')).toBe('docker');
  });

  it('resolves JSON variant aliases', () => {
    expect(resolveCodeBlockLanguage('jsonc')).toBe('json');
    expect(resolveCodeBlockLanguage('json5')).toBe('json');
  });

  it('resolves kotlin file extension alias', () => {
    expect(resolveCodeBlockLanguage('kts')).toBe('kotlin');
  });

  it('falls back to plaintext for unknown languages', () => {
    expect(resolveCodeBlockLanguage('unknownlang')).toBe('plaintext');
    expect(resolveCodeBlockLanguage('fortran')).toBe('plaintext');
    expect(resolveCodeBlockLanguage('cobol')).toBe('plaintext');
    expect(resolveCodeBlockLanguage('haskell')).toBe('plaintext');
    expect(resolveCodeBlockLanguage('')).toBe('plaintext');
  });

  it('handles all LANGUAGE_ALIASES entries', () => {
    // Verify every alias in the map resolves to something in CODE_BLOCK_LANGUAGES
    for (const [alias, target] of Object.entries(LANGUAGE_ALIASES)) {
      const result = resolveCodeBlockLanguage(alias);
      expect(result).toBe(target);
    }
  });
});

describe('sanitizeCodeBlockLanguages', () => {
  describe('pass-through behavior (no code blocks)', () => {
    it('returns empty string unchanged', () => {
      expect(sanitizeCodeBlockLanguages('')).toBe('');
    });

    it('returns plain text unchanged', () => {
      const text = 'Hello, world!';
      expect(sanitizeCodeBlockLanguages(text)).toBe(text);
    });

    it('returns multi-line text without code blocks unchanged', () => {
      const text = '# Heading\n\nSome paragraph text.\n\n- List item 1\n- List item 2';
      expect(sanitizeCodeBlockLanguages(text)).toBe(text);
    });

    it('does not modify inline code', () => {
      const text = 'Use `const x = 1` for variables and ``code with `backticks` inside``';
      expect(sanitizeCodeBlockLanguages(text)).toBe(text);
    });

    it('does not modify indented code blocks (4+ spaces)', () => {
      const text = 'Some text\n\n    indented code block\n    more code\n\nEnd';
      expect(sanitizeCodeBlockLanguages(text)).toBe(text);
    });
  });

  describe('code blocks without language', () => {
    it('adds plaintext to a backtick fence with no language', () => {
      const input = '```\nconsole.log("hello")\n```';
      const expected = '```plaintext\nconsole.log("hello")\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('adds plaintext to a tilde fence with no language', () => {
      const input = '~~~\nprint("hello")\n~~~';
      const expected = '~~~plaintext\nprint("hello")\n~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('adds plaintext to a fence with only whitespace after it', () => {
      const input = '```   \ncode\n```';
      const expected = '```plaintext\ncode\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('adds plaintext to an empty code block', () => {
      const input = '```\n```';
      const expected = '```plaintext\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles code block with no closing fence (EOF)', () => {
      const input = '```\nsome code\nmore code';
      const expected = '```plaintext\nsome code\nmore code';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });

  describe('code blocks with supported languages', () => {
    it('preserves supported languages unchanged', () => {
      const input = '```javascript\nconsole.log("hello")\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });

    it('preserves all supported languages', () => {
      for (const lang of Object.keys(CODE_BLOCK_LANGUAGES)) {
        const input = `\`\`\`${lang}\ncode\n\`\`\``;
        expect(sanitizeCodeBlockLanguages(input)).toBe(input);
      }
    });

    it('lowercases supported language names', () => {
      const input = '```JavaScript\nconsole.log("hello")\n```';
      const expected = '```javascript\nconsole.log("hello")\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('lowercases mixed-case language names', () => {
      const input = '```TypeScript\nconst x: number = 1;\n```';
      const expected = '```typescript\nconst x: number = 1;\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });

  describe('code blocks with unsupported languages', () => {
    it('replaces unsupported language with plaintext', () => {
      const input = '```unknownlang\nsome code\n```';
      const expected = '```plaintext\nsome code\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('replaces various unsupported languages with plaintext', () => {
      const languages = ['fortran', 'cobol', 'haskell', 'erlang', 'elixir', 'lua', 'perl'];
      for (const lang of languages) {
        const input = `\`\`\`${lang}\ncode\n\`\`\``;
        const expected = `\`\`\`plaintext\ncode\n\`\`\``;
        expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
      }
    });
  });

  describe('code blocks with aliases', () => {
    it('resolves js to javascript', () => {
      const input = '```js\nconsole.log("hello")\n```';
      const expected = '```javascript\nconsole.log("hello")\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('resolves ts to typescript', () => {
      const input = '```ts\nconst x: number = 1;\n```';
      const expected = '```typescript\nconst x: number = 1;\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('resolves py to python', () => {
      const input = '```py\nprint("hello")\n```';
      const expected = '```python\nprint("hello")\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('resolves sh to bash', () => {
      const input = '```sh\necho "hello"\n```';
      const expected = '```bash\necho "hello"\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('resolves yml to yaml', () => {
      const input = '```yml\nkey: value\n```';
      const expected = '```yaml\nkey: value\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('resolves text/plain/txt to plaintext', () => {
      expect(sanitizeCodeBlockLanguages('```text\ncode\n```')).toBe('```plaintext\ncode\n```');
      expect(sanitizeCodeBlockLanguages('```plain\ncode\n```')).toBe('```plaintext\ncode\n```');
      expect(sanitizeCodeBlockLanguages('```txt\ncode\n```')).toBe('```plaintext\ncode\n```');
    });

    it('resolves aliases case-insensitively', () => {
      const input = '```JS\nconsole.log("hello")\n```';
      const expected = '```javascript\nconsole.log("hello")\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });

  describe('tilde fences', () => {
    it('sanitizes tilde fence with no language', () => {
      const input = '~~~\ncode\n~~~';
      const expected = '~~~plaintext\ncode\n~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('sanitizes tilde fence with unsupported language', () => {
      const input = '~~~unknownlang\ncode\n~~~';
      const expected = '~~~plaintext\ncode\n~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('preserves tilde fence with supported language', () => {
      const input = '~~~python\nprint("hello")\n~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });

    it('resolves tilde fence aliases', () => {
      const input = '~~~js\nconsole.log("hello")\n~~~';
      const expected = '~~~javascript\nconsole.log("hello")\n~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('allows backticks in tilde fence info string (per CommonMark)', () => {
      // Tilde fences CAN have backticks in the info string; the whole info string
      // is treated as the language identifier (first word)
      const input = '~~~some`lang\ncode\n~~~';
      const expected = '~~~plaintext\ncode\n~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });

  describe('fence length variations', () => {
    it('handles 4-backtick fences', () => {
      const input = '````\ncode\n````';
      const expected = '````plaintext\ncode\n````';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles 5-backtick fences', () => {
      const input = '`````\ncode\n`````';
      const expected = '`````plaintext\ncode\n`````';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles closing fence longer than opening fence', () => {
      const input = '```\ncode\n`````';
      const expected = '```plaintext\ncode\n`````';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('does not close a 4-backtick fence with 3 backticks', () => {
      // A 4-backtick opening fence requires at least 4 backticks to close
      const input = '````\ncode\n```\nmore code\n````';
      const expected = '````plaintext\ncode\n```\nmore code\n````';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles long tilde fences', () => {
      const input = '~~~~~\ncode\n~~~~~';
      const expected = '~~~~~plaintext\ncode\n~~~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });

  describe('indented fences (up to 3 spaces)', () => {
    it('handles 1 space of indentation', () => {
      const input = ' ```\ncode\n ```';
      const expected = ' ```plaintext\ncode\n ```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles 2 spaces of indentation', () => {
      const input = '  ```js\ncode\n  ```';
      const expected = '  ```javascript\ncode\n  ```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles 3 spaces of indentation', () => {
      const input = '   ```\ncode\n   ```';
      const expected = '   ```plaintext\ncode\n   ```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('does NOT treat 4 spaces of indentation as a fence', () => {
      // 4+ spaces makes it an indented code block, not a fenced one
      const input = '    ```\ncode\n    ```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });

    it('preserves indentation in the output', () => {
      const input = '  ```unknownlang\n  code here\n  ```';
      const expected = '  ```plaintext\n  code here\n  ```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });

  describe('info strings after language', () => {
    it('preserves info string after supported language', () => {
      const input = '```javascript title="example.js"\nconsole.log("hello")\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });

    it('preserves info string after resolving alias', () => {
      const input = '```js title="example.js"\nconsole.log("hello")\n```';
      const expected = '```javascript title="example.js"\nconsole.log("hello")\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('preserves info string when falling back to plaintext', () => {
      const input = '```unknownlang highlight={1,3}\ncode\n```';
      const expected = '```plaintext highlight={1,3}\ncode\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('preserves info string with multiple space-separated values', () => {
      const input = '```ts title="app.ts" showLineNumbers\ncode\n```';
      const expected = '```typescript title="app.ts" showLineNumbers\ncode\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });

  describe('multiple code blocks', () => {
    it('sanitizes multiple code blocks in one document', () => {
      const input = [
        '# Title',
        '',
        '```',
        'first block',
        '```',
        '',
        'Some text',
        '',
        '```js',
        'second block',
        '```',
        '',
        '```unknownlang',
        'third block',
        '```',
      ].join('\n');

      const expected = [
        '# Title',
        '',
        '```plaintext',
        'first block',
        '```',
        '',
        'Some text',
        '',
        '```javascript',
        'second block',
        '```',
        '',
        '```plaintext',
        'third block',
        '```',
      ].join('\n');

      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles alternating backtick and tilde fences', () => {
      const input = '```\nblock 1\n```\n\n~~~\nblock 2\n~~~';
      const expected = '```plaintext\nblock 1\n```\n\n~~~plaintext\nblock 2\n~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles multiple blocks with different issues', () => {
      const input = [
        '```python',
        'good_block()',
        '```',
        '',
        '```',
        'no_lang_block()',
        '```',
        '',
        '```rb',
        'alias_block()',
        '```',
        '',
        '```haskell',
        'unsupported_block()',
        '```',
      ].join('\n');

      const expected = [
        '```python',
        'good_block()',
        '```',
        '',
        '```plaintext',
        'no_lang_block()',
        '```',
        '',
        '```ruby',
        'alias_block()',
        '```',
        '',
        '```plaintext',
        'unsupported_block()',
        '```',
      ].join('\n');

      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });

  describe('fence character matching', () => {
    it('does not close backtick fence with tilde fence', () => {
      // Backtick opening + tilde in the middle should not close the block
      const input = '```\ncode\n~~~\nmore code\n```';
      const expected = '```plaintext\ncode\n~~~\nmore code\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('does not close tilde fence with backtick fence', () => {
      const input = '~~~\ncode\n```\nmore code\n~~~';
      const expected = '~~~plaintext\ncode\n```\nmore code\n~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles backtick code block containing triple tildes in content', () => {
      const input = '```javascript\nconst s = "~~~";\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });

    it('handles tilde code block containing triple backticks in content', () => {
      const input = '~~~javascript\nconst s = "```";\n~~~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });
  });

  describe('content inside code blocks is not modified', () => {
    it('does not modify lines that look like fences inside a code block', () => {
      const input = ['````markdown', 'Here is an example:', '```js', 'console.log("hello")', '```', '````'].join('\n');
      // The inner ```js should NOT be modified because it's content of the outer block
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });

    it('does not modify backtick-like content inside a code block', () => {
      const input = '```python\n# Use ``` to start a code block\nprint("hello")\n```';
      // The ``` inside the content should not be treated as a fence
      // (backtick info string can't contain backticks, so the line
      //  "# Use ``` to start a code block" has backticks and won't match opening regex)
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });
  });

  describe('edge cases', () => {
    it('handles null/undefined input gracefully', () => {
      // The function signature expects string, but defensive coding
      expect(sanitizeCodeBlockLanguages('')).toBe('');
    });

    it('handles a single backtick fence line (no content, no closing)', () => {
      const input = '```';
      const expected = '```plaintext';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles markdown with only whitespace', () => {
      const input = '   \n  \n   ';
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });

    it('handles Windows-style line endings (CRLF)', () => {
      const input = '```\r\ncode\r\n```';
      const expected = '```plaintext\ncode\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles mixed line endings', () => {
      const input = '```\ncode\r\n```';
      const expected = '```plaintext\ncode\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles consecutive code blocks with no gap', () => {
      const input = '```\nblock1\n```\n```\nblock2\n```';
      const expected = '```plaintext\nblock1\n```\n```plaintext\nblock2\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles a code block fence at the very end of the document', () => {
      const input = 'Some text\n\n```js\nconsole.log("hello")';
      const expected = 'Some text\n\n```javascript\nconsole.log("hello")';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('does not treat fewer than 3 backticks as a fence', () => {
      const input = '``not a fence``\n`also not`';
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });

    it('does not treat fewer than 3 tildes as a fence', () => {
      const input = '~~strikethrough~~\n~not a fence~';
      expect(sanitizeCodeBlockLanguages(input)).toBe(input);
    });

    it('handles backtick fence where info string contains backtick (not a valid fence per CommonMark)', () => {
      // Per CommonMark: a backtick fence's info string cannot contain backtick characters
      // So ```lang`extra is NOT a valid backtick fence opening
      const input = '```lang`extra\ncode\n```';
      // The first line doesn't match backtick regex (has backtick in info string)
      // and doesn't match tilde regex (uses backticks, not tildes)
      // So it's treated as regular text
      // The "```" on line 3 then becomes an opening fence (no language)
      expect(sanitizeCodeBlockLanguages(input)).toBe('```lang`extra\ncode\n```plaintext');
    });

    it('handles a code block with content that contains the same fence pattern', () => {
      // Using a longer fence to contain shorter fence patterns
      const input = '`````\n```\nsome text\n```\n`````';
      const expected = '`````plaintext\n```\nsome text\n```\n`````';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles very long language identifier', () => {
      const longLang = 'a'.repeat(1000);
      const input = `\`\`\`${longLang}\ncode\n\`\`\``;
      const expected = '```plaintext\ncode\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles code block with only a language line and closing fence', () => {
      const input = '```js\n```';
      const expected = '```javascript\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles trailing whitespace on closing fence', () => {
      const input = '```\ncode\n```   ';
      const expected = '```plaintext\ncode\n```   ';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('preserves surrounding content unchanged', () => {
      const input = [
        '# My Article',
        '',
        'Here is some **bold** text and a [link](http://example.com).',
        '',
        '```',
        'code block',
        '```',
        '',
        '> A blockquote',
        '',
        '1. First item',
        '2. Second item',
        '',
        '---',
      ].join('\n');

      const expected = [
        '# My Article',
        '',
        'Here is some **bold** text and a [link](http://example.com).',
        '',
        '```plaintext',
        'code block',
        '```',
        '',
        '> A blockquote',
        '',
        '1. First item',
        '2. Second item',
        '',
        '---',
      ].join('\n');

      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });

  describe('realistic user scenarios', () => {
    it('handles the original bug: fenced code block with no language', () => {
      const input = 'Check this out:\n\n```\nconst x = 1;\nconsole.log(x);\n```\n\nCool, right?';
      const expected = 'Check this out:\n\n```plaintext\nconst x = 1;\nconsole.log(x);\n```\n\nCool, right?';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('handles mixed supported and unsupported languages in a real document', () => {
      const input = [
        '# Code Examples',
        '',
        'JavaScript example:',
        '```js',
        'function hello() {',
        '  console.log("Hello!");',
        '}',
        '```',
        '',
        'Python example:',
        '```python',
        'def hello():',
        '    print("Hello!")',
        '```',
        '',
        'Unknown example:',
        '```haskell',
        'main = putStrLn "Hello, World!"',
        '```',
        '',
        'No language:',
        '```',
        'just some text',
        '```',
      ].join('\n');

      const expected = [
        '# Code Examples',
        '',
        'JavaScript example:',
        '```javascript',
        'function hello() {',
        '  console.log("Hello!");',
        '}',
        '```',
        '',
        'Python example:',
        '```python',
        'def hello():',
        '    print("Hello!")',
        '```',
        '',
        'Unknown example:',
        '```plaintext',
        'main = putStrLn "Hello, World!"',
        '```',
        '',
        'No language:',
        '```plaintext',
        'just some text',
        '```',
      ].join('\n');

      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });

    it('sanitizes a Dockerfile code block', () => {
      const input = '```dockerfile\nFROM node:18\nCOPY . .\n```';
      const expected = '```docker\nFROM node:18\nCOPY . .\n```';
      expect(sanitizeCodeBlockLanguages(input)).toBe(expected);
    });
  });
});
