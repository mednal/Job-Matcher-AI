import { EmploymentType } from '@prisma/client';
import {
  matchesUnnegated,
  normalizeForPhraseMatch,
  phrasePattern,
} from './phrase-match';

/**
 * Employment type detection (M6.3, `ARCHITECTURE.md` §6.2).
 *
 * This attribute matters more for this product than it would for a general job
 * board: internships and working-student roles are where a large share of genuinely
 * junior-suitable postings live, and a candidate who is still studying is choosing
 * between exactly those two and nothing else.
 *
 * **The narrower arrangement wins**, in the order working student → internship →
 * contract → part time → full time. This is not arbitrary. A Werkstudent posting
 * almost always also says "Teilzeit", because that is what it legally is, and a
 * German internship posting frequently says "Vollzeit" for the same reason.
 * Resolving those ties toward the broader type would erase the specific arrangement
 * and leave the two types that matter most here almost never detected. The known
 * cost is a posting offering "Vollzeit oder Teilzeit" being recorded as PART_TIME.
 *
 * As with workplace type, a structured value from the source wins over prose, and
 * `null` is a real answer rather than a default to FULL_TIME.
 *
 * The enum is fixed by `DATABASE.md` §3.6 and is not extended here, so arrangements
 * it has no member for — a German `Ausbildung`, most notably — detect as `null`
 * rather than being forced into the nearest member.
 *
 * Known limitation: the title is classified before the description, which protects a
 * posting whose title states its own type, but a full-time posting with a silent
 * title and a benefits paragraph mentioning that the company also takes interns is
 * read as an internship. Fixing that needs sentence structure, which normalization
 * does not have and should not grow for this; the structured `declared` value from
 * the source is the cheaper answer wherever a source publishes one.
 */

const WORKING_STUDENT_PHRASES: readonly string[] = [
  'working student',
  'werkstudent',
  'werkstudentin',
  'werkstudent in',
  'werkstudierende',
  'werkstudierender',
  'werkstudentenstelle',
  'werkstudentenjob',
];

/**
 * Bare "intern" is deliberately absent: in German prose it is the ordinary word for
 * "internal", and a posting about "interne Prozesse" is not an internship.
 */
const INTERNSHIP_PHRASES: readonly string[] = [
  'internship',
  'internships',
  'interns',
  'summer internship',
  'praktikum',
  'praktika',
  'praktikant',
  'praktikantin',
  'praktikant in',
  'pflichtpraktikum',
  'praxissemester',
  'industrial placement',
  'placement year',
];

/**
 * Contracting, not fixed-term employment. A "fixed-term contract" / "befristeter
 * Vertrag" is an employee on a full-time or part-time footing and is excluded here
 * on purpose.
 */
const CONTRACT_PHRASES: readonly string[] = [
  'freelance',
  'freelancer',
  'freelancers',
  'contractor',
  'contract role',
  'contract position',
  'contract basis',
  'werkvertrag',
  'freiberuflich',
  'freiberufler',
  'honorarbasis',
];

const PART_TIME_PHRASES: readonly string[] = [
  'part time',
  'parttime',
  'teilzeit',
];

const FULL_TIME_PHRASES: readonly string[] = [
  'full time',
  'fulltime',
  'vollzeit',
  'festanstellung',
  'permanent position',
  'permanent role',
];

/**
 * Evaluated in order; the first type with unnegated evidence wins. The ordering is
 * the "narrower arrangement wins" rule made executable.
 */
const PRECEDENCE: ReadonlyArray<readonly [EmploymentType, RegExp]> = [
  [EmploymentType.WORKING_STUDENT, phrasePattern(WORKING_STUDENT_PHRASES)],
  [EmploymentType.INTERNSHIP, phrasePattern(INTERNSHIP_PHRASES)],
  [EmploymentType.CONTRACT, phrasePattern(CONTRACT_PHRASES)],
  [EmploymentType.PART_TIME, phrasePattern(PART_TIME_PHRASES)],
  [EmploymentType.FULL_TIME, phrasePattern(FULL_TIME_PHRASES)],
];

export interface EmploymentTypeInput {
  title?: string | null;
  /** Normalized plain-text description. */
  description?: string | null;
  /**
   * An employment type the source stated in a structured field, already mapped to
   * the enum by the adapter layer. Wins over every text signal.
   */
  declared?: EmploymentType | null;
}

function classify(text: string): EmploymentType | null {
  if (text.length === 0) {
    return null;
  }

  for (const [type, pattern] of PRECEDENCE) {
    if (matchesUnnegated(text, pattern)) {
      return type;
    }
  }
  return null;
}

/**
 * The employment arrangement, or `null` when the posting states none.
 *
 * The title is classified before the description, so a full-time posting whose
 * benefits paragraph mentions that the company also offers internships is not read
 * as an internship.
 */
export function detectEmploymentType(
  input: EmploymentTypeInput,
): EmploymentType | null {
  if (input.declared) {
    return input.declared;
  }

  const stages = [
    normalizeForPhraseMatch(input.title),
    normalizeForPhraseMatch(input.description),
  ];

  for (const stage of stages) {
    const detected = classify(stage);
    if (detected !== null) {
      return detected;
    }
  }

  return null;
}
