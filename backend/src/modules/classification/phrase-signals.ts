import { foldToAscii } from '../../common/utils/ascii-fold';
import type { SignalCode } from './signal';

/**
 * Phrase evidence (M8.2, `ARCHITECTURE.md` §6.4).
 *
 * The second half of stage 1's evidence: the fixed phrases a posting uses to say who
 * it is for. `experience.ts` reads the numbers; this reads the words. Keeping them
 * apart is what lets M8.3 implement §6.4's precedence rule — numeric beats phrase
 * beats title.
 *
 * Matching runs **over the original text, not a normalized copy**, and that is the
 * decision the whole file is shaped around. `normalization/phrase-match.ts` folds its
 * haystack to ASCII and strips punctuation before matching, which is right for the
 * attribute detectors (they answer an enum) and useless here: every offset is
 * destroyed, so no verbatim excerpt can be recovered. §4.3 forbids importing that
 * module anyway. So the tolerance it gets from folding the haystack, this gets from
 * compiling each phrase into a pattern that matches every spelling of itself:
 *
 *  - **Umlauts fold in the pattern.** `ä` in a phrase matches `ä`, `ae` and `a`, so
 *    "mehrjährige", "mehrjaehrige" and "mehrjahrige" are one phrase written once.
 *  - **Separators are flexible.** "entry level", "entry-level" and "entry–level" are
 *    the same phrase. Line breaks are *not* separators: M6.1 leaves paragraph breaks
 *    in place, and a phrase does not span two paragraphs.
 *  - **`~` opens a word edge.** `~erfahrung` matches `Berufserfahrung` and
 *    `Praxiserfahrung` without listing German compounds one by one; `absolvent~`
 *    matches `Absolventinnen`. The word boundary at the *phrase* edge still holds, so
 *    the excerpt starts and ends on whole words.
 *  - **`*` is a gap of up to two words.** "no *professional* experience *is*
 *    required" and "no experience required" are one entry. Two rather than three
 *    deliberately: "lead * team" with a three-word gap starts matching
 *    "our lead engineer and the team".
 *
 * **Both language sets always run**, which extends M8.1's divergence from §6.4's
 * "the pattern set is selected by `JobPosting.language`" to the phrases — and
 * contradicts the aside in M8.1 that said the rule was right for them. Two things
 * changed the answer. German postings mix English constantly ("This is an entry level
 * position" appears in German ads verbatim), so selecting would lose real matches;
 * and `detectLanguage` falls back to `en` for short or evidence-free text, so a
 * misdetection would silently switch the German set off on exactly the postings that
 * need it. The two vocabularies share no word, so running both cannot produce a
 * conflict — the day a phrase is added that reads differently in the other language
 * is the day this needs a language gate.
 */

/** Word characters, in the Unicode sense — `\w` is ASCII-only and German is not. */
const WORD_CHAR = '[\\p{L}\\p{N}]';

/**
 * What may sit between two tokens of a phrase: horizontal whitespace, the dash
 * family, and the light punctuation that survives normalization. `\n` is deliberately
 * absent.
 */
const SEPARATOR = '(?:[^\\S\\n]|[,;:/_\\-–—])+';

/** One word inside a `*` gap. `.` is excluded so a gap cannot cross a sentence end. */
const GAP_WORD = "[\\p{L}\\p{N}][\\p{L}\\p{N}'’\\-]*";

/** See the `*` note above: two, because three is where false matches start. */
const MAX_GAP_TOKENS = 2;

const LEFT_BOUNDARY = '(?<![\\p{L}\\p{N}])';
const RIGHT_BOUNDARY = '(?![\\p{L}\\p{N}])';

/**
 * Characters that a source may have written more than one way. The alternatives are
 * the same ones `foldToAscii` produces, read backwards: a phrase written with the
 * character matches text written with the character, with the German-style expansion,
 * or with the bare letter left by a lost encoding.
 */
const FOLD_ALTERNATIVES: ReadonlyMap<string, string> = new Map([
  ['ä', '(?:ä|ae|a)'],
  ['ö', '(?:ö|oe|o)'],
  ['ü', '(?:ü|ue|u)'],
  ['ß', '(?:ß|ss|s)'],
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenPattern(token: string): string {
  let pattern = '';
  for (const character of token) {
    pattern += FOLD_ALTERNATIVES.get(character) ?? escapeRegExp(character);
  }
  return pattern;
}

/**
 * Compiles one phrase into a case-insensitive global pattern over the original text.
 * Exported for its own spec: the compiler is where the tolerance lives, so it is
 * pinned directly rather than only through the dictionary.
 */
export function compilePhrase(phrase: string): RegExp {
  const tokens = phrase.trim().split(/\s+/);
  let body = '';

  tokens.forEach((token, position) => {
    if (token === '*') {
      body += `(?:${SEPARATOR}${GAP_WORD}){0,${MAX_GAP_TOKENS}}`;
      return;
    }

    if (position > 0) {
      body += SEPARATOR;
    }

    const prefixOpen = token.startsWith('~');
    const suffixOpen = token.endsWith('~');
    const core = tokenPattern(token.replace(/^~/, '').replace(/~$/, ''));

    body += prefixOpen ? `${WORD_CHAR}*` : '';
    body += core;
    body += suffixOpen ? `${WORD_CHAR}*` : '';
  });

  return new RegExp(`${LEFT_BOUNDARY}${body}${RIGHT_BOUNDARY}`, 'giu');
}

/**
 * Words that flip the phrase after them: "this is not an entry level role", "keine
 * mehrjährige Berufserfahrung nötig". The list is the one
 * `normalization/phrase-match.ts` uses; the two are separate copies because they
 * inspect different things — that one reads folded tokens, this reads the original
 * text — and §4.3 forbids the import that would share them.
 */
const NEGATORS: ReadonlySet<string> = new Set([
  'no',
  'not',
  'never',
  'without',
  'kein',
  'keine',
  'keinen',
  'keiner',
  'nicht',
  'ohne',
]);

/** How many words before a match are inspected, and how far back to read them from. */
const NEGATION_WINDOW_TOKENS = 3;
const NEGATION_LOOKBEHIND_CHARS = 60;

/**
 * True when a negator sits within three words in front of the match, on the same
 * line. Phrases that carry their own negation ("no experience required") are
 * unaffected — the negator is inside the match, not in front of it.
 */
function isNegated(text: string, matchIndex: number): boolean {
  const window = text.slice(
    Math.max(0, matchIndex - NEGATION_LOOKBEHIND_CHARS),
    matchIndex,
  );
  const line = window.slice(window.lastIndexOf('\n') + 1);

  return line
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .slice(-NEGATION_WINDOW_TOKENS)
    .some((word) => NEGATORS.has(foldToAscii(word)));
}

/**
 * How much text around the match the excerpt may reach for. The excerpt is the
 * sentence the phrase sits in, so that a reader sees the claim rather than two words
 * of it; these caps stop a posting written as one 900-character paragraph from
 * quoting the whole thing back. 150 each way covers the long compound sentence a
 * requirements paragraph is usually written as — below that, excerpts start
 * mid-clause on the seeded German postings.
 */
const EVIDENCE_BEFORE_CHARS = 150;
const EVIDENCE_AFTER_CHARS = 150;

/** Sentence terminators, allowing a closing quote or bracket after the stop. */
const SENTENCE_END = '[.!?]["\')\\]]?(?=\\s|$)|\\n';

function excerptStart(text: string, matchIndex: number): number {
  const from = Math.max(0, matchIndex - EVIDENCE_BEFORE_CHARS);
  const window = text.slice(from, matchIndex);

  let offset = -1;
  for (const boundary of window.matchAll(
    new RegExp(`(?:${SENTENCE_END})\\s*`, 'gu'),
  )) {
    offset = boundary.index + boundary[0].length;
  }
  if (offset >= 0) {
    return from + offset;
  }

  // No sentence break in reach. Starting mid-word would not be a quotation of
  // anything, so fall forward to the next word instead.
  if (from > 0) {
    const space = window.search(/\s/);
    return space >= 0 ? from + space + 1 : matchIndex;
  }
  return from;
}

function excerptEnd(text: string, matchEnd: number): number {
  const to = Math.min(text.length, matchEnd + EVIDENCE_AFTER_CHARS);
  const window = text.slice(matchEnd, to);

  const boundary = new RegExp(SENTENCE_END, 'u').exec(window);
  if (boundary) {
    return matchEnd + boundary.index + boundary[0].length;
  }
  if (to < text.length) {
    const space = window.lastIndexOf(' ');
    return space > 0 ? matchEnd + space : to;
  }
  return to;
}

/**
 * The verbatim excerpt for a match: the sentence containing it, trimmed. Nothing is
 * rewritten — the result is always a contiguous slice of `text`, which is what
 * `DATABASE.md` §4.1 requires and what the spec asserts for every corpus case.
 */
export function excerptFor(
  text: string,
  matchIndex: number,
  matchEnd: number,
): string {
  return text
    .slice(excerptStart(text, matchIndex), excerptEnd(text, matchEnd))
    .trim();
}

interface PhraseSignalDefinition {
  readonly code: SignalCode;
  readonly phrases: readonly string[];
}

/**
 * The dictionary. English and German entries share a code wherever they mean the same
 * thing, because the code is what M8.3 reasons about and what a user is eventually
 * shown — the language a posting happened to be written in is not part of the claim.
 */
export const PHRASE_SIGNAL_DEFINITIONS: readonly PhraseSignalDefinition[] = [
  {
    code: 'ENTRY_LEVEL_STATED',
    phrases: [
      'entry level',
      'einstiegsposition',
      'einstiegsstelle',
      'einstiegsjob',
      'einstiegsrolle',
      'einsteigerposition',
    ],
  },
  {
    code: 'CAREER_STARTER_WELCOME',
    phrases: [
      'career starter~',
      'berufseinsteiger~',
      'berufsanfänger~',
      'quereinsteiger~',
    ],
  },
  {
    code: 'NO_EXPERIENCE_REQUIRED',
    phrases: [
      // The gaps cover "no professional experience is required" and the bare form.
      'no * experience * required',
      'no prior experience',
      'no previous experience',
      'experience * not required',
      'keine ~erfahrung erforderlich',
      'keine ~erfahrung notwendig',
      'keine ~erfahrung nötig',
      'keine ~erfahrung vorausgesetzt',
      'keine vorkenntnisse',
      'ohne vorkenntnisse',
    ],
  },
  {
    code: 'GRADUATES_WELCOME',
    phrases: [
      'recent graduate~',
      'new graduate~',
      'recent grads',
      'fresh graduate~',
      'graduates * welcome',
      'university graduate~',
      '~absolvent~',
      'studienabgänger~',
    ],
  },
  {
    code: 'GRADUATE_PROGRAMME',
    phrases: [
      'graduate * program~',
      'graduate scheme',
      'trainee * program~',
      'traineeprogramm~',
      'einsteigerprogramm~',
    ],
  },
  {
    code: 'TRAINING_PROVIDED',
    phrases: [
      'training provided',
      'training is provided',
      'we provide training',
      'we offer training',
      'on the job training',
      'structured onboarding',
      'einarbeitung~',
      'schulung~',
      'weiterbildung~',
      'wir bilden dich aus',
      'wir schulen dich',
    ],
  },
  {
    code: 'MENTORING_OFFERED',
    phrases: [
      // Receiving mentorship only. "you will mentor junior developers" is a lead
      // responsibility and is matched as one, below.
      'mentoring is provided',
      'mentoring provided',
      'you will be mentored',
      'paired with a mentor',
      'assigned a mentor',
      'mentorship program~',
      'mentoring program~',
      'mentoring programm~',
      'mit * mentor',
      'fester mentor',
    ],
  },
  {
    code: 'INTERNSHIP_COUNTS',
    phrases: [
      'internship~ * count~',
      'including internships',
      'aus praktika',
      'praktika * zählen',
      'auch praktika',
    ],
  },
  {
    code: 'YEARS_NOT_REQUIRED',
    phrases: ['number of years', 'anzahl der jahre'],
  },
  {
    code: 'EXTENSIVE_PROFESSIONAL_EXPERIENCE',
    phrases: [
      'extensive * experience',
      'significant * experience',
      'substantial * experience',
      'deep * experience',
      'demonstrable * experience',
      'proven track record',
      'mehrjährig~ ~erfahrung',
      'langjährig~ ~erfahrung',
      'fundierte ~erfahrung',
      'einschlägige ~erfahrung',
      'umfangreiche ~erfahrung',
    ],
  },
  {
    code: 'TEAM_LEAD',
    phrases: [
      'lead * team',
      'leading * team',
      'teamleitung~',
      'teamlead~',
      'führung * teams',
      'ein team führen',
    ],
  },
  {
    code: 'TEAM_MANAGEMENT',
    phrases: [
      'team management',
      'manage * team',
      'managing * team',
      'people management',
      'line management',
      'personalverantwortung~',
      'mitarbeiterführung~',
      'disziplinarische führung',
      'führungserfahrung~',
      'führungsverantwortung~',
    ],
  },
  {
    code: 'LEAD_RESPONSIBILITIES',
    phrases: [
      'technical direction',
      'technical leadership',
      'architectural ownership',
      'own the architecture',
      'mentor junior~',
      'mentoring junior~',
      'coach junior~',
      'fachliche führung',
      'technische leitung',
    ],
  },
  {
    code: 'SENIOR_RESPONSIBILITIES',
    phrases: [
      // Not the bare word: "you will learn from senior engineers" is the opposite
      // claim and uses it too.
      'senior level',
      'senior position',
      'senior role',
      'as a senior',
      'this is a senior',
      'seniorposition',
    ],
  },
  {
    code: 'NO_EXPERIENCE_EXCLUDED',
    phrases: [
      'without * experience * not be considered',
      'without * experience * not be accepted',
      'ohne ~erfahrung * nicht berücksichtigt',
    ],
  },
  {
    code: 'END_TO_END_OWNERSHIP',
    phrases: [
      'own * end to end',
      'owning * end to end',
      'end to end ownership',
      'end to end verantwortung',
    ],
  },
  {
    code: 'OWNERSHIP_OF_EXISTING_SERVICES',
    phrases: [
      'ownership of existing',
      'own existing services',
      'maintain existing services',
      'take over existing',
      'verantwortung für bestehende',
    ],
  },
  {
    code: 'ON_CALL_EXPECTED',
    phrases: [
      'on call',
      'on call rotation',
      'on call duty',
      'rufbereitschaft~',
      'bereitschaftsdienst~',
    ],
  },
  {
    code: 'PRODUCTION_EXPOSURE_PREFERRED',
    phrases: [
      'exposure to production',
      'production exposure',
      'produktionserfahrung~',
    ],
  },
];

interface CompiledPhraseSignal {
  readonly code: SignalCode;
  readonly patterns: readonly RegExp[];
}

const COMPILED: readonly CompiledPhraseSignal[] = PHRASE_SIGNAL_DEFINITIONS.map(
  (definition) => ({
    code: definition.code,
    patterns: definition.phrases.map(compilePhrase),
  }),
);

/** One phrase match: the code it proves and the verbatim excerpt that proves it. */
export interface PhraseSignalMatch {
  readonly code: SignalCode;
  /** Offset of the matched phrase in the input, used only to order the results. */
  readonly index: number;
  readonly evidence: string;
}

/**
 * Every phrase signal a description carries, in document order.
 *
 * **One match per code.** A posting that says "training provided" three times has
 * said one thing, and counting it three times would let repetition outweigh evidence.
 * The earliest occurrence wins, so the excerpt a user is shown is the first place the
 * posting makes the claim.
 */
export function matchPhraseSignals(
  text: string | null | undefined,
): PhraseSignalMatch[] {
  if (!text) {
    return [];
  }

  const earliest = new Map<SignalCode, PhraseSignalMatch>();

  for (const { code, patterns } of COMPILED) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined || isNegated(text, match.index)) {
          continue;
        }

        const existing = earliest.get(code);
        if (existing !== undefined && existing.index <= match.index) {
          continue;
        }

        earliest.set(code, {
          code,
          index: match.index,
          evidence: excerptFor(
            text,
            match.index,
            match.index + match[0].length,
          ),
        });
      }
    }
  }

  return [...earliest.values()].sort((a, b) => a.index - b.index);
}
