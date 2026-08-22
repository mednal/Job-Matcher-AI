import { WorkplaceType } from '@prisma/client';
import {
  matchesUnnegated,
  normalizeForPhraseMatch,
  phrasePattern,
} from './phrase-match';

/**
 * Workplace type detection (M6.3, `ARCHITECTURE.md` §6.2).
 *
 * `location.ts` deliberately left "Remote" sitting in the display location rather
 * than deciding what it meant, so that one place decides what remote is. This is
 * that place.
 *
 * Three judgement calls are worth stating, because they are the ones that will look
 * wrong in a spot check:
 *
 *  1. **A structured value from the source wins.** When a board publishes a
 *     workplace field, that is the employer's own answer and no amount of prose
 *     matching beats it. The caller maps it to the enum (the mapping is
 *     source-specific and therefore belongs in the adapter layer, not here) and
 *     passes it as `declared`; text detection is the fallback for the sources that
 *     publish nothing.
 *  2. **Remote plus onsite evidence means hybrid, not remote.** A posting that
 *     mentions both is describing a split week even when it never uses the word
 *     "hybrid". Reading it as fully remote is the more damaging error: a candidate
 *     who filters for remote and finds a job requiring three office days has been
 *     told something false about where they must live.
 *  3. **`null` is a real answer.** Most postings say nothing, and `workplaceType` is
 *     nullable precisely so that "not stated" is distinguishable from "onsite". A
 *     default of ONSITE would be a guess with a filter attached to it.
 *
 * Title and location are consulted before the description, because a description
 * that mentions the office kitchen should not outrank a title that says "Remote".
 */

/**
 * Phrases that state a fully remote arrangement. "Home office" is included in both
 * its English and German readings — in German postings "Homeoffice" is the ordinary
 * word for remote work, not a room in a house.
 */
const REMOTE_PHRASES: readonly string[] = [
  'remote',
  'remotely',
  'remote work',
  'remote working',
  'remote first',
  'fully remote',
  'full remote',
  '100 remote',
  'work from home',
  'working from home',
  'work from anywhere',
  'home office',
  'homeoffice',
  'mobiles arbeiten',
  'mobile arbeit',
  'telearbeit',
  'ortsunabhängig',
];

/** Phrases that state attendance at a workplace. */
const ONSITE_PHRASES: readonly string[] = [
  'on site',
  'onsite',
  'on location',
  'in office',
  'in the office',
  'in our office',
  'office based',
  'im büro',
  'in unserem büro',
  'vor ort',
  'präsenz',
  'präsenzpflicht',
  'nicht remote',
];

/** Phrases that state a split arrangement outright. */
const HYBRID_PHRASES: readonly string[] = [
  'hybrid',
  'hybrides arbeiten',
  'hybrid working',
  'hybrid work',
  'hybrid model',
  'partly remote',
  'partially remote',
  'part remote',
  'teilweise remote',
  'teilweise im büro',
];

const REMOTE_PATTERN = phrasePattern(REMOTE_PHRASES);
const ONSITE_PATTERN = phrasePattern(ONSITE_PHRASES);
const HYBRID_PATTERN = phrasePattern(HYBRID_PHRASES);

/**
 * The other way postings describe a split week: a day count attached to an office or
 * to remote work — "2 days per week in the office", "3 Tage remote". The text is
 * token-normalized before this runs, so the filler between the count and the anchor
 * is bounded by token count rather than by punctuation.
 */
const SPLIT_WEEK_PATTERNS: readonly RegExp[] = [
  /(?:^| )\d+ (?:days?|tage?)(?: [a-z0-9]+){0,4} (?:office|buero|onsite|on site|vor ort)(?= |$)/g,
  /(?:^| )\d+ (?:days?|tage?)(?: [a-z0-9]+){0,4} remote(?= |$)/g,
];

export interface WorkplaceTypeInput {
  title?: string | null;
  /** The source's free-text location, before `parseLocation` splits it. */
  location?: string | null;
  /** Normalized plain-text description. */
  description?: string | null;
  /**
   * A workplace type the source stated in a structured field, already mapped to the
   * enum by the adapter layer. Wins over every text signal.
   */
  declared?: WorkplaceType | null;
}

/** Decides a workplace type from one already-normalized haystack. */
function classify(text: string): WorkplaceType | null {
  if (text.length === 0) {
    return null;
  }

  const splitWeek = SPLIT_WEEK_PATTERNS.some((pattern) =>
    matchesUnnegated(text, pattern),
  );
  if (splitWeek || matchesUnnegated(text, HYBRID_PATTERN)) {
    return WorkplaceType.HYBRID;
  }

  const remote = matchesUnnegated(text, REMOTE_PATTERN);
  const onsite = matchesUnnegated(text, ONSITE_PATTERN);

  if (remote && onsite) {
    return WorkplaceType.HYBRID;
  }
  if (remote) {
    return WorkplaceType.REMOTE;
  }
  if (onsite) {
    return WorkplaceType.ONSITE;
  }
  return null;
}

/**
 * REMOTE, HYBRID, ONSITE, or `null` when the posting states nothing.
 */
export function detectWorkplaceType(
  input: WorkplaceTypeInput,
): WorkplaceType | null {
  if (input.declared) {
    return input.declared;
  }

  const stages = [
    normalizeForPhraseMatch(input.title, input.location),
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
