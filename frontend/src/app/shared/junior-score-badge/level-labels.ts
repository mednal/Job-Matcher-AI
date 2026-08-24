import { JuniorLevel } from '../../core/models/enums';

/**
 * How each `JuniorLevel` is worded for a reader.
 *
 * The enum members are the contract; these are the English the UI shows. They stay
 * descriptions of *the posting's stated requirements* — "Entry level", not "great
 * fit for you" — because the score and the level say what the job asks for, never
 * how a particular candidate would do with it (`ARCHITECTURE.md` §6.5).
 */
const LEVEL_LABELS: Record<JuniorLevel, string> = {
  ENTRY_LEVEL: 'Entry level',
  LIKELY_ENTRY_LEVEL: 'Likely entry level',
  AMBIGUOUS: 'Unclear',
  EXPERIENCED: 'Experienced',
  CLEARLY_EXPERIENCED: 'Clearly experienced',
};

/** What a job with no classification row yet is called. Not an error state. */
export const UNCLASSIFIED_LABEL = 'Not yet assessed';

export function levelLabel(level: JuniorLevel | null | undefined): string {
  return level ? LEVEL_LABELS[level] : UNCLASSIFIED_LABEL;
}
