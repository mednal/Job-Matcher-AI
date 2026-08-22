import { foldToAscii } from './ascii-fold';

/**
 * Technology extraction (M6.3, `ARCHITECTURE.md` §6.2, `DATABASE.md` §5/§6).
 *
 * `Job.technologies` is a canonical vocabulary: lowercase dictionary slugs, compared
 * across rows by a GIN containment filter in search and by profile-fit ranking
 * later. Comparison is exact, so the write-time value has to be canonical — there is
 * no read-time normalization that could rescue a raw "Spring Boot" stored as-is.
 *
 * The dictionary is **curated and closed**. Extraction never invents a slug from
 * arbitrary capitalized words: an open extractor produces "We", "Berlin" and "Agile"
 * alongside the real hits, and every one of those becomes a permanent facet value in
 * a vocabulary nothing cleans up. A technology missing from this file simply is not
 * extracted, which is a visible, fixable gap; a junk slug is neither.
 *
 * Phrase matching cannot be reused from `phrase-match.ts` here. That module reduces
 * everything but letters and digits to spaces, which is what makes it robust for
 * prose — and is exactly what would turn `c#`, `c++`, `.net` and `node.js` into `c`,
 * `c`, `net` and `node js`. Boundaries are therefore defined against a symbol class
 * instead, so `java` does not match inside `javascript` while `.net` still matches at
 * a sentence start and not inside `asp.net`.
 *
 * Two languages are deliberately absent. **C** cannot be matched as a bare letter
 * without matching every stray "c" in prose, and **Go** collides with the English
 * verb, so it is only recognized through `golang` and through explicit phrases like
 * "Go developer". Both gaps are worth less than the false positives they prevent.
 *
 * Slug spelling follows the name itself: a single-word product keeps its one word
 * (`nodejs`, `nextjs`, `aspnet`) and only a genuinely multi-word name is hyphenated
 * (`spring-boot`, `react-native`, `github-actions`). `prisma/seed-data.ts` already
 * carries hand-written slugs on the seeded jobs, and the spec pins this dictionary
 * against them: a slug that disagrees would partition the same technology into two
 * facet values that the GIN containment filter can never bring back together.
 */

/**
 * Canonical slug to the spellings that map onto it. Aliases are lowercase; the
 * haystack is folded to lowercase ASCII before matching, so casing in a posting is
 * irrelevant.
 */
const TECHNOLOGY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // Languages
  java: ['java'],
  kotlin: ['kotlin'],
  scala: ['scala'],
  groovy: ['groovy'],
  javascript: ['javascript', 'java script', 'ecmascript'],
  typescript: ['typescript', 'type script'],
  python: ['python'],
  ruby: ['ruby'],
  php: ['php'],
  csharp: ['c#', 'c sharp', 'csharp'],
  cpp: ['c++', 'cpp'],
  golang: ['golang', 'go developer', 'go engineer', 'go programming'],
  rust: ['rust'],
  swift: ['swift'],
  'objective-c': ['objective-c', 'objective c'],
  dart: ['dart'],
  elixir: ['elixir'],
  perl: ['perl'],
  bash: ['bash', 'shell scripting'],
  sql: ['sql'],
  html: ['html', 'html5'],
  css: ['css', 'css3'],

  // Backend frameworks and platforms
  spring: ['spring', 'spring framework'],
  'spring-boot': ['spring boot', 'springboot'],
  hibernate: ['hibernate'],
  'jakarta-ee': ['jakarta ee', 'java ee', 'j2ee'],
  quarkus: ['quarkus'],
  micronaut: ['micronaut'],
  dotnet: ['.net', 'dotnet', 'dot net'],
  aspnet: ['asp.net', 'asp net'],
  'entity-framework': ['entity framework'],
  django: ['django'],
  flask: ['flask'],
  fastapi: ['fastapi', 'fast api'],
  laravel: ['laravel'],
  symfony: ['symfony'],
  rails: ['rails', 'ruby on rails'],
  nodejs: ['node.js', 'nodejs', 'node js'],
  express: ['express.js', 'expressjs', 'express js'],
  nestjs: ['nestjs', 'nest.js'],
  deno: ['deno'],

  // Frontend
  react: ['react', 'react.js', 'reactjs'],
  'react-native': ['react native'],
  angular: ['angular', 'angularjs'],
  vue: ['vue', 'vue.js', 'vuejs'],
  svelte: ['svelte', 'sveltekit'],
  nextjs: ['next.js', 'nextjs'],
  nuxt: ['nuxt', 'nuxt.js'],
  redux: ['redux'],
  rxjs: ['rxjs'],
  jquery: ['jquery'],
  sass: ['sass', 'scss'],
  tailwind: ['tailwind', 'tailwindcss', 'tailwind css'],
  bootstrap: ['bootstrap'],
  webpack: ['webpack'],
  vite: ['vite'],

  // APIs and messaging
  'rest-api': ['rest api', 'rest apis', 'restful'],
  graphql: ['graphql'],
  grpc: ['grpc'],
  kafka: ['kafka', 'apache kafka'],
  rabbitmq: ['rabbitmq'],

  // Data stores
  postgresql: ['postgresql', 'postgres', 'psql'],
  mysql: ['mysql'],
  mariadb: ['mariadb'],
  sqlite: ['sqlite'],
  'sql-server': ['sql server', 'mssql', 't-sql'],
  oracle: ['oracle db', 'oracle database', 'pl/sql', 'plsql'],
  mongodb: ['mongodb', 'mongo'],
  redis: ['redis'],
  elasticsearch: ['elasticsearch', 'elastic search', 'opensearch'],
  prisma: ['prisma'],

  // Infrastructure
  docker: ['docker'],
  kubernetes: ['kubernetes', 'k8s'],
  terraform: ['terraform'],
  ansible: ['ansible'],
  jenkins: ['jenkins'],
  'github-actions': ['github actions'],
  'gitlab-ci': ['gitlab ci'],
  git: ['git'],
  linux: ['linux', 'unix'],
  nginx: ['nginx'],
  aws: ['aws', 'amazon web services'],
  azure: ['azure', 'microsoft azure'],
  gcp: ['gcp', 'google cloud', 'google cloud platform'],

  // Testing
  junit: ['junit'],
  jest: ['jest'],
  cypress: ['cypress'],
  playwright: ['playwright'],
  selenium: ['selenium'],
  pytest: ['pytest'],

  // Data and analytics
  pandas: ['pandas'],
  numpy: ['numpy'],
  tensorflow: ['tensorflow'],
  pytorch: ['pytorch'],
  'scikit-learn': ['scikit-learn', 'scikit learn', 'sklearn'],
  spark: ['apache spark', 'pyspark'],
  hadoop: ['hadoop'],
  'power-bi': ['power bi'],
  tableau: ['tableau'],

  // Tooling
  figma: ['figma'],
  jira: ['jira'],
};

/** Every slug the dictionary can emit, for tests and for future facet listings. */
export const TECHNOLOGY_SLUGS: readonly string[] = Object.freeze(
  Object.keys(TECHNOLOGY_ALIASES).sort(),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Boundary characters. `.` is excluded from the trailing class so that "React." at
 * the end of a sentence still matches, and included in the leading class so that
 * "asp.net" does not also emit `dotnet`.
 */
const LEADING_BOUNDARY = '(?<![a-z0-9+#.])';
const TRAILING_BOUNDARY = '(?![a-z0-9+#])';

/**
 * Aliases are matched longest-first so that a shared prefix cannot shadow a more
 * specific spelling. Each slug gets its own `test()` rather than one alternation,
 * because a posting can legitimately hit several.
 */
const MATCHERS: ReadonlyArray<readonly [string, RegExp]> = Object.entries(
  TECHNOLOGY_ALIASES,
).map(([slug, aliases]) => {
  const alternation = [...aliases]
    .sort((a, b) => b.length - a.length)
    .map((alias) => escapeRegExp(foldToAscii(alias)))
    .join('|');

  return [
    slug,
    new RegExp(`${LEADING_BOUNDARY}(?:${alternation})${TRAILING_BOUNDARY}`),
  ] as const;
});

/**
 * The canonical technology slugs mentioned in a posting, sorted and deduplicated.
 *
 * Sorted because the array is compared and displayed, and an order that depended on
 * where a word happened to appear in a description would make two identical postings
 * look different. Deduplication is inherent: a slug is emitted once however many of
 * its aliases hit.
 */
export function extractTechnologies(
  ...parts: ReadonlyArray<string | null | undefined>
): string[] {
  const haystack = foldToAscii(
    parts.filter((part) => Boolean(part)).join('\n'),
  ).replace(/\s+/g, ' ');

  if (haystack.trim().length === 0) {
    return [];
  }

  return MATCHERS.filter(([, pattern]) => pattern.test(haystack))
    .map(([slug]) => slug)
    .sort();
}
