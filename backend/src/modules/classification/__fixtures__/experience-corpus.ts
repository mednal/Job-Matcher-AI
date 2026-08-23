/**
 * The experience-extraction fixture corpus (M8.1).
 *
 * The milestone's `Verify:` line is this file: a corpus with expected year bounds.
 * It is kept beside the seeded-job pins rather than replacing them — the seeds cover
 * what the product's own fixtures look like, and these cover the phrasings a real
 * board throws at the extractor, including the ones that must produce *nothing*.
 *
 * `evidence` is the exact list of verbatim excerpts the extractor should return, in
 * document order. Cases that only pin the bounds leave it out.
 */
export interface ExperienceCase {
  readonly name: string;
  readonly language: 'en' | 'de';
  readonly text: string;
  readonly minYears: number | null;
  readonly maxYears: number | null;
  readonly evidence?: readonly string[];
}

export const EXPERIENCE_CORPUS: readonly ExperienceCase[] = [
  {
    name: 'en: hyphen range',
    language: 'en',
    text: 'What we ask: curiosity and a willingness to learn. 0-1 years of commercial experience is exactly what we expect.',
    minYears: 0,
    maxYears: 1,
    evidence: ['0-1 years of commercial experience'],
  },
  {
    name: 'en: en-dash range',
    language: 'en',
    text: 'We expect 0–2 years of professional experience.',
    minYears: 0,
    maxYears: 2,
    evidence: ['0–2 years of professional experience'],
  },
  {
    name: 'en: spelled range with "to"',
    language: 'en',
    text: 'You have 1 to 3 years of experience with Java.',
    minYears: 1,
    maxYears: 3,
    evidence: ['1 to 3 years of experience'],
  },
  {
    name: 'en: plus suffix',
    language: 'en',
    text: '3+ years of experience required.',
    minYears: 3,
    maxYears: null,
    evidence: ['3+ years of experience'],
  },
  {
    name: 'en: at least, digits',
    language: 'en',
    text: 'Requirements: at least 5 years of professional experience.',
    minYears: 5,
    maxYears: null,
    evidence: ['at least 5 years of professional experience'],
  },
  {
    name: 'en: at least, number word',
    language: 'en',
    text: 'We require at least three years of hands-on experience.',
    minYears: 3,
    maxYears: null,
    evidence: ['at least three years of hands-on experience'],
  },
  {
    name: 'en: "or more" suffix',
    language: 'en',
    text: 'You bring 5 years or more of professional experience.',
    minYears: 5,
    maxYears: null,
    evidence: ['5 years or more of professional experience'],
  },
  {
    name: 'en: ceiling only',
    language: 'en',
    text: 'This programme is open to candidates with up to 2 years of experience.',
    minYears: null,
    maxYears: 2,
    evidence: ['up to 2 years of experience'],
  },
  {
    name: 'en: "less than" ceiling',
    language: 'en',
    text: 'Ideal for candidates with less than 2 years of experience.',
    minYears: null,
    maxYears: 2,
    evidence: ['less than 2 years of experience'],
  },
  {
    name: 'en: exact figure',
    language: 'en',
    text: '2 years of experience with React is expected.',
    minYears: 2,
    maxYears: 2,
    evidence: ['2 years of experience'],
  },
  {
    name: 'en: no figure stated',
    language: 'en',
    text: 'We care more about how you reason about a problem than about the number of years on your CV.',
    minYears: null,
    maxYears: null,
    evidence: [],
  },
  {
    // The context gate: a number with a unit but nothing that makes it a requirement.
    name: 'en: company blurb, not a requirement',
    language: 'en',
    text: 'We have been building payments platforms for 15 years and we are still growing.',
    minYears: null,
    maxYears: null,
    evidence: [],
  },
  {
    name: 'en: team size is not a year count',
    language: 'en',
    text: 'You will manage a team of at least four engineers and own the roadmap.',
    minYears: null,
    maxYears: null,
    evidence: [],
  },
  {
    name: 'en: months are not years',
    language: 'en',
    text: 'Training is provided over a structured six-month onboarding programme. 0-1 years of commercial experience is what we expect.',
    minYears: 0,
    maxYears: 1,
    evidence: ['0-1 years of commercial experience'],
  },
  {
    // The case the product exists to catch: a welcoming range and a hard floor in
    // the same posting. The floor wins.
    name: 'en: adversarial — welcoming range plus a hard floor',
    language: 'en',
    text: [
      'Junior Java Developer wanted. This is a great entry point and 0-2 years of experience is fine.',
      '',
      'Requirements: 5+ years of professional experience with Java and Spring Boot.',
    ].join('\n'),
    minYears: 5,
    maxYears: null,
    evidence: [
      '0-2 years of experience',
      '5+ years of professional experience',
    ],
  },
  {
    name: 'de: range',
    language: 'de',
    text: 'Wir erwarten 0-1 Jahre Erfahrung und bieten eine strukturierte Einarbeitung.',
    minYears: 0,
    maxYears: 1,
    evidence: ['0-1 Jahre Erfahrung'],
  },
  {
    name: 'de: mindestens',
    language: 'de',
    text: 'Voraussetzung sind mindestens 3 Jahre Berufserfahrung in der Entwicklung.',
    minYears: 3,
    maxYears: null,
    evidence: ['mindestens 3 Jahre Berufserfahrung'],
  },
  {
    name: 'de: ab',
    language: 'de',
    text: 'Ab 2 Jahren Berufserfahrung übernimmst du eigene Projekte.',
    minYears: 2,
    maxYears: null,
    evidence: ['Ab 2 Jahren Berufserfahrung'],
  },
  {
    // The experience word in front of the quantity — the German word order the
    // backwards window exists for.
    name: 'de: experience word precedes the quantity',
    language: 'de',
    text: 'Berufserfahrung von mindestens 4 Jahren ist erforderlich.',
    minYears: 4,
    maxYears: null,
    evidence: ['Berufserfahrung von mindestens 4 Jahren'],
  },
  {
    name: 'de: über',
    language: 'de',
    text: 'Über 5 Jahre Berufserfahrung im Bereich Java sind Voraussetzung.',
    minYears: 5,
    maxYears: null,
    evidence: ['Über 5 Jahre Berufserfahrung'],
  },
  {
    name: 'de: zero years stated numerically',
    language: 'de',
    text: '0 Jahre Berufserfahrung erforderlich. Betreuung durch erfahrene Entwickler.',
    minYears: 0,
    maxYears: 0,
    evidence: ['0 Jahre Berufserfahrung'],
  },
  {
    name: 'de: ceiling',
    language: 'de',
    text: 'Wir suchen Berufseinsteiger mit maximal 2 Jahre Berufserfahrung.',
    minYears: null,
    maxYears: 2,
    evidence: ['maximal 2 Jahre Berufserfahrung'],
  },
  {
    name: 'de: number word',
    language: 'de',
    text: 'Du bringst drei Jahre Berufserfahrung mit.',
    minYears: 3,
    maxYears: 3,
    evidence: ['drei Jahre Berufserfahrung'],
  },
  {
    // "einem" is the article, not the numeral — see NUMBER_WORDS.
    name: 'de: indefinite article is not a number',
    language: 'de',
    text: 'Wir sind seit einem Jahr am Markt und suchen Verstärkung mit Erfahrung.',
    minYears: null,
    maxYears: null,
    evidence: [],
  },
  {
    // A German posting stating the requirement in English: both pattern sets run.
    name: 'de: requirement stated in English',
    language: 'de',
    text: 'Für unser Team in Berlin suchen wir Verstärkung. You should bring 3+ years of professional experience.',
    minYears: 3,
    maxYears: null,
    evidence: ['3+ years of professional experience'],
  },
];
