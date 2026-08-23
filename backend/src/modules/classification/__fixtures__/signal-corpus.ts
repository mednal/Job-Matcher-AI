import type { SignalCode } from '../signal';

/**
 * The signal-extraction fixture corpus (M8.2).
 *
 * The milestone's `Verify:` line is "unit tests assert the excerpt is present and
 * unmodified", and that is asserted for every case here — but a corpus that only
 * proved excerpts were verbatim would pass with an extractor that found nothing, so
 * each case also pins the exact set of codes it should produce.
 *
 * `positive` and `negative` are **complete** sets, not subsets: a case listing
 * `['TRAINING_PROVIDED']` asserts that nothing else fired either. That is what makes
 * the false-positive cases below worth anything — most of them are a plausible
 * sentence with an empty expectation.
 *
 * Cases run against `extractSignals`, so the numeric codes are included where a case
 * carries a figure; the corpus text is what a normalized description looks like by
 * the time the classifier sees it (M6.1 has already flattened the markup).
 */
export interface SignalCase {
  readonly name: string;
  readonly language: 'en' | 'de';
  readonly text: string;
  readonly positive: readonly SignalCode[];
  readonly negative: readonly SignalCode[];
  /** Exact excerpts, by code, where the excerpt itself is the point of the case. */
  readonly evidence?: Partial<Record<SignalCode, string>>;
}

export const SIGNAL_CORPUS: readonly SignalCase[] = [
  // --- Positive phrases, the five families CLAUDE.md names ---------------------
  {
    name: 'en: entry level stated outright',
    language: 'en',
    text: 'About the role. This is an entry level position on our payments team. You will ship your first change in week one.',
    positive: ['ENTRY_LEVEL_STATED'],
    negative: [],
    evidence: {
      ENTRY_LEVEL_STATED:
        'This is an entry level position on our payments team.',
    },
  },
  {
    name: 'en: hyphenated spelling of the same phrase',
    language: 'en',
    text: 'We are hiring for an entry-level role in platform engineering.',
    positive: ['ENTRY_LEVEL_STATED'],
    negative: [],
  },
  {
    name: 'en: no experience required, with words inside the phrase',
    language: 'en',
    text: 'No professional experience is required. We will teach you the rest.',
    positive: ['NO_EXPERIENCE_REQUIRED'],
    negative: [],
    evidence: {
      NO_EXPERIENCE_REQUIRED: 'No professional experience is required.',
    },
  },
  {
    name: 'en: recent graduates welcome',
    language: 'en',
    text: 'Recent graduates are welcome to apply, as are people changing career.',
    positive: ['GRADUATES_WELCOME'],
    negative: [],
  },
  {
    name: 'en: training provided',
    language: 'en',
    text: 'Training provided over a structured six-month onboarding programme.',
    positive: ['TRAINING_PROVIDED'],
    negative: [],
  },
  {
    name: 'de: Berufseinsteiger',
    language: 'de',
    text: 'Berufseinsteigerinnen sind bei uns ausdrücklich willkommen.',
    positive: ['CAREER_STARTER_WELCOME'],
    negative: [],
    evidence: {
      CAREER_STARTER_WELCOME:
        'Berufseinsteigerinnen sind bei uns ausdrücklich willkommen.',
    },
  },
  {
    name: 'de: keine Berufserfahrung erforderlich',
    language: 'de',
    text: 'Keine Berufserfahrung erforderlich. Wir bieten eine strukturierte Einarbeitung.',
    positive: ['NO_EXPERIENCE_REQUIRED', 'TRAINING_PROVIDED'],
    negative: [],
    evidence: { NO_EXPERIENCE_REQUIRED: 'Keine Berufserfahrung erforderlich.' },
  },
  {
    name: 'de: umlaut written as a plain vowel by a broken encoding',
    language: 'de',
    text: 'Fuer Berufsanfaenger geeignet: wir schulen dich in allen Bereichen.',
    positive: ['CAREER_STARTER_WELCOME', 'TRAINING_PROVIDED'],
    negative: [],
  },
  {
    name: 'de: Absolventen inside a compound',
    language: 'de',
    text: 'Wir suchen Hochschulabsolventen für unser Traineeprogramm.',
    positive: ['GRADUATES_WELCOME', 'GRADUATE_PROGRAMME'],
    negative: [],
  },
  {
    name: 'de: German posting stating the English phrase',
    language: 'de',
    text: 'Diese Stelle ist eine entry level position in unserem Team in Berlin.',
    positive: ['ENTRY_LEVEL_STATED'],
    negative: [],
  },

  // --- Negative phrases --------------------------------------------------------
  {
    name: 'en: leading a team',
    language: 'en',
    text: 'You will lead a small team of three engineers and set the technical direction for the platform.',
    positive: [],
    negative: ['TEAM_LEAD', 'LEAD_RESPONSIBILITIES'],
    evidence: {
      TEAM_LEAD:
        'You will lead a small team of three engineers and set the technical direction for the platform.',
    },
  },
  {
    name: 'en: team management',
    language: 'en',
    text: 'We expect prior experience with team management of at least four engineers.',
    positive: [],
    negative: ['TEAM_MANAGEMENT'],
  },
  {
    name: 'en: extensive production experience',
    language: 'en',
    text: 'You bring extensive production experience with high-volume transaction systems.',
    positive: [],
    negative: ['EXTENSIVE_PROFESSIONAL_EXPERIENCE'],
  },
  {
    name: 'de: mehrjährige Berufserfahrung',
    language: 'de',
    text: 'Sie verfügen über mehrjährige Berufserfahrung in der Softwareentwicklung.',
    positive: [],
    negative: ['EXTENSIVE_PROFESSIONAL_EXPERIENCE'],
    evidence: {
      EXTENSIVE_PROFESSIONAL_EXPERIENCE:
        'Sie verfügen über mehrjährige Berufserfahrung in der Softwareentwicklung.',
    },
  },
  {
    name: 'en: candidates without experience are excluded',
    language: 'en',
    text: 'Candidates without commercial experience will not be considered.',
    positive: [],
    negative: ['NO_EXPERIENCE_EXCLUDED'],
  },
  {
    name: 'en: stated to be a senior role',
    language: 'en',
    text: 'This is a senior position and we expect you to hit the ground running.',
    positive: [],
    negative: ['SENIOR_RESPONSIBILITIES'],
  },

  // --- The precedence case the product exists for ------------------------------
  {
    name: 'en: junior wording in one paragraph, five years in another',
    language: 'en',
    text: 'We welcome applications from people with 0-2 years of experience.\nIn practice you will need 5+ years of professional experience with Java, and you will lead a small team.',
    positive: [],
    negative: ['REQUIRES_5_PLUS_YEARS', 'TEAM_LEAD'],
    evidence: {
      REQUIRES_5_PLUS_YEARS: '5+ years of professional experience',
    },
  },

  // --- Negation ----------------------------------------------------------------
  {
    name: 'en: negated positive phrase does not fire',
    language: 'en',
    text: 'This is not an entry level role; we are hiring for our platform team.',
    positive: [],
    negative: [],
  },
  {
    name: 'de: negated negative phrase does not fire',
    language: 'de',
    text: 'Keine mehrjährige Berufserfahrung nötig, Neugier reicht uns.',
    positive: [],
    negative: [],
  },
  {
    name: 'en: no on-call is not on-call',
    language: 'en',
    text: 'We have no on-call rotation and no pager duty.',
    positive: [],
    negative: [],
  },

  // --- False positives the dictionary has to refuse ----------------------------
  {
    name: 'en: learning from senior engineers is not a senior role',
    language: 'en',
    text: 'You will learn from senior engineers who review every change you make.',
    positive: [],
    negative: [],
  },
  {
    name: 'en: being mentored is not mentoring juniors',
    language: 'en',
    text: 'You will be mentored by an experienced engineer for your first year.',
    positive: ['MENTORING_OFFERED'],
    negative: [],
  },
  {
    name: 'en: mentoring juniors is a lead responsibility, not an offer',
    language: 'en',
    text: 'You will mentor junior developers and review their pull requests.',
    positive: [],
    negative: ['LEAD_RESPONSIBILITIES'],
  },
  {
    name: 'en: a phrase does not reach across a paragraph break',
    language: 'en',
    text: 'We work in a small team.\nLead engineers run the architecture guild.',
    positive: [],
    negative: [],
  },
  {
    name: 'en: an empty posting states nothing',
    language: 'en',
    text: 'We build payments infrastructure for European marketplaces.',
    positive: [],
    negative: [],
  },

  // --- Repetition --------------------------------------------------------------
  {
    name: 'en: a claim repeated three times is still one signal',
    language: 'en',
    text: 'Training provided from day one. We provide training in every quarter. On the job training is part of the role.',
    positive: ['TRAINING_PROVIDED'],
    negative: [],
    evidence: { TRAINING_PROVIDED: 'Training provided from day one.' },
  },
];
