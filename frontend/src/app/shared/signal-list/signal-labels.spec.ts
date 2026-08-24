import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KNOWN_SIGNAL_CODES, signalLabel } from './signal-labels';

/**
 * The signal vocabulary lives on the backend, and this table words it. Two copies
 * of a list in one repository drift, so the drift is checked rather than trusted:
 * the backend's own `SIGNAL_WEIGHTS` is read and compared against the keys here.
 *
 * A missing wording is not a crash — `signalLabel` falls back — but it puts
 * `REQUIRES_3_PLUS_YEARS` in front of a user, so it is a failure here. Both
 * directions are checked: a code the backend has retired should not keep sitting in
 * this file pretending to be part of the contract.
 *
 * Reading across the two projects is deliberate. They are separate npm packages and
 * never build together, so a type import is not available; the file is, and it is in
 * the same repository. The backend's own migration-drift test is the precedent.
 */

/** See the note on the copy of this in `shared/score-naming.spec.ts`. */
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

const BACKEND_SIGNAL_FILE = join(
  repoRoot(),
  'backend',
  'src',
  'modules',
  'classification',
  'signal.ts',
);

function backendSignalCodes(): string[] {
  const source = readFileSync(BACKEND_SIGNAL_FILE, 'utf8');
  const table = /export const SIGNAL_WEIGHTS = \{([\s\S]*?)\n\} as const;/.exec(source);
  if (!table) {
    throw new Error(`Could not find SIGNAL_WEIGHTS in ${BACKEND_SIGNAL_FILE}`);
  }

  const codes: string[] = [];
  const entry = /^ {2}([A-Z][A-Z0-9_]*):\s*-?\d+,/gm;
  let match = entry.exec(table[1]);
  while (match !== null) {
    codes.push(match[1]);
    match = entry.exec(table[1]);
  }
  return codes;
}

describe('signal labels', () => {
  const codes = backendSignalCodes();

  it('reads a plausible number of codes from the backend', () => {
    expect(codes.length).toBeGreaterThan(20);
  });

  it('words every code the classifier can emit', () => {
    expect(codes.filter((code) => !KNOWN_SIGNAL_CODES.includes(code))).toEqual([]);
  });

  it('words no code the classifier no longer emits', () => {
    expect(KNOWN_SIGNAL_CODES.filter((code) => !codes.includes(code))).toEqual([]);
  });

  it('never describes a signal as an effect on the reader’s prospects', () => {
    const wording = codes.map((code) => signalLabel(code)).join(' ');

    expect(wording).not.toMatch(/probabilit|chance|likelihood|you (are|will)/i);
  });

  describe('the fallback for an unknown code', () => {
    it('reads as a sentence rather than as an identifier', () => {
      expect(signalLabel('SOME_FUTURE_SIGNAL')).toBe('Some future signal');
    });

    it('keeps a code it cannot split at all', () => {
      expect(signalLabel('_')).toBe('_');
    });
  });
});
