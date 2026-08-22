// M2.7 — fixture data for the development seed (docs/MILESTONES.md M2.7).
//
// Purpose: make the API and the frontend developable without running ingestion,
// per docs/ARCHITECTURE.md §12. No live job source is needed until M12.2, so
// everything before it is built against these fixtures and a seeded database.
//
// WHAT THIS FILE IS NOT
//
// It is not a classifier and not a normalizer. Normalization (Phase 6), dedup
// (Phase 7) and classification (Phase 8) are later milestones that own those
// rules. Every canonical value here — `normalizedTitle`, `companySlug`, the
// classification levels, scores and signals — is hand-written to be internally
// consistent, not derived by code that does not exist yet. When Phases 6–8 land,
// these fixtures become the obvious corpus to check that the real logic
// reproduces them; a disagreement is then a finding, not a bug in the seed.
//
// The one formula the seed does apply is D1's dedup hash, in `seed.ts`:
// sha256(companySlug | normalizedTitle | countryCode) — docs/ARCHITECTURE.md §6.3.
//
// COVERAGE (deliberate, so later milestones have something to verify against)
//   - all five JuniorLevel bands
//   - English and German descriptions, so D3's language-aware tsvector (§5.1)
//     is exercised on both configurations
//   - the adversarial case M2.7 requires: a "Junior" title whose body demands
//     5+ years (`vantage-junior-java`) — the posting the product exists to catch
//   - one job listed by two sources, so "also listed on N sources" has data
//   - one inactive job and one merged-away job, so M4.1's redirect and M4.2's
//     exclusion rules are testable
//   - a job with no postedAt, so Job.effectivePostedAt's coalesce is exercised

import type {
  AccessMethod,
  EmploymentType,
  JuniorLevel,
  WorkplaceType,
} from '@prisma/client';

/** A `{ code, weight, evidence }` triple per docs/DATABASE.md §4.1. */
export interface SeedSignal {
  code: string;
  weight: number;
  /** Verbatim excerpt from the description — non-negotiable per §4.1. */
  evidence: string;
}

export interface SeedSource {
  key: string;
  displayName: string;
  accessMethod: AccessMethod;
  termsUrl: string | null;
  attributionText: string;
}

export interface SeedPosting {
  sourceKey: string;
  externalId: string;
  url: string;
}

export interface SeedClassification {
  level: JuniorLevel;
  /** 0–100 suitability for a 0–2 year candidate. Never a hiring probability (§4.2). */
  score: number;
  minYears: number | null;
  maxYears: number | null;
  positiveSignals: SeedSignal[];
  negativeSignals: SeedSignal[];
  summary: string;
}

export interface SeedJob {
  /** Stable fixture key. Used for cross-references and for readable logs. */
  ref: string;
  title: string;
  normalizedTitle: string;
  companyName: string;
  companySlug: string;
  location: string | null;
  countryCode: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: EmploymentType | null;
  /** ISO 639-1. Drives the tsvector configuration (D3). */
  language: 'en' | 'de';
  description: string;
  technologies: string[];
  /** null means the source published no date — exercises effectivePostedAt. */
  postedDaysAgo: number | null;
  isActive: boolean;
  /** `ref` of the job this one was merged into (D2), if any. */
  mergedIntoRef: string | null;
  postings: SeedPosting[];
  classification: SeedClassification;
}

// Two sources, never one: CLAUDE.md forbids hard-coding the application around a
// single job source, and a one-source seed quietly invites exactly that.
//
// COMPLIANCE NOTE: `accessMethod` is a truthful record of how a real source may be
// used (docs/ARCHITECTURE.md §7.1). These two are synthetic development fixtures
// fetched from nowhere, and the enum has no value that says so. The nearest
// plausible value is used, and the display name and attribution say plainly that
// the data is synthetic. Do not read either row as approval of any real source;
// the review register in docs/SOURCES.md is the only place that grants that.
export const SEED_SOURCES: SeedSource[] = [
  {
    // Kept in step with FixtureSourceAdapter's descriptor on purpose. Per decision
    // A3 the adapter's compliance fields are authoritative and are synced into this
    // row on every ingestion run, so a seed that disagreed would leave the row
    // flip-flopping depending on whether `db:seed` or an ingestion ran last.
    key: 'fixture-board',
    displayName: 'Fixture Job Board (development only)',
    accessMethod: 'OFFICIAL_FEED',
    termsUrl: 'https://github.com/mednal/Job-Matcher-AI/blob/main/docs/SOURCES.md',
    attributionText:
      'Synthetic development data. Not a real job source and not a reviewed one.',
  },
  {
    key: 'fixture-feed',
    displayName: 'Fixture Company Feed (development only)',
    accessMethod: 'OFFICIAL_FEED',
    termsUrl: null,
    attributionText:
      'Synthetic development data. Not a real job source and not a reviewed one.',
  },
];

export const DEMO_USER = {
  email: 'demo@juniorjob.local',
  password: 'DemoPassword123!',
  displayName: 'Demo Junior',
  yearsOfExperience: 1,
  desiredRoles: ['Junior Backend Developer', 'Graduate Software Engineer'],
  technologies: ['java', 'spring-boot', 'postgresql', 'typescript'],
  locations: ['Berlin', 'Remote'],
  countryCodes: ['DE', 'IE'],
  workplaceTypes: ['REMOTE', 'HYBRID'] as WorkplaceType[],
};

// M3.5's RolesGuard protects the admin-only ingestion trigger (D4). Without an
// ADMIN row that guard cannot be exercised locally, so the seed provides one.
// There is still no admin UI and no role-management endpoint in the MVP.
export const DEMO_ADMIN = {
  email: 'admin@juniorjob.local',
  password: 'AdminPassword123!',
};

/**
 * Refs of the jobs the demo user has saved. `brightwater-graduate-dev` is the
 * merged-away job on purpose: a save must survive a merge via the redirect (D2).
 */
export const DEMO_SAVED_JOB_REFS = [
  'aurelia-junior-backend',
  'brightwater-graduate-dev',
];

export const SEED_JOBS: SeedJob[] = [
  {
    ref: 'aurelia-junior-backend',
    title: 'Junior Backend Developer (Java)',
    normalizedTitle: 'backend developer java',
    companyName: 'Aurelia Systems Ltd',
    companySlug: 'aurelia-systems',
    location: 'Dublin',
    countryCode: 'IE',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'en',
    description: [
      'Aurelia Systems is hiring a Junior Backend Developer to join our payments platform team.',
      '',
      'This is an entry level position. No professional experience is required and recent graduates are welcome to apply. Training provided over a structured six-month onboarding programme, with a dedicated mentor from day one.',
      '',
      'What you will do: build and maintain REST services in Java and Spring Boot, write tests, and work with PostgreSQL alongside senior engineers who review every change.',
      '',
      'What we ask: a solid grasp of object-oriented programming, curiosity, and a willingness to learn. 0-1 years of commercial experience is exactly what we expect.',
    ].join('\n'),
    technologies: ['java', 'spring-boot', 'postgresql'],
    postedDaysAgo: 3,
    isActive: true,
    mergedIntoRef: null,
    // The one job carried by both sources — gives the job detail page its
    // "also listed on 2 sources" case without waiting for ingestion.
    postings: [
      {
        sourceKey: 'fixture-board',
        externalId: 'fb-1001',
        url: 'https://fixtures.juniorjob.local/board/1001',
      },
      {
        sourceKey: 'fixture-feed',
        externalId: 'ff-2001',
        url: 'https://fixtures.juniorjob.local/feed/2001',
      },
    ],
    classification: {
      level: 'ENTRY_LEVEL',
      score: 94,
      minYears: 0,
      maxYears: 1,
      positiveSignals: [
        {
          code: 'ENTRY_LEVEL_STATED',
          weight: 30,
          evidence: 'This is an entry level position.',
        },
        {
          code: 'NO_EXPERIENCE_REQUIRED',
          weight: 25,
          evidence: 'No professional experience is required',
        },
        {
          code: 'GRADUATES_WELCOME',
          weight: 20,
          evidence: 'recent graduates are welcome to apply',
        },
        {
          code: 'TRAINING_PROVIDED',
          weight: 15,
          evidence:
            'Training provided over a structured six-month onboarding programme',
        },
        {
          code: 'ZERO_TO_ONE_YEARS',
          weight: 20,
          evidence: '0-1 years of commercial experience',
        },
      ],
      negativeSignals: [],
      summary:
        'States entry level explicitly, requires no professional experience, welcomes graduates and provides training. Nothing in the body contradicts the title.',
    },
  },
  {
    ref: 'nordlicht-junior-entwickler',
    title: 'Junior Softwareentwickler (m/w/d)',
    normalizedTitle: 'softwareentwickler',
    companyName: 'Nordlicht Software GmbH',
    companySlug: 'nordlicht-software',
    location: 'Berlin',
    countryCode: 'DE',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'de',
    description: [
      'Nordlicht Software sucht einen Junior Softwareentwickler (m/w/d) für unser Produktteam in Berlin.',
      '',
      'Berufseinsteiger sind ausdrücklich willkommen. Keine Berufserfahrung erforderlich – wir erwarten 0-1 Jahre Erfahrung und bieten eine strukturierte Einarbeitung mit festem Mentor.',
      '',
      'Deine Aufgaben: Du entwickelst Funktionen in TypeScript mit Angular und Node.js, schreibst Tests und arbeitest eng mit erfahrenen Entwicklerinnen und Entwicklern zusammen.',
      '',
      'Was wir erwarten: Grundkenntnisse in JavaScript oder TypeScript, Neugier und Lernbereitschaft. Ein abgeschlossenes Studium ist nicht zwingend erforderlich.',
    ].join('\n'),
    technologies: ['typescript', 'angular', 'nodejs'],
    postedDaysAgo: 5,
    isActive: true,
    mergedIntoRef: null,
    postings: [
      {
        sourceKey: 'fixture-board',
        externalId: 'fb-1002',
        url: 'https://fixtures.juniorjob.local/board/1002',
      },
    ],
    classification: {
      level: 'ENTRY_LEVEL',
      score: 91,
      minYears: 0,
      maxYears: 1,
      positiveSignals: [
        {
          code: 'CAREER_STARTER_WELCOME',
          weight: 30,
          evidence: 'Berufseinsteiger sind ausdrücklich willkommen.',
        },
        {
          code: 'NO_EXPERIENCE_REQUIRED',
          weight: 25,
          evidence: 'Keine Berufserfahrung erforderlich',
        },
        {
          code: 'ZERO_TO_ONE_YEARS',
          weight: 20,
          evidence: 'wir erwarten 0-1 Jahre Erfahrung',
        },
        {
          code: 'TRAINING_PROVIDED',
          weight: 15,
          evidence: 'bieten eine strukturierte Einarbeitung mit festem Mentor',
        },
      ],
      negativeSignals: [],
      summary:
        'Richtet sich ausdrücklich an Berufseinsteiger, verlangt keine Berufserfahrung und bietet eine strukturierte Einarbeitung.',
    },
  },
  {
    ref: 'brightwater-graduate-engineer',
    title: 'Graduate Software Engineer',
    normalizedTitle: 'graduate software engineer',
    companyName: 'Brightwater Labs Ltd',
    companySlug: 'brightwater-labs',
    location: 'Manchester',
    countryCode: 'GB',
    workplaceType: 'ONSITE',
    employmentType: 'FULL_TIME',
    language: 'en',
    description: [
      'Brightwater Labs runs a graduate engineering programme and we are opening it for the next intake.',
      '',
      'We are looking for engineers with 0-2 years of experience. You will be paired with a mentor for your first year and rotate through two product teams.',
      '',
      'Our stack is Python and PostgreSQL with a React front end. You do not need to know all of it; you do need to be comfortable reading code you did not write.',
      '',
      'Some exposure to production systems, from an internship or a placement year, is useful but not required.',
    ].join('\n'),
    technologies: ['python', 'postgresql', 'react'],
    postedDaysAgo: 9,
    isActive: true,
    mergedIntoRef: null,
    postings: [
      {
        sourceKey: 'fixture-board',
        externalId: 'fb-1003',
        url: 'https://fixtures.juniorjob.local/board/1003',
      },
    ],
    classification: {
      level: 'LIKELY_ENTRY_LEVEL',
      score: 79,
      minYears: 0,
      maxYears: 2,
      positiveSignals: [
        {
          code: 'ZERO_TO_TWO_YEARS',
          weight: 30,
          evidence: 'engineers with 0-2 years of experience',
        },
        {
          code: 'GRADUATE_PROGRAMME',
          weight: 20,
          evidence: 'Brightwater Labs runs a graduate engineering programme',
        },
        {
          code: 'MENTORING_OFFERED',
          weight: 15,
          evidence: 'You will be paired with a mentor for your first year',
        },
      ],
      negativeSignals: [
        {
          code: 'PRODUCTION_EXPOSURE_PREFERRED',
          weight: -5,
          evidence:
            'Some exposure to production systems, from an internship or a placement year, is useful but not required.',
        },
      ],
      summary:
        'A graduate programme capped at two years of experience, with mentoring. A mild preference for prior production exposure keeps it just short of unambiguous entry level.',
    },
  },
  {
    ref: 'kranich-junior-data',
    title: 'Junior Data Engineer (m/w/d)',
    normalizedTitle: 'data engineer',
    companyName: 'Kranich Digital AG',
    companySlug: 'kranich-digital',
    location: 'München',
    countryCode: 'DE',
    workplaceType: 'REMOTE',
    employmentType: 'FULL_TIME',
    language: 'de',
    description: [
      'Für unser Datenteam suchen wir einen Junior Data Engineer (m/w/d), remote innerhalb Deutschlands.',
      '',
      'Du bringst idealerweise 1-2 Jahre Erfahrung mit Python und SQL mit, gerne auch aus Praktika oder einer Werkstudententätigkeit. Ein Quereinstieg ist möglich.',
      '',
      'Aufgaben: Du baust Datenpipelines, überwachst deren Qualität und arbeitest mit unserem PostgreSQL-Warehouse.',
      '',
      'Wir bieten regelmäßige Schulungen und ein Weiterbildungsbudget.',
    ].join('\n'),
    technologies: ['python', 'sql', 'postgresql'],
    postedDaysAgo: 12,
    isActive: true,
    mergedIntoRef: null,
    postings: [
      {
        sourceKey: 'fixture-feed',
        externalId: 'ff-2002',
        url: 'https://fixtures.juniorjob.local/feed/2002',
      },
    ],
    classification: {
      level: 'LIKELY_ENTRY_LEVEL',
      score: 72,
      minYears: 1,
      maxYears: 2,
      positiveSignals: [
        {
          code: 'ONE_TO_TWO_YEARS',
          weight: 25,
          evidence:
            'Du bringst idealerweise 1-2 Jahre Erfahrung mit Python und SQL mit',
        },
        {
          code: 'INTERNSHIP_COUNTS',
          weight: 15,
          evidence: 'gerne auch aus Praktika oder einer Werkstudententätigkeit',
        },
        {
          code: 'TRAINING_PROVIDED',
          weight: 10,
          evidence:
            'Wir bieten regelmäßige Schulungen und ein Weiterbildungsbudget.',
        },
      ],
      negativeSignals: [],
      summary:
        'Verlangt ein bis zwei Jahre Erfahrung, lässt Praktika ausdrücklich gelten und bietet Weiterbildung. Für Berufseinsteiger mit erster Praxis gut geeignet.',
    },
  },
  {
    ref: 'halcyon-software-engineer',
    title: 'Software Engineer',
    normalizedTitle: 'software engineer',
    companyName: 'Halcyon Retail BV',
    companySlug: 'halcyon-retail',
    location: 'Amsterdam',
    countryCode: 'NL',
    workplaceType: 'REMOTE',
    employmentType: 'FULL_TIME',
    language: 'en',
    description: [
      'Halcyon Retail is growing its checkout team and is hiring a Software Engineer.',
      '',
      'You will own features end to end, from design through to production, and share an on-call rotation with the rest of the team.',
      '',
      'We work in TypeScript and Node.js on AWS. We care more about how you reason about a problem than about the number of years on your CV.',
      '',
      'The role is fully remote within the EU.',
    ].join('\n'),
    technologies: ['typescript', 'nodejs', 'aws'],
    // No postedAt from this source: exercises Job.effectivePostedAt's coalesce
    // onto firstSeenAt, which is what keeps sorting and pagination stable.
    postedDaysAgo: null,
    isActive: true,
    mergedIntoRef: null,
    postings: [
      {
        sourceKey: 'fixture-feed',
        externalId: 'ff-2003',
        url: 'https://fixtures.juniorjob.local/feed/2003',
      },
    ],
    classification: {
      level: 'AMBIGUOUS',
      score: 48,
      minYears: null,
      maxYears: null,
      positiveSignals: [
        {
          code: 'YEARS_NOT_REQUIRED',
          weight: 15,
          evidence:
            'We care more about how you reason about a problem than about the number of years on your CV.',
        },
      ],
      negativeSignals: [
        {
          code: 'END_TO_END_OWNERSHIP',
          weight: -15,
          evidence:
            'You will own features end to end, from design through to production',
        },
        {
          code: 'ON_CALL_EXPECTED',
          weight: -10,
          evidence: 'share an on-call rotation with the rest of the team',
        },
      ],
      summary:
        'States no experience requirement either way. End-to-end ownership and on-call duty suggest an established engineer, but nothing rules a junior out. Read the posting before applying.',
    },
  },
  {
    // THE ADVERSARIAL CASE M2.7 REQUIRES, and the reason this product exists:
    // the title says Junior, the body demands five years and team leadership.
    // Title-only classification would rank this at the top of a junior search.
    ref: 'vantage-junior-java',
    title: 'Junior Java Developer',
    normalizedTitle: 'java developer',
    companyName: 'Vantage Payments Ltd',
    companySlug: 'vantage-payments',
    location: 'London',
    countryCode: 'GB',
    workplaceType: 'ONSITE',
    employmentType: 'FULL_TIME',
    language: 'en',
    description: [
      'Vantage Payments is looking for a Junior Java Developer to join our core banking group.',
      '',
      'Requirements: 5+ years of professional experience with Java and Spring Boot in a regulated environment, and extensive production experience with high-volume transaction systems.',
      '',
      'You will lead a small team of three engineers, own the delivery roadmap for your service, and act as the technical point of contact for two external partners.',
      '',
      'Candidates without commercial experience will not be considered.',
    ].join('\n'),
    technologies: ['java', 'spring-boot', 'kafka'],
    postedDaysAgo: 6,
    isActive: true,
    mergedIntoRef: null,
    postings: [
      {
        sourceKey: 'fixture-board',
        externalId: 'fb-1004',
        url: 'https://fixtures.juniorjob.local/board/1004',
      },
    ],
    classification: {
      level: 'CLEARLY_EXPERIENCED',
      score: 6,
      minYears: 5,
      maxYears: null,
      positiveSignals: [],
      negativeSignals: [
        {
          code: 'REQUIRES_5_PLUS_YEARS',
          weight: -40,
          evidence:
            '5+ years of professional experience with Java and Spring Boot',
        },
        {
          code: 'EXTENSIVE_PROFESSIONAL_EXPERIENCE',
          weight: -20,
          evidence:
            'extensive production experience with high-volume transaction systems',
        },
        {
          code: 'TEAM_LEAD',
          weight: -25,
          evidence: 'You will lead a small team of three engineers',
        },
        {
          code: 'NO_EXPERIENCE_EXCLUDED',
          weight: -20,
          evidence:
            'Candidates without commercial experience will not be considered.',
        },
      ],
      summary:
        'Titled Junior, but the body requires five or more years, extensive production experience and leading a team of three. Not suitable for an entry-level candidate despite the title.',
    },
  },
  {
    ref: 'stahlwerk-backend',
    title: 'Softwareentwickler (m/w/d) Backend',
    normalizedTitle: 'softwareentwickler backend',
    companyName: 'Stahlwerk Digital GmbH',
    companySlug: 'stahlwerk-digital',
    location: 'Hamburg',
    countryCode: 'DE',
    workplaceType: 'ONSITE',
    employmentType: 'FULL_TIME',
    language: 'de',
    description: [
      'Zur Verstärkung unseres Backend-Teams suchen wir einen Softwareentwickler (m/w/d) in Hamburg.',
      '',
      'Voraussetzung sind mindestens 3 Jahre Berufserfahrung in der Entwicklung mit Java und Spring, idealerweise im industriellen Umfeld.',
      '',
      'Du übernimmst Verantwortung für bestehende Services, betreust deren Weiterentwicklung und begleitest den Betrieb.',
      '',
      'Erfahrung mit Docker und Kubernetes ist von Vorteil.',
    ].join('\n'),
    technologies: ['java', 'spring-boot', 'docker', 'kubernetes'],
    postedDaysAgo: 15,
    isActive: true,
    mergedIntoRef: null,
    postings: [
      {
        sourceKey: 'fixture-board',
        externalId: 'fb-1005',
        url: 'https://fixtures.juniorjob.local/board/1005',
      },
    ],
    classification: {
      level: 'EXPERIENCED',
      score: 21,
      minYears: 3,
      maxYears: null,
      positiveSignals: [],
      negativeSignals: [
        {
          code: 'REQUIRES_3_PLUS_YEARS',
          weight: -35,
          evidence: 'Voraussetzung sind mindestens 3 Jahre Berufserfahrung',
        },
        {
          code: 'OWNERSHIP_OF_EXISTING_SERVICES',
          weight: -15,
          evidence: 'Du übernimmst Verantwortung für bestehende Services',
        },
      ],
      summary:
        'Verlangt mindestens drei Jahre Berufserfahrung und Verantwortung für bestehende Services. Keine Leitungsaufgaben, für Berufseinsteiger aber nicht geeignet.',
    },
  },
  {
    ref: 'cobalt-lead-platform',
    title: 'Lead Platform Engineer',
    normalizedTitle: 'platform engineer',
    companyName: 'Cobalt Grid Ltd',
    companySlug: 'cobalt-grid',
    location: 'Dublin',
    countryCode: 'IE',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'en',
    description: [
      'Cobalt Grid is hiring a Lead Platform Engineer to head our infrastructure function.',
      '',
      'We require 8+ years of professional experience running Kubernetes in production, and prior experience with team management of at least four engineers.',
      '',
      'You will set the technical direction for the platform, own the budget for our cloud spend, and line-manage the platform team.',
    ].join('\n'),
    technologies: ['kubernetes', 'terraform', 'aws'],
    postedDaysAgo: 20,
    isActive: true,
    mergedIntoRef: null,
    postings: [
      {
        sourceKey: 'fixture-feed',
        externalId: 'ff-2004',
        url: 'https://fixtures.juniorjob.local/feed/2004',
      },
    ],
    classification: {
      level: 'CLEARLY_EXPERIENCED',
      score: 2,
      minYears: 8,
      maxYears: null,
      positiveSignals: [],
      negativeSignals: [
        {
          code: 'REQUIRES_5_PLUS_YEARS',
          weight: -40,
          evidence:
            'We require 8+ years of professional experience running Kubernetes in production',
        },
        {
          code: 'TEAM_MANAGEMENT',
          weight: -30,
          evidence:
            'prior experience with team management of at least four engineers',
        },
        {
          code: 'LEAD_RESPONSIBILITIES',
          weight: -25,
          evidence: 'You will set the technical direction for the platform',
        },
      ],
      summary:
        'A leadership role requiring eight or more years and prior people management. Included so the far end of the scale has data.',
    },
  },
  {
    // Inactive: M4.2 must exclude it from the job list, and §8's lifecycle rule
    // is that a stale job is deactivated, never deleted.
    ref: 'aurelia-junior-qa',
    title: 'Junior QA Engineer',
    normalizedTitle: 'qa engineer',
    companyName: 'Aurelia Systems Ltd',
    companySlug: 'aurelia-systems',
    location: 'Dublin',
    countryCode: 'IE',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'en',
    description: [
      'Aurelia Systems is hiring a Junior QA Engineer for our platform quality team.',
      '',
      'This is an entry level role. No experience required beyond a genuine interest in software testing; training provided in both manual and automated testing.',
      '',
      'This posting has since been filled. It is retained so that deactivated jobs have coverage in development.',
    ].join('\n'),
    technologies: ['playwright', 'typescript'],
    postedDaysAgo: 70,
    isActive: false,
    mergedIntoRef: null,
    postings: [
      {
        sourceKey: 'fixture-board',
        externalId: 'fb-1006',
        url: 'https://fixtures.juniorjob.local/board/1006',
      },
    ],
    classification: {
      level: 'ENTRY_LEVEL',
      score: 88,
      minYears: 0,
      maxYears: 1,
      positiveSignals: [
        {
          code: 'ENTRY_LEVEL_STATED',
          weight: 30,
          evidence: 'This is an entry level role.',
        },
        {
          code: 'NO_EXPERIENCE_REQUIRED',
          weight: 25,
          evidence:
            'No experience required beyond a genuine interest in software testing',
        },
        {
          code: 'TRAINING_PROVIDED',
          weight: 15,
          evidence: 'training provided in both manual and automated testing',
        },
      ],
      negativeSignals: [],
      summary:
        'Entry level and explicitly requires no experience. Deactivated because the posting was filled.',
    },
  },
  {
    // Merged away into brightwater-graduate-engineer (D2). Dedup is biased
    // toward false splits, so merges are expected; the tombstone keeps the demo
    // user's SavedJob row resolvable through the redirect. M4.1 must redirect
    // rather than return this row; M4.2 must exclude it from the list.
    ref: 'brightwater-graduate-dev',
    title: 'Graduate Software Developer',
    normalizedTitle: 'graduate software developer',
    companyName: 'Brightwater Labs Ltd',
    companySlug: 'brightwater-labs',
    location: 'Manchester',
    countryCode: 'GB',
    workplaceType: 'ONSITE',
    employmentType: 'FULL_TIME',
    language: 'en',
    description: [
      'Brightwater Labs graduate programme - next intake now open.',
      '',
      'We are hiring engineers with 0-2 years of experience. Mentoring is provided throughout the first year, and you will rotate through two product teams.',
      '',
      'Python, PostgreSQL and React. This is the same programme as our Graduate Software Engineer listing, posted under a slightly different title - which is exactly the near-duplicate deduplication has to catch.',
    ].join('\n'),
    technologies: ['python', 'postgresql', 'react'],
    postedDaysAgo: 10,
    isActive: true,
    mergedIntoRef: 'brightwater-graduate-engineer',
    postings: [
      {
        sourceKey: 'fixture-feed',
        externalId: 'ff-2005',
        url: 'https://fixtures.juniorjob.local/feed/2005',
      },
    ],
    classification: {
      level: 'LIKELY_ENTRY_LEVEL',
      score: 77,
      minYears: 0,
      maxYears: 2,
      positiveSignals: [
        {
          code: 'ZERO_TO_TWO_YEARS',
          weight: 30,
          evidence: 'We are hiring engineers with 0-2 years of experience.',
        },
        {
          code: 'GRADUATE_PROGRAMME',
          weight: 20,
          evidence: 'Brightwater Labs graduate programme',
        },
        {
          code: 'MENTORING_OFFERED',
          weight: 15,
          evidence: 'Mentoring is provided throughout the first year',
        },
      ],
      negativeSignals: [],
      summary:
        'The same graduate programme as the Graduate Software Engineer listing, under a different title. Merged into that job.',
    },
  },
];
