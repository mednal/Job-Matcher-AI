/**
 * The English shown for each classification signal code.
 *
 * The backend sends `{ code, weight, evidence }` and no wording — the code is the
 * contract and the phrasing is a UI decision, which is why the table lives here
 * (`backend/src/modules/classification/signal.ts` owns the codes and the weights).
 *
 * Every entry describes **what the posting says**, never what it means for the
 * reader's prospects: "5+ years of experience required", not "you are unlikely to
 * qualify". The evidence rendered underneath is the posting's own words, and a
 * label that editorialized would be putting a claim next to a quote that does not
 * support it.
 *
 * `signal-labels.spec.ts` reads the backend's table and fails if a code here has
 * no counterpart there, or a code there has no wording here.
 */
const SIGNAL_LABELS: Record<string, string> = {
  // Positive — the posting says it is open to someone starting out.
  ENTRY_LEVEL_STATED: 'Stated as an entry-level role',
  CAREER_STARTER_WELCOME: 'Career starters welcome',
  NO_EXPERIENCE_REQUIRED: 'No professional experience required',
  ZERO_TO_ONE_YEARS: '0–1 years of experience',
  ZERO_TO_TWO_YEARS: '0–2 years of experience',
  ONE_TO_TWO_YEARS: '1–2 years of experience',
  UP_TO_TWO_YEARS: 'Two years of experience or less',
  GRADUATES_WELCOME: 'Recent graduates welcome',
  GRADUATE_PROGRAMME: 'Graduate programme',
  TRAINING_PROVIDED: 'Training provided',
  MENTORING_OFFERED: 'Mentoring offered',
  INTERNSHIP_COUNTS: 'Internships count towards the requirement',
  YEARS_NOT_REQUIRED: 'Years of experience are not required',

  // Negative — the posting is describing someone further along.
  REQUIRES_5_PLUS_YEARS: '5+ years of experience required',
  REQUIRES_3_PLUS_YEARS: '3+ years of experience required',
  TEAM_MANAGEMENT: 'Managing a team',
  TEAM_LEAD: 'Leading a team',
  LEAD_RESPONSIBILITIES: 'Lead-level responsibilities',
  SENIOR_RESPONSIBILITIES: 'Senior-level responsibilities',
  EXTENSIVE_PROFESSIONAL_EXPERIENCE: 'Extensive professional experience expected',
  NO_EXPERIENCE_EXCLUDED: 'Candidates without professional experience excluded',
  END_TO_END_OWNERSHIP: 'End-to-end ownership of features',
  OWNERSHIP_OF_EXISTING_SERVICES: 'Ownership of existing services',
  ON_CALL_EXPECTED: 'On-call duty expected',
  PRODUCTION_EXPOSURE_PREFERRED: 'Production experience preferred',
};

/** The codes this table words. Exported for the drift check, not for rendering. */
export const KNOWN_SIGNAL_CODES: readonly string[] = Object.keys(SIGNAL_LABELS);

/**
 * The wording for a code, or a readable rendering of the code itself.
 *
 * The fallback is not dead weight: the classifier's vocabulary grows (M8.7's AI
 * stage may emit codes this build has never seen), and a stored classification can
 * outlive the version that wrote it. Dropping an unknown signal would hide
 * evidence, and showing `REQUIRES_3_PLUS_YEARS` raw would look like a defect, so an
 * unknown code is title-cased into something a person can read.
 */
export function signalLabel(code: string): string {
  const known = SIGNAL_LABELS[code];
  if (known) {
    return known;
  }

  const words = code.toLowerCase().split('_').filter(Boolean).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : code;
}
