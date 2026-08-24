import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The frontend half of the backend's `score-naming.spec.ts`.
 *
 * `ARCHITECTURE.md` §6.5 forbids `probability`, `chance`, `likelihood` and
 * `success rate` at **every** layer, and this is the layer where the wording
 * actually reaches a person: a template can turn a correctly-named `juniorScore`
 * into a hiring prediction without a single backend file changing. The backend's
 * guard cannot see templates, so the same check runs here over `.ts` and `.html`
 * under `src/`.
 *
 * Comments are stripped, for the reason the backend gives: several files carry a
 * comment explaining that the score is not one of these things, and a check that
 * failed on those would teach the next author to delete the explanation.
 *
 * `.scss` is not scanned. The only way a stylesheet could show wording is a
 * `content:` string, and a rule that scanned CSS would have to tell that apart from
 * class names like `.score-badge`.
 */

/**
 * The repository root, found by walking up from wherever the runner was started.
 *
 * `import.meta.url` is not a `file:` URL under `@angular/build:unit-test` — the
 * specs are served through Vite — so the usual trick does not work here, and
 * hard-coding `process.cwd()` would tie the test to being invoked from
 * `frontend/`.
 *
 * The same eight lines appear in `signal-list/signal-labels.spec.ts`. Sharing them
 * would mean a non-spec file under `src/` that imports `node:fs`, which
 * `tsconfig.app.json` compiles without Node types on purpose — so that a component
 * cannot reach the filesystem. Two copies in two tests is the cheaper of the two.
 */
function repoRoot(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, 'backend')) && existsSync(join(dir, 'frontend'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`Could not locate the repository root from ${process.cwd()}`);
}

const SRC_DIR = join(repoRoot(), 'frontend', 'src');
const APP_DIR = join(SRC_DIR, 'app');

const PROHIBITED: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /probabilit/i, why: 'the score is suitability, never a probability of being hired' },
  { pattern: /chance/i, why: 'the score says nothing about a candidate’s chances' },
  { pattern: /likelihood/i, why: 'the score is not a likelihood of an interview or a reply' },
  { pattern: /success[\s_-]?rate/i, why: 'the score is not an outcome rate' },
];

/**
 * The files whose subject matter *is* the prohibition, so the words have to appear
 * in them. Listed by exact path, as on the backend, so a fourth file cannot quietly
 * inherit the exemption by being named like a test.
 */
const EXEMPT = [
  join(APP_DIR, 'shared', 'score-naming.spec.ts'),
  join(APP_DIR, 'shared', 'junior-score-badge', 'junior-score-badge.spec.ts'),
  join(APP_DIR, 'shared', 'signal-list', 'signal-labels.spec.ts'),
];

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts') || entry.endsWith('.html')) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

/** Line and block comments out, string and template literals kept. */
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
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }

    // A URL's `//` sits inside a string, so a string is consumed whole rather than
    // scanned — otherwise `'https://…'` would blank out the rest of the line.
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      out += char;
      i += 1;
      while (i < source.length && source[i] !== quote) {
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

function strippedSource(file: string): string {
  const source = readFileSync(file, 'utf8');
  return file.endsWith('.html') ? source.replace(/<!--[\s\S]*?-->/g, '') : stripComments(source);
}

describe('the score is never named as a prediction (§6.5)', () => {
  const files = sourceFilesUnder(SRC_DIR).filter((file) => !EXEMPT.includes(file));

  it('scans a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('scans templates, not only TypeScript', () => {
    expect(files.some((file) => file.endsWith('.html'))).toBe(true);
  });

  it.each(PROHIBITED)('no code or template says $why', ({ pattern }) => {
    const offenders = files
      .filter((file) => pattern.test(strippedSource(file)))
      .map((file) => file.slice(SRC_DIR.length + 1).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });

  it('labels the score "Junior Match" in the badge that renders it', () => {
    const badge = readFileSync(
      join(APP_DIR, 'shared', 'junior-score-badge', 'junior-score-badge.html'),
      'utf8',
    );

    expect(badge).toContain('Junior Match');
  });

  describe('the comment stripper it depends on', () => {
    it('drops line and block comments', () => {
      expect(stripComments('const a = 1; // probabilit\n')).not.toMatch(/probabilit/);
      expect(stripComments('/* probabilit */ const a = 1;')).not.toMatch(/probabilit/);
    });

    it('keeps a string containing a slash pair', () => {
      expect(stripComments("const url = 'https://example.com';")).toContain('https://example.com');
    });

    it('does not mistake a comment after a string for part of it', () => {
      expect(stripComments("const a = 'x'; // probabilit\n")).not.toMatch(/probabilit/);
    });
  });
});
