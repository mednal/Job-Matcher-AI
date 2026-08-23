import type { JuniorLevel } from '@prisma/client';

/**
 * The classifier fixture corpus (M8.3).
 *
 * The milestone's `Verify:` line is "the adversarial corpus passes — a 'Junior
 * Developer' title with `5+ years` in the body classifies as `EXPERIENCED`, and the
 * reverse case is caught", so those two cases open the list and are stated in both
 * languages. The rest of the corpus exists because a suite that only proved the
 * adversarial case would also pass with a classifier that answered
 * `CLEARLY_EXPERIENCED` to everything: each remaining case pins one of the four
 * paths through `decideLevel`, including the ones where the evidence is genuinely
 * weak and `AMBIGUOUS` is the correct answer.
 *
 * Cases run through the real extractors — `extractExperience` then `extractSignals`
 * then `decideLevel` — so a text here has to be a description a person could have
 * written, not a hand-assembled signal list. `level-rules.spec.ts` covers the rules
 * on synthetic evidence; this corpus covers them on prose.
 *
 * M8.6 grows this into the regression net for the whole phase, with anonymized real
 * descriptions. Until then it is deliberately small and every case is here to pin a
 * specific rule, named in `pins`.
 */
export interface ClassificationCase {
  readonly name: string;
  readonly language: 'en' | 'de';
  readonly title: string;
  readonly text: string;
  readonly level: JuniorLevel;
  /** The rule this case exists to hold in place. */
  readonly pins: string;
}

export const CLASSIFICATION_CORPUS: readonly ClassificationCase[] = [
  // --- The adversarial cases: the reason this product exists -------------------
  {
    name: 'en: Junior title, five years in the body',
    language: 'en',
    title: 'Junior Java Developer',
    text: 'We are looking for a Junior Java Developer to join our core banking group. Requirements: 5+ years of professional experience with Java and Spring Boot.',
    level: 'CLEARLY_EXPERIENCED',
    pins: 'a stated floor of five years settles the posting, whatever the title says',
  },
  {
    name: 'en: Junior title, three years in the body',
    language: 'en',
    title: 'Junior Frontend Developer',
    text: 'You will join the web team and work on our customer portal. We expect at least 3 years of professional experience with React.',
    level: 'EXPERIENCED',
    pins: 'three or four years is EXPERIENCED, not CLEARLY_EXPERIENCED',
  },
  {
    name: 'en: junior wording in one paragraph, five years in another',
    language: 'en',
    title: 'Junior Developer',
    text: [
      'This is an entry level position and training is provided.',
      '',
      'Requirements: at least 5 years of commercial experience with Kubernetes.',
    ].join('\n'),
    level: 'CLEARLY_EXPERIENCED',
    pins: 'numeric evidence beats phrase evidence, in either order in the text',
  },
  {
    name: 'de: Junior title, mindestens 5 Jahre in the body',
    language: 'de',
    title: 'Junior Softwareentwickler (m/w/d)',
    text: 'Wir suchen einen Junior Softwareentwickler für unser Kernbankensystem. Anforderungen: mindestens 5 Jahre Berufserfahrung mit Java.',
    level: 'CLEARLY_EXPERIENCED',
    pins: 'the adversarial case in German',
  },
  {
    name: 'en: the reverse — Senior title, entry level body',
    language: 'en',
    title: 'Senior Software Engineer',
    text: 'This is an entry level position on our payments team. No prior experience is required, and training is provided.',
    level: 'ENTRY_LEVEL',
    pins: 'a senior title cannot outvote the body either',
  },
  {
    name: 'de: the reverse — Senior title, Berufseinsteiger body',
    language: 'de',
    title: 'Senior Backend Entwickler (m/w/d)',
    text: 'Berufseinsteiger sind bei uns willkommen. Keine Berufserfahrung erforderlich, wir bilden dich aus.',
    level: 'ENTRY_LEVEL',
    pins: 'the reverse case in German',
  },

  // --- The junior side, where a figure decides ---------------------------------
  {
    name: 'en: 0-1 years and an entry level statement',
    language: 'en',
    title: 'Software Engineer',
    text: 'This is an entry level position. We are looking for 0-1 years of experience with Python.',
    level: 'ENTRY_LEVEL',
    pins: 'a junior ceiling plus a decisive positive is the strongest junior label',
  },
  {
    name: 'en: 0-2 years and a graduate programme',
    language: 'en',
    title: 'Graduate Software Engineer',
    text: 'Our graduate program takes 0-2 years of experience. You will be paired with a mentor for your first six months.',
    level: 'LIKELY_ENTRY_LEVEL',
    pins: 'a graduate programme is real evidence but not a statement that no experience is needed',
  },
  {
    name: 'en: a junior figure with one senior responsibility',
    language: 'en',
    title: 'Junior Developer',
    text: [
      'This is an entry level position. We ask for 0-1 years of experience.',
      '',
      'You will lead a small team of two engineers.',
      '',
    ].join('\n'),
    level: 'LIKELY_ENTRY_LEVEL',
    pins: 'one named concern demotes within the junior side',
  },
  {
    name: 'en: a junior figure with a senior job attached to it',
    language: 'en',
    title: 'Junior Platform Engineer',
    text: [
      'Requirements: 1-2 years of experience with Go.',
      '',
      'You will lead a small team, own the architecture of the platform, and take part in on call duty.',
    ].join('\n'),
    level: 'AMBIGUOUS',
    pins: 'concerns can reach AMBIGUOUS but never cross to the experienced side',
  },
  {
    name: 'en: a junior figure with a light concern',
    language: 'en',
    title: 'Junior Backend Engineer',
    text: 'We ask for 0-2 years of experience. This is an entry level position. You will take over existing services from the platform team.',
    level: 'ENTRY_LEVEL',
    pins: 'a light concern is recorded as evidence without moving the level',
  },
  {
    name: 'de: 1-2 Jahre, Praktika zählen mit',
    language: 'de',
    title: 'Junior Data Engineer (m/w/d)',
    text: 'Wir erwarten 1-2 Jahre Berufserfahrung. Praktika zählen dabei mit. Eine strukturierte Einarbeitung ist selbstverständlich.',
    level: 'LIKELY_ENTRY_LEVEL',
    pins: 'the junior-ceiling path in German',
  },

  // --- No usable figure: the phrases carry it ----------------------------------
  {
    name: 'en: entry level stated, no figure anywhere',
    language: 'en',
    title: 'QA Engineer',
    text: 'This is an entry level position on our QA team. No previous experience is required, and training is provided.',
    level: 'ENTRY_LEVEL',
    pins: 'phrases alone can reach ENTRY_LEVEL when one of them states it outright',
  },
  {
    name: 'en: soft positives only, no figure',
    language: 'en',
    title: 'Software Engineer',
    text: 'Recent graduates are welcome to apply. We provide training and you will be paired with a mentor.',
    level: 'LIKELY_ENTRY_LEVEL',
    pins: 'weight alone cannot buy ENTRY_LEVEL without a decisive statement',
  },
  {
    name: 'en: lead responsibilities, no figure',
    language: 'en',
    title: 'Software Engineer',
    text: 'You will provide technical direction for the group and manage a team of six engineers.',
    level: 'EXPERIENCED',
    pins: 'the experienced side is reachable from phrases alone',
  },
  {
    name: 'en: a senior job described in full, no figure',
    language: 'en',
    title: 'Platform Engineer',
    text: 'This is a senior role. You will provide technical leadership, manage a team of engineers, and take part in an on call rotation.',
    level: 'CLEARLY_EXPERIENCED',
    pins: 'enough concerns reach CLEARLY_EXPERIENCED with no number stated',
  },
  {
    name: 'de: mehrjährige Berufserfahrung und fachliche Führung',
    language: 'de',
    title: 'Softwareentwickler (m/w/d)',
    text: 'Sie bringen mehrjährige Berufserfahrung in der Entwicklung von Webanwendungen mit und übernehmen die fachliche Führung im Team.',
    level: 'EXPERIENCED',
    pins: 'the phrase path in German, where no figure is ever stated',
  },

  // --- Genuinely undecided, which is an answer ---------------------------------
  {
    name: 'en: the employer refuses to count years',
    language: 'en',
    title: 'Software Engineer',
    text: [
      'We do not care about the number of years on your CV.',
      '',
      'You will own your features end to end and take part in on call duty.',
    ].join('\n'),
    level: 'AMBIGUOUS',
    pins: 'evidence on both sides that cancels out stays AMBIGUOUS',
  },
  {
    name: 'en: a range that decides nothing',
    language: 'en',
    title: 'Software Engineer',
    text: 'We are looking for 1 to 4 years of experience with distributed systems.',
    level: 'AMBIGUOUS',
    pins: 'a floor below three and a ceiling above two is not evidence for either side',
  },

  // --- The title, last and weakest --------------------------------------------
  {
    name: 'en: silent body, junior title',
    language: 'en',
    title: 'Junior Software Engineer',
    text: 'We build tools for logistics companies. You will work with TypeScript and Postgres from our Berlin office.',
    level: 'LIKELY_ENTRY_LEVEL',
    pins: 'the title breaks a tie, and reaches only the middle of the junior side',
  },
  {
    name: 'en: silent body, senior title',
    language: 'en',
    title: 'Staff Software Engineer',
    text: 'We build tools for logistics companies. You will work with TypeScript and Postgres from our Berlin office.',
    level: 'EXPERIENCED',
    pins: 'the same tie-break on the other side',
  },
  {
    name: 'en: silent body, neutral title',
    language: 'en',
    title: 'Software Engineer',
    text: 'We build tools for logistics companies. You will work with TypeScript and Postgres from our Berlin office.',
    level: 'AMBIGUOUS',
    pins: 'no evidence anywhere is AMBIGUOUS, not a guess',
  },
  {
    name: 'en: a title that says both',
    language: 'en',
    title: 'Junior Team Lead',
    text: 'We build tools for logistics companies. You will work with TypeScript and Postgres from our Berlin office.',
    level: 'AMBIGUOUS',
    pins: 'a title contradicting itself decides nothing',
  },
  {
    name: 'en: no description at all',
    language: 'en',
    title: 'Junior Developer',
    text: '',
    level: 'LIKELY_ENTRY_LEVEL',
    pins: 'a posting with no body is classified, not rejected',
  },
];
