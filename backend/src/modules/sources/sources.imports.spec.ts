import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * The architectural boundaries of §4.2, §6.1 and §7.3, checked mechanically.
 *
 * These are rules a reviewer is supposed to enforce by reading every diff, which is
 * exactly the kind of rule that erodes quietly. A test makes the erosion loud: the
 * suite fails on the commit that breaks the boundary, not months later when someone
 * notices a domain module reaching into `sources/`.
 */

const SRC = join(__dirname, '..', '..');
const MODULES = join(SRC, 'modules');
const SOURCES = join(MODULES, 'sources');
const ADAPTERS = join(SOURCES, 'adapters');

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
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

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

/** Import specifiers only — so a mention inside a comment is not a false failure. */
function importSpecifiers(contents: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of contents.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function relative(file: string): string {
  return file.slice(SRC.length + 1).replace(/\\/g, '/');
}

describe('sources/ architectural boundaries', () => {
  describe('no domain module imports sources/ (§4.2)', () => {
    // `ingestion` is the orchestrator and is *supposed* to depend on `sources`
    // (§4.3). Every other module is on the read side or the pipeline, and the
    // dependency arrow points one way only.
    const DOMAIN_MODULES = [
      'auth',
      'users',
      'profiles',
      'jobs',
      'health',
      'search',
      'saved-jobs',
      'normalization',
      'deduplication',
      'classification',
      'scoring',
    ];

    const present = DOMAIN_MODULES.filter((name) => {
      try {
        return statSync(join(MODULES, name)).isDirectory();
      } catch {
        return false;
      }
    });

    it('has domain modules to check', () => {
      expect(present.length).toBeGreaterThan(0);
    });

    it.each(present)('%s does not import sources/', (name) => {
      const offenders: string[] = [];
      for (const file of tsFilesUnder(join(MODULES, name))) {
        for (const specifier of importSpecifiers(read(file))) {
          if (/(^|\/)sources(\/|$)/.test(specifier)) {
            offenders.push(`${relative(file)} -> ${specifier}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('nothing outside sources/ imports a concrete adapter (§6.1)', () => {
    it('only sources/ names an adapter under adapters/', () => {
      const offenders: string[] = [];
      for (const file of tsFilesUnder(SRC)) {
        if (file.startsWith(SOURCES)) {
          continue;
        }
        for (const specifier of importSpecifiers(read(file))) {
          if (specifier.includes('adapters/')) {
            offenders.push(`${relative(file)} -> ${specifier}`);
          }
        }
      }
      // Adding a source must stay "one directory plus one provider entry"; that is
      // only true while nobody else names the class.
      expect(offenders).toEqual([]);
    });
  });

  describe('no adapter reaches the network directly (§7.3, decision A7)', () => {
    // Every guardrail lives in SourceHttpClient. Importing an HTTP library, or
    // calling global fetch, routes around all of them at once.
    const FORBIDDEN_MODULES = [
      'axios',
      '@nestjs/axios',
      'node-fetch',
      'got',
      'undici',
      'superagent',
      'request',
      'http',
      'https',
      'node:http',
      'node:https',
      'http2',
      'node:http2',
      'net',
      'node:net',
      'tls',
      'node:tls',
    ];

    const adapterFiles = tsFilesUnder(ADAPTERS).filter(
      (file) => !file.endsWith('.spec.ts'),
    );

    it('has adapters to check', () => {
      expect(adapterFiles.length).toBeGreaterThan(0);
    });

    it.each(adapterFiles.map((file) => [relative(file), file]))(
      '%s imports no HTTP library',
      (_label, file) => {
        const found = importSpecifiers(read(file)).filter((specifier) =>
          FORBIDDEN_MODULES.includes(specifier),
        );
        expect(found).toEqual([]);
      },
    );

    it.each(adapterFiles.map((file) => [relative(file), file]))(
      '%s does not call fetch() directly',
      (_label, file) => {
        const withoutComments = read(file)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        // `this.http.fetchJson(...)` is the permitted path; a bare `fetch(` is not.
        expect(withoutComments).not.toMatch(/(?<![.\w])fetch\s*\(/);
      },
    );
  });

  describe('the HTTP client is the only place the network is touched', () => {
    it('no file under sources/ imports an HTTP library', () => {
      const offenders: string[] = [];
      for (const file of tsFilesUnder(SOURCES)) {
        for (const specifier of importSpecifiers(read(file))) {
          if (
            ['axios', '@nestjs/axios', 'node-fetch', 'got', 'undici'].includes(
              specifier,
            )
          ) {
            offenders.push(`${relative(file)} -> ${specifier}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it('is not declared as a dependency in package.json either', () => {
      const pkg = JSON.parse(
        readFileSync(join(SRC, '..', 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, string> };
      const deps = Object.keys(pkg.dependencies ?? {});

      // Decision A7: Node 24 global fetch + AbortSignal.timeout is the whole HTTP
      // stack. A dependency appearing here is the first step of routing around it.
      for (const forbidden of [
        'axios',
        '@nestjs/axios',
        'node-fetch',
        'got',
        'undici',
      ]) {
        expect(deps).not.toContain(forbidden);
      }
    });
  });
});
