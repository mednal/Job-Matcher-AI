import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * M8.5's second Verify line: **no probability wording anywhere in the API surface**.
 *
 * `ARCHITECTURE.md` §6.5 and `DATABASE.md` §4.2 prohibit `probability`, `chance`,
 * `likelihood`, `successRate` and `matchProbability` at every layer, because a
 * percentage is easy to misread as a chance of being hired and the product must
 * never make that claim (`CLAUDE.md`, `PRODUCT.md` §8). That is a rule a reviewer is
 * supposed to catch in every diff, which is exactly the kind of rule that erodes
 * quietly — so it is checked mechanically here, the way `sources.imports.spec.ts`
 * checks the module boundaries.
 *
 * **Comments are stripped before the check, deliberately.** The prohibition is on
 * what the system *calls* things — identifiers, string literals, response keys — not
 * on prose explaining the prohibition. Several files carry a comment saying the
 * score is "never a hiring probability", and a check that failed on those would
 * teach the next author to delete the warning rather than keep it.
 */

const SRC = join(__dirname, '..', '..');
const BACKEND = join(SRC, '..');

/** The vocabulary §6.5 forbids, each with the reading that makes it wrong. */
const PROHIBITED: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /probabilit/i,
    why: 'the score is suitability, never a probability of being hired',
  },
  {
    pattern: /chance/i,
    why: 'the score says nothing about a candidate’s chances',
  },
  {
    pattern: /likelihood/i,
    why: 'the score is not a likelihood of an interview or a reply',
  },
  {
    pattern: /success[\s_-]?rate/i,
    why: 'the score is not an outcome rate',
  },
];

/** Every `.ts` file under a directory, minus build output and dependencies. */
function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts')) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * The file with its comments removed and everything else — identifiers, string and
 * template literals — kept.
 *
 * A character scanner rather than a regex, because the naive one is wrong in both
 * directions: `'https://example.com'` is not a line comment, and a `//` that follows
 * a string on the same line is. Getting that wrong would silently stop checking
 * whole files, which is worse than failing loudly.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (
        i < source.length &&
        !(source[i] === '*' && source[i + 1] === '/')
      ) {
        i += 1;
      }
      i += 2;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      out += char;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        // An escaped character can be the quote itself; take both and continue.
        if (source[i] === '\\') {
          out += source[i] + (source[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += source[i];
        i += 1;
      }
      out += quote;
      i += 1;
      continue;
    }

    out += char;
    i += 1;
  }

  return out;
}

describe('the score is never named as a probability (§6.5)', () => {
  // The whole backend, not just the DTOs: a name that reaches a response has to be
  // written somewhere first, and the prohibition is stated for every layer.
  // This file is the one exception, and it has to be: the prohibited words are its
  // subject matter, spelled out in `PROHIBITED` and in the stripper's own fixtures.
  // The exclusion is by exact path, so a second file cannot quietly inherit it.
  const files = [
    ...tsFilesUnder(SRC),
    ...tsFilesUnder(join(BACKEND, 'prisma')),
  ].filter((file) => file !== __filename);

  it('scans a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(PROHIBITED)('no code says $why', ({ pattern }) => {
    const offenders = files
      .filter((file) => pattern.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(BACKEND.length + 1).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });

  it('names the score `juniorScore` on the job responses', () => {
    const responses = tsFilesUnder(join(SRC, 'modules', 'jobs', 'dto'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(responses).toContain('juniorScore');
  });

  describe('the comment stripper it depends on', () => {
    it('drops line and block comments', () => {
      expect(stripComments('const a = 1; // probability\n')).not.toMatch(
        /probability/,
      );
      expect(stripComments('/* chance */ const a = 1;')).not.toMatch(/chance/);
    });

    it('keeps string literals, including ones containing a slash pair', () => {
      const kept = stripComments(
        "const url = 'https://example.com'; const key = 'probability';",
      );

      expect(kept).toContain('https://example.com');
      expect(kept).toContain('probability');
    });

    it('does not mistake a comment after a string for part of it', () => {
      expect(stripComments("const a = 'x'; // probability\n")).not.toMatch(
        /probability/,
      );
    });

    it('handles an escaped quote inside a string', () => {
      expect(stripComments("const a = 'it\\'s probability'; //\n")).toContain(
        'probability',
      );
    });
  });
});
