import { readFileSync } from 'fs';
import { join } from 'path';
import {
  TEXT_SEARCH_CONFIGURATION_SQL,
  textSearchConfiguration,
} from './text-search-configuration';

const MIGRATION = join(
  __dirname,
  '..',
  '..',
  '..',
  'prisma',
  'migrations',
  '20260821190950_add_search_indexes_and_checks',
  'migration.sql',
);

const collapse = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('textSearchConfiguration', () => {
  it('mirrors the CASE expression in the searchVector generated column', () => {
    // migration 20260821190950: 'de' -> german, everything else -> english.
    expect(textSearchConfiguration('de')).toBe('german');
    expect(textSearchConfiguration('en')).toBe('english');
    expect(textSearchConfiguration('fr')).toBe('english');
    expect(textSearchConfiguration('')).toBe('english');
  });

  it('tolerates the padding a char(2) column can hand back', () => {
    expect(textSearchConfiguration('DE')).toBe('german');
    expect(textSearchConfiguration('de ')).toBe('german');
  });

  // §5.1: a language outside {en, de} is stored as detected and indexed with the
  // English configuration. Unstemmed is a degradation; unsearchable is a bug.
  it.each(['nl', 'pl', 'xx'])('falls back to english for %s', (language) => {
    expect(textSearchConfiguration(language)).toBe('english');
  });
});

describe('TEXT_SEARCH_CONFIGURATION_SQL', () => {
  // The point of the whole module: the query side must select the configuration
  // the write side indexed with. This test is the guard, and it is a file read
  // rather than a database query on purpose — the drift it catches is a source
  // edit, and it must fail in a unit run, before anything reaches Postgres.
  it('is the same CASE expression the generated column was written with', () => {
    const migration = collapse(readFileSync(MIGRATION, 'utf8'));

    // The fragment qualifies the column so it can be embedded in a join-free
    // query; the generated column cannot qualify it. That prefix is the only
    // permitted difference.
    const fragment = collapse(TEXT_SEARCH_CONFIGURATION_SQL.sql).replace(
      /"Job"\."language"/g,
      '"language"',
    );

    expect(fragment).toBe(
      `CASE WHEN "language" = 'de' THEN 'german'::regconfig ELSE 'english'::regconfig END`,
    );
    expect(migration).toContain(fragment);
  });

  it('carries no bound parameters, so it can be reused in any position', () => {
    expect(TEXT_SEARCH_CONFIGURATION_SQL.values).toEqual([]);
  });

  it('names the same two configurations the TypeScript mapping returns', () => {
    const sql = TEXT_SEARCH_CONFIGURATION_SQL.sql;

    expect(sql).toContain(`'${textSearchConfiguration('de')}'::regconfig`);
    expect(sql).toContain(`'${textSearchConfiguration('en')}'::regconfig`);
  });
});
