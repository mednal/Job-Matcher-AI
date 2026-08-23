import type { JuniorLevel } from '@prisma/client';
import type { SignalCode } from '../signal';

/**
 * The classification regression corpus (M8.6).
 *
 * This is the **regression net for the core value proposition** — the one stated in
 * `CLAUDE.md`: help junior developers find jobs that are genuinely suitable for
 * entry-level candidates. Every case is a posting a person read and decided about;
 * the expectations are that decision, written down. A change to the rules, the
 * weights, the phrase dictionary or the extractor that makes any case disagree is a
 * change in what the product tells its users, and this file is where that shows up.
 *
 * **Anonymized.** The descriptions are paraphrases in the register real postings are
 * written in — no employer is identifiable, every company name is invented, and no
 * text is copied from a source. That is what makes the corpus safe to keep in the
 * repository (`ARCHITECTURE.md` §7.5) and readable as prose rather than as fixtures.
 *
 * **Two corpora, not one.** `classification-corpus.ts` (M8.3) is a set of short
 * texts, each pinning one branch of `decideLevel`; it is a unit corpus and reads like
 * one. This one is full-length postings with the noise real ones carry — benefits
 * paragraphs, tech stacks, a sentence about the team — because the failure this
 * product exists to prevent happens in a posting where the decisive sentence is
 * buried, not in a two-line fixture.
 *
 * **What each case asserts** (`classification-regression.spec.ts`):
 *  - the `JuniorLevel`, which is the answer a user acts on;
 *  - the experience bounds, which back the `maxYearsRequired` search filter;
 *  - that the named signals are all found, so the level is *explained* and not just
 *    reached — an unexplained verdict cannot be argued with (`PRODUCT.md` §7);
 *  - that the named `absent` signals are not found, which is how a case pins a rule
 *    against over-matching rather than under-matching;
 *  - that the score lands in its level's band, end to end through M8.5.
 */

export interface RegressionCase {
  /** Stable identifier — the name a failure is reported under. */
  readonly ref: string;
  readonly language: 'en' | 'de';
  readonly title: string;
  readonly description: string;
  readonly level: JuniorLevel;
  readonly minYears: number | null;
  readonly maxYears: number | null;
  /** Evidence the classifier must find. */
  readonly signals: readonly SignalCode[];
  /** Evidence it must not find — the over-matching this case rules out. */
  readonly absent?: readonly SignalCode[];
  /** Why a person says this is the right answer. */
  readonly why: string;
}

export const REGRESSION_CORPUS: readonly RegressionCase[] = [
  // ---------------------------------------------------------------------------
  // The adversarial cases. This is the product's reason to exist: a posting that
  // looks junior at a glance and is not. Every one of them has to be caught.
  // ---------------------------------------------------------------------------
  {
    ref: 'en-junior-title-five-year-floor',
    language: 'en',
    title: 'Junior Java Developer',
    description: [
      'Harbour Clearing is a payments business processing card settlements for retail banks across Europe. Our engineering group of about thirty people works in small cross-functional squads.',
      '',
      'As a Junior Java Developer you will join the settlement squad and work on the services that reconcile card transactions overnight. The stack is Java 21, Spring Boot, Kafka and Postgres.',
      '',
      'What we expect:',
      '- at least 5 years of professional experience building backend services in Java',
      '- strong knowledge of Spring Boot and relational databases',
      '- comfort with production incidents and a pragmatic approach to testing',
      '',
      'We offer a hybrid arrangement with two office days a week, a learning budget, and a pension contribution.',
    ].join('\n'),
    level: 'CLEARLY_EXPERIENCED',
    minYears: 5,
    maxYears: null,
    signals: ['REQUIRES_5_PLUS_YEARS'],
    why: 'A "Junior" title over a five-year floor. The title is marketing; the requirement is the job. Catching this is the whole point of the product.',
  },
  {
    ref: 'de-junior-title-mindestens-fuenf-jahre',
    language: 'de',
    title: 'Junior Softwareentwickler (m/w/d)',
    description: [
      'Die Nordlicht Logistik GmbH entwickelt Software für die Disposition von Speditionen. Unser Team in Hamburg besteht aus zwölf Entwicklerinnen und Entwicklern.',
      '',
      'Als Junior Softwareentwickler arbeiten Sie an unserer Tourenplanung. Wir setzen auf Java, Spring Boot und PostgreSQL.',
      '',
      'Ihr Profil:',
      '- mindestens 5 Jahre Berufserfahrung in der Backend-Entwicklung',
      '- sehr gute Kenntnisse in Java und relationalen Datenbanken',
      '- eigenverantwortliche und strukturierte Arbeitsweise',
      '',
      'Wir bieten flexible Arbeitszeiten, ein Jobticket und einen Zuschuss zur Altersvorsorge.',
    ].join('\n'),
    level: 'CLEARLY_EXPERIENCED',
    minYears: 5,
    maxYears: null,
    signals: ['REQUIRES_5_PLUS_YEARS'],
    why: 'The same posting in German. The corpus carries the adversarial case in both languages because the extractors run both dictionaries unconditionally.',
  },
  {
    ref: 'en-entry-level-wording-with-five-year-floor',
    language: 'en',
    title: 'Software Engineer, Platform',
    description: [
      'Merridale Analytics builds reporting tools for insurance brokers. We are a team of eighteen, remote-first, with an office in Manchester.',
      '',
      'This is an entry level position on our platform team and full training is provided. You will help run the Kubernetes clusters our reporting jobs run on.',
      '',
      'Requirements:',
      '- at least 5 years of commercial experience operating container platforms',
      '- fluency with Terraform, Helm and CI pipelines',
      '',
      'We review salaries twice a year and support conference attendance.',
    ].join('\n'),
    level: 'CLEARLY_EXPERIENCED',
    minYears: 5,
    maxYears: null,
    signals: [
      'REQUIRES_5_PLUS_YEARS',
      'ENTRY_LEVEL_STATED',
      'TRAINING_PROVIDED',
    ],
    why: 'The posting calls itself entry level in one paragraph and asks for five years in another. Numeric evidence beats phrase evidence, so the number decides — and the friendly phrases are still recorded as evidence, because a user deserves to see the contradiction.',
  },
  {
    ref: 'en-graduates-welcome-with-three-year-floor',
    language: 'en',
    title: 'Backend Developer',
    description: [
      'Kestrel Field Services writes scheduling software for utility contractors. Our product team sits in Leeds and works in two-week iterations.',
      '',
      'Recent graduates are welcome to apply, and we are happy to hear from people who have taken a non-linear route into the profession.',
      '',
      'What the role needs:',
      '- at least 3 years of professional experience with Node.js or Go',
      '- experience designing REST APIs consumed by mobile clients',
      '- an eye for observability: metrics, tracing, and useful logs',
      '',
      'Benefits include a four-day summer schedule and a home-office allowance.',
    ].join('\n'),
    level: 'EXPERIENCED',
    minYears: 3,
    maxYears: null,
    signals: ['REQUIRES_3_PLUS_YEARS', 'GRADUATES_WELCOME'],
    why: 'A three-year floor is EXPERIENCED and not CLEARLY_EXPERIENCED — the difference between "not for you yet" and "not for you". Welcoming graduates in the same posting does not move it: positive phrases never pull an experienced figure back.',
  },
  {
    ref: 'de-quereinsteiger-mit-drei-jahren',
    language: 'de',
    title: 'Softwareentwickler Backend (m/w/d)',
    description: [
      'Die Talwerk Systeme GmbH digitalisiert Prozesse für mittelständische Fertigungsbetriebe. Wir arbeiten hybrid mit zwei Bürotagen in Stuttgart.',
      '',
      'Quereinsteiger sind bei uns ausdrücklich willkommen, wenn die Grundlagen stimmen.',
      '',
      'Ihr Profil:',
      '- mindestens 3 Jahre Berufserfahrung in der Softwareentwicklung',
      '- gute Kenntnisse in C# und .NET',
      '- Freude an der Zusammenarbeit mit unseren Fachbereichen',
      '',
      'Wir bieten 30 Urlaubstage und ein Budget für Fachliteratur.',
    ].join('\n'),
    level: 'EXPERIENCED',
    minYears: 3,
    maxYears: null,
    signals: ['REQUIRES_3_PLUS_YEARS', 'CAREER_STARTER_WELCOME'],
    why: 'The German mirror of the case above, and the sharper one: "Quereinsteiger willkommen" is among the strongest positive phrases the dictionary has, and it still cannot outvote a stated floor.',
  },
  {
    ref: 'en-senior-title-entry-level-body',
    language: 'en',
    title: 'Senior Support Engineer',
    description: [
      'Ashgrove Health runs a booking platform used by private clinics. The support engineering team keeps that platform answering.',
      '',
      'Despite the title, this is an entry level position: the seniority in the name reflects the customer-facing grade, not the years we expect. No previous experience with our stack is required, and training is provided over your first three months.',
      '',
      'You will triage incoming tickets, reproduce issues against a staging environment, and hand the harder ones to the platform squad.',
      '',
      'We work a rota of core hours and offer a study allowance.',
    ].join('\n'),
    level: 'ENTRY_LEVEL',
    minYears: null,
    maxYears: null,
    signals: [
      'ENTRY_LEVEL_STATED',
      'NO_EXPERIENCE_REQUIRED',
      'TRAINING_PROVIDED',
    ],
    absent: ['SENIOR_RESPONSIBILITIES'],
    why: 'The reverse adversarial case: a senior title over an entry-level body. It is caught for the same reason as the first case — the title never decides — and it is the one that costs a junior an opportunity rather than a wasted application.',
  },

  // ---------------------------------------------------------------------------
  // Genuinely junior postings. The product is worth nothing if it only says no.
  // ---------------------------------------------------------------------------
  {
    ref: 'en-entry-level-support-engineer',
    language: 'en',
    title: 'Associate Software Engineer',
    description: [
      'Pelham Grid is a small team building monitoring tools for community energy projects. We are twelve people, four of whom joined us straight out of university.',
      '',
      'This is an entry level position. We are looking for 0-1 years of experience with any modern language — our stack is TypeScript and Python, but we care more about how you think than what you have used.',
      '',
      'No previous experience with our domain is required. Training is provided, and you will sit with the team that owns the code you are changing.',
      '',
      'Interviewing is two conversations and a take-home exercise we pay for.',
    ].join('\n'),
    level: 'ENTRY_LEVEL',
    minYears: 0,
    maxYears: 1,
    signals: [
      'ZERO_TO_ONE_YEARS',
      'ENTRY_LEVEL_STATED',
      'NO_EXPERIENCE_REQUIRED',
      'TRAINING_PROVIDED',
    ],
    why: 'The clearest junior posting there is: a 0-1 range and an outright statement. If this is not ENTRY_LEVEL the scale means nothing.',
  },
  {
    ref: 'de-einstiegsposition-null-bis-eins',
    language: 'de',
    title: 'Softwareentwickler Einstieg (m/w/d)',
    description: [
      'Die Wiesengrund Software GmbH entwickelt Fachanwendungen für kommunale Verwaltungen. Unser Team in Leipzig ist bewusst klein gehalten.',
      '',
      'Es handelt sich um eine Einstiegsposition. Wir erwarten 0-1 Jahre Berufserfahrung.',
      '',
      'Keine Vorkenntnisse in unserem Fachbereich erforderlich — eine strukturierte Einarbeitung über die ersten Monate ist für uns selbstverständlich.',
      '',
      'Wir bieten 30 Urlaubstage, flexible Arbeitszeiten und ein Deutschlandticket.',
    ].join('\n'),
    level: 'ENTRY_LEVEL',
    minYears: 0,
    maxYears: 1,
    signals: ['ZERO_TO_ONE_YEARS', 'ENTRY_LEVEL_STATED', 'TRAINING_PROVIDED'],
    why: 'The same posting in German, and a check that the German half of the dictionary reaches the strongest label on its own.',
  },
  {
    ref: 'en-entry-level-phrases-without-a-figure',
    language: 'en',
    title: 'Software Engineer',
    description: [
      'Bramble Retail Systems builds point-of-sale software for independent shops. We are hiring into the till team.',
      '',
      'No previous experience is required for this role. Recent graduates are welcome to apply, as is anyone who has taught themselves and can show us something they built.',
      '',
      'We provide training in our stack — Kotlin on the server, a small Android client — and pair new joiners with the team for their first weeks.',
      '',
      'The role is based in Bristol with two remote days a week.',
    ].join('\n'),
    level: 'ENTRY_LEVEL',
    minYears: null,
    maxYears: null,
    signals: [
      'NO_EXPERIENCE_REQUIRED',
      'GRADUATES_WELCOME',
      'TRAINING_PROVIDED',
    ],
    why: 'Most postings state no figure at all. This one reaches ENTRY_LEVEL on phrases alone — but only because one of them says outright that no experience is needed; weight by itself cannot buy the strongest label.',
  },
  {
    ref: 'de-berufseinsteiger-ohne-zahl',
    language: 'de',
    title: 'Entwickler (m/w/d) Web',
    description: [
      'Die Hafenblick Digital GmbH betreut Webportale für Reedereien und Hafenbetriebe.',
      '',
      'Berufseinsteigerinnen und Berufseinsteiger sind bei uns willkommen. Auch Absolventinnen und Absolventen technischer Studiengänge sprechen wir ausdrücklich an.',
      '',
      'Eine gründliche Einarbeitung sowie regelmäßige Weiterbildung gehören für uns dazu.',
      '',
      'Wir arbeiten mit TypeScript, Vue und Node.js.',
    ].join('\n'),
    level: 'ENTRY_LEVEL',
    minYears: null,
    maxYears: null,
    signals: [
      'CAREER_STARTER_WELCOME',
      'GRADUATES_WELCOME',
      'TRAINING_PROVIDED',
    ],
    why: 'The German phrase path to ENTRY_LEVEL, with no number anywhere — the shape most German junior postings actually take.',
  },
  {
    ref: 'en-graduate-programme',
    language: 'en',
    title: 'Graduate Software Engineer',
    description: [
      'Linden Rail Data supplies timetable and disruption feeds to transport operators.',
      '',
      'Our graduate program runs for eighteen months. It takes 0-2 years of experience and rotates you through three teams: ingestion, the API, and the customer-facing dashboards.',
      '',
      'You will be paired with a mentor for the whole rotation and meet your cohort monthly.',
      '',
      'Applications close at the end of the quarter and start dates are in September.',
    ].join('\n'),
    level: 'LIKELY_ENTRY_LEVEL',
    minYears: 0,
    maxYears: 2,
    signals: ['ZERO_TO_TWO_YEARS', 'GRADUATE_PROGRAMME', 'MENTORING_OFFERED'],
    absent: ['LEAD_RESPONSIBILITIES'],
    why: 'A graduate programme is real evidence and lands on the junior side, but it is a softer claim than "no experience required" — LIKELY_ENTRY_LEVEL is the honest answer, and the absent check keeps "mentor" from being read as mentoring somebody else.',
  },
  {
    ref: 'de-werkstudent-praktika-zaehlen',
    language: 'de',
    title: 'Junior Data Engineer (m/w/d)',
    description: [
      'Die Ostwind Energie AG wertet Betriebsdaten von Windparks aus. Das Datenteam sitzt in Rostock.',
      '',
      'Wir erwarten 1-2 Jahre Berufserfahrung. Praktika und Werkstudententätigkeiten zählen dabei mit.',
      '',
      'Eine strukturierte Einarbeitung ist selbstverständlich; die ersten Wochen verbringen Sie eng mit dem Team.',
      '',
      'Technisch arbeiten wir mit Python, dbt und Snowflake.',
    ].join('\n'),
    level: 'LIKELY_ENTRY_LEVEL',
    minYears: 1,
    maxYears: 2,
    signals: ['ONE_TO_TWO_YEARS', 'INTERNSHIP_COUNTS', 'TRAINING_PROVIDED'],
    why: 'The junior-ceiling path in German. "Praktika zählen mit" is the sentence that makes a 1-2 range reachable for someone leaving university, and it has to be read as evidence.',
  },
  {
    ref: 'en-up-to-two-years-internships-count',
    language: 'en',
    title: 'Software Engineer I',
    description: [
      'Corvid Labs makes accessibility tooling for public-sector websites.',
      '',
      'We are looking for up to 2 years of experience. Internships count towards that, and so does open-source work you can point us at.',
      '',
      'You will work on the crawler that audits customer sites, mostly in Python.',
      '',
      'We are a remote team across three time zones with a yearly meet-up.',
    ].join('\n'),
    level: 'LIKELY_ENTRY_LEVEL',
    minYears: null,
    maxYears: 2,
    signals: ['UP_TO_TWO_YEARS', 'INTERNSHIP_COUNTS'],
    absent: ['ZERO_TO_TWO_YEARS'],
    why: '"Up to 2 years" is not the same claim as "0-2 years", and the corpus pins that the classifier does not quote a floor the posting never wrote.',
  },
  {
    ref: 'en-junior-title-silent-body',
    language: 'en',
    title: 'Junior Frontend Developer',
    description: [
      'Marlowe Studio designs and builds websites for museums and galleries.',
      '',
      'You will work on component libraries and page templates in React and TypeScript, alongside two designers and a producer.',
      '',
      'Our projects run six to ten weeks. We work from an office in Glasgow three days a week and offer a cycle-to-work scheme.',
    ].join('\n'),
    level: 'LIKELY_ENTRY_LEVEL',
    minYears: null,
    maxYears: null,
    signals: [],
    why: 'A body that says nothing about who the job is for. The title breaks the tie and reaches the middle of the junior side — never the top, because a title is a marketing decision.',
  },

  // ---------------------------------------------------------------------------
  // Experienced postings. Being right about these is what keeps a junior search
  // worth reading.
  // ---------------------------------------------------------------------------
  {
    ref: 'en-lead-responsibilities-no-figure',
    language: 'en',
    title: 'Software Engineer, Payments',
    description: [
      'Fenwick Pay is a small treasury business moving money for marketplaces.',
      '',
      'You will set the technical direction for the payments group and bring extensive commercial experience with distributed systems to a codebase that is now five years old.',
      '',
      'The stack is Go and Postgres, deployed on AWS.',
      '',
      'We offer equity and a remote-first arrangement within European time zones.',
    ].join('\n'),
    level: 'EXPERIENCED',
    minYears: null,
    maxYears: null,
    signals: ['LEAD_RESPONSIBILITIES', 'EXTENSIVE_PROFESSIONAL_EXPERIENCE'],
    why: 'No number anywhere, a neutral title, and a job that is plainly not for a beginner. The phrases have to carry it, or postings like this quietly fill a junior search.',
  },
  {
    ref: 'de-mehrjaehrige-erfahrung-fachliche-fuehrung',
    language: 'de',
    title: 'Softwareentwickler (m/w/d)',
    description: [
      'Die Rheinpfad Versicherungstechnik GmbH betreut Bestandssysteme für Versicherer.',
      '',
      'Sie bringen mehrjährige Berufserfahrung in der Entwicklung von Webanwendungen mit und übernehmen die fachliche Führung in einem kleinen Entwicklungsteam.',
      '',
      'Unsere Anwendungen laufen auf Java und Oracle; die Modernisierung Richtung Cloud hat begonnen.',
      '',
      'Wir bieten ein Gleitzeitmodell und einen unbefristeten Vertrag.',
    ].join('\n'),
    level: 'EXPERIENCED',
    minYears: null,
    maxYears: null,
    signals: ['EXTENSIVE_PROFESSIONAL_EXPERIENCE', 'LEAD_RESPONSIBILITIES'],
    why: 'German postings very often state no figure and describe the person instead. "Mehrjährige Berufserfahrung" is that description, and it has to weigh as much as a number would.',
  },
  {
    ref: 'en-senior-role-described-in-full',
    language: 'en',
    title: 'Platform Engineer',
    description: [
      'Quarrow Freight operates a logistics network across the Nordics.',
      '',
      'This is a senior role. You will provide technical leadership for the platform group, manage a team of engineers, and own the architecture of our scheduling services.',
      '',
      'The team takes part in an on call rotation, compensated at the usual rate.',
      '',
      'We are hiring in Stockholm or remotely within two hours of CET.',
    ].join('\n'),
    level: 'CLEARLY_EXPERIENCED',
    minYears: null,
    maxYears: null,
    signals: [
      'SENIOR_RESPONSIBILITIES',
      'LEAD_RESPONSIBILITIES',
      'TEAM_MANAGEMENT',
      'ON_CALL_EXPECTED',
    ],
    why: 'Enough named responsibilities reach the bottom of the scale with no figure stated at all. A neutral title over this body must not read as neutral.',
  },
  {
    ref: 'de-teamleitung-mit-personalverantwortung',
    language: 'de',
    title: 'Entwickler (m/w/d) Cloud-Plattform',
    description: [
      'Die Sturmhaus Systemhaus GmbH betreibt Cloud-Infrastruktur für Krankenhäuser.',
      '',
      'Zu Ihren Aufgaben gehören die Teamleitung der Plattformgruppe sowie die Personalverantwortung für fünf Kolleginnen und Kollegen.',
      '',
      'Eine Rufbereitschaft im Wochenrhythmus gehört zur Rolle und wird gesondert vergütet.',
      '',
      'Wir arbeiten mit Kubernetes, Terraform und GitLab CI.',
    ].join('\n'),
    level: 'CLEARLY_EXPERIENCED',
    minYears: null,
    maxYears: null,
    signals: ['TEAM_LEAD', 'TEAM_MANAGEMENT', 'ON_CALL_EXPECTED'],
    why: 'The German equivalent, and a reminder that a title saying "Entwickler" says nothing: the responsibilities are the posting.',
  },

  // ---------------------------------------------------------------------------
  // Ambiguous. Saying "we cannot tell" is an answer, and a better one than a
  // confident guess — a wrong confident answer is what the product must not do.
  // ---------------------------------------------------------------------------
  {
    ref: 'en-neutral-title-silent-body',
    language: 'en',
    title: 'Software Engineer',
    description: [
      'Aldermist builds tools that help letting agents keep their listings current.',
      '',
      'You will work across a Rails application and a small React front end, with a weekly release train and a code review culture we take seriously.',
      '',
      'The role is based in Cardiff, hybrid, with a travel budget for two team weeks a year.',
    ].join('\n'),
    level: 'AMBIGUOUS',
    minYears: null,
    maxYears: null,
    signals: [],
    why: 'A posting that describes the work and never says who it is for. AMBIGUOUS is the correct answer and the search must not present it as junior.',
  },
  {
    ref: 'de-neutrale-stelle-ohne-angabe',
    language: 'de',
    title: 'Softwareentwickler (m/w/d)',
    description: [
      'Die Feldbrunnen IT GmbH entwickelt Auswertungen für landwirtschaftliche Betriebe.',
      '',
      'Sie arbeiten an unserer Weboberfläche und den dazugehörigen Schnittstellen. Eingesetzt werden TypeScript, Angular und PostgreSQL.',
      '',
      'Der Standort ist Osnabrück, zwei Tage pro Woche im Büro.',
    ].join('\n'),
    level: 'AMBIGUOUS',
    minYears: null,
    maxYears: null,
    signals: [],
    why: 'The German silent posting. Nothing in the text, nothing in the title, and no guess from either.',
  },
  {
    ref: 'en-range-that-decides-nothing',
    language: 'en',
    title: 'Software Engineer',
    description: [
      'Thistledown Care writes rostering software for home-care providers.',
      '',
      'We are looking for 1 to 4 years of experience with distributed systems, and an interest in the domain matters more to us than the exact figure.',
      '',
      'The team is eight engineers across Dublin and Belfast.',
    ].join('\n'),
    level: 'AMBIGUOUS',
    minYears: 1,
    maxYears: 4,
    signals: [],
    why: 'A floor below three and a ceiling above two is evidence for neither side. The extractor records the bounds — search still filters on them — but no signal is invented for a shrug.',
  },
  {
    ref: 'en-junior-figure-with-a-senior-job-attached',
    language: 'en',
    title: 'Junior Platform Engineer',
    description: [
      'Halloway Broadcast streams live sport to rights-holders in twelve markets.',
      '',
      'Requirements: 1-2 years of experience with Go or Rust.',
      '',
      'You will lead a small team of contractors, own the architecture of the ingest pipeline, and take part in on call duty during events.',
      '',
      'We offer a shift allowance and a season ticket loan.',
    ].join('\n'),
    level: 'AMBIGUOUS',
    minYears: 1,
    maxYears: 2,
    signals: [
      'ONE_TO_TWO_YEARS',
      'TEAM_LEAD',
      'LEAD_RESPONSIBILITIES',
      'ON_CALL_EXPECTED',
    ],
    why: 'The posting contradicts itself: a junior figure and a job description for somebody far past it. Concerns demote it to AMBIGUOUS but never across to the experienced side — a stated ceiling of two years is still a number the employer wrote down.',
  },
  {
    ref: 'en-employer-refuses-to-count-years',
    language: 'en',
    title: 'Software Engineer',
    description: [
      'Vellum Type is a small company making typesetting software for academic publishers.',
      '',
      'We do not care about the number of years on your CV. We care whether you can read somebody else’s code and leave it better than you found it.',
      '',
      'You will own your features end to end and take part in on call duty one week in six.',
      '',
      'Four-day week, no meetings before eleven.',
    ].join('\n'),
    level: 'AMBIGUOUS',
    minYears: null,
    maxYears: null,
    signals: ['YEARS_NOT_REQUIRED', 'END_TO_END_OWNERSHIP', 'ON_CALL_EXPECTED'],
    why: 'Evidence on both sides that cancels out. The honest answer is that the posting has not said, and the user gets the evidence rather than a verdict dressed up as one.',
  },
];
