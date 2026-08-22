/**
 * Language detection (M6.4, `ARCHITECTURE.md` §6.2, D3).
 *
 * `Job.language` is not a display field. Two things read it, and both break quietly
 * when it is wrong:
 *
 *  - **The search configuration.** `Job.searchVector` is a generated column whose
 *    `CASE` expression stems with the `german` configuration when `language = 'de'`
 *    and `english` otherwise (migration `20260821190950`, `DATABASE.md` §5.1). A
 *    German posting stored as `en` is stemmed by the English stemmer, so
 *    "Entwickler" and "Entwicklerin" stop being the same word and the posting simply
 *    stops appearing for queries that should find it. Nothing errors.
 *  - **The classifier pattern set.** Phase 8's signals are language-specific —
 *    "mehrjährige Berufserfahrung" is not in the English negative set — so the
 *    classifier keys its patterns off this value.
 *
 * Detection is stopword frequency, not a dependency. Two languages with disjoint
 * function words is exactly the case where counting works and a model is not worth
 * installing: function words are the highest-frequency tokens in any prose, they are
 * unaffected by the English technology names that fill German postings, and the
 * failure mode is a tie, which the fallback already answers.
 *
 * Judgement calls worth stating:
 *
 *  - **English is the fallback, and a tie is a fallback, not a coin flip.** The
 *    milestone requires unknown languages to land on `en`, and the English stemmer is
 *    the safer wrong answer: it stems less aggressively than the German one, so it
 *    costs recall rather than inventing matches.
 *  - **A structured value from the source wins**, the same way it does in
 *    `workplace-type.ts` and `employment-type.ts`. `declared` is whatever the source
 *    published (`de`, `de-DE`, `de_AT`); only a *supported* one wins outright,
 *    because a posting declaring `fr` still has to be stored as one of the two
 *    configurations that exist, and its own text is the better evidence for which.
 *  - **One stray token does not flip a posting.** German has to win *and* clear a
 *    small floor, so a single "der" inside an English quotation cannot re-stem a
 *    whole description.
 *
 * Known limitation, not worked around: a title on its own carries no function words
 * ("Junior Softwareentwickler (m/w/d)" contains none), so a title-only input falls
 * back to `en`. The pipeline always has the description by this stage, and `declared`
 * covers the sources that publish one.
 */

/** The languages the search configuration and the classifier patterns exist for. */
export type SupportedLanguage = 'en' | 'de';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'de'];

/** Used for unrecognized, unsupported and evidence-free input alike. */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * German function words. Every entry is absent from `ENGLISH_STOPWORDS` *and* from
 * ordinary English prose: `in`, `an`, `am`, `so`, `man`, `war`, `will`, `hat` and
 * `die` are all frequent German words and are all deliberately missing here, because
 * a token both languages use is not evidence for either.
 */
const GERMAN_STOPWORDS: ReadonlySet<string> = new Set([
  'aber',
  'als',
  'auch',
  'auf',
  'aus',
  'bei',
  'beim',
  'bereits',
  'bieten',
  'bietet',
  'dabei',
  'damit',
  'dann',
  'das',
  'dass',
  'dein',
  'deine',
  'deinen',
  'deiner',
  'dem',
  'den',
  'der',
  'des',
  'dich',
  'dir',
  'du',
  'durch',
  'ein',
  'eine',
  'einem',
  'einen',
  'einer',
  'eines',
  'es',
  'für',
  'fuer',
  'haben',
  'ihnen',
  'ihre',
  'ihren',
  'ihrer',
  'im',
  'ist',
  'kein',
  'keine',
  'keinen',
  'mehr',
  'mit',
  'nach',
  'nicht',
  'noch',
  'oder',
  'schon',
  'sehr',
  'sich',
  'sie',
  'sind',
  'sowie',
  'suchen',
  'über',
  'ueber',
  'und',
  'uns',
  'unser',
  'unsere',
  'unserem',
  'unseren',
  'unserer',
  'unter',
  'vom',
  'von',
  'vor',
  'wenn',
  'werden',
  'wie',
  'wir',
  'wird',
  'zu',
  'zum',
  'zur',
]);

/**
 * English function words, chosen under the same rule: nothing here is also a German
 * word, so `also`, `bald`, `fast`, `gift`, `man` and `war` are absent.
 */
const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'about',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'do',
  'each',
  'for',
  'from',
  'has',
  'have',
  'if',
  'into',
  'is',
  'it',
  'its',
  'looking',
  'more',
  'must',
  'not',
  'of',
  'on',
  'or',
  'our',
  'out',
  'should',
  'that',
  'the',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'to',
  'up',
  'we',
  'what',
  'when',
  'which',
  'who',
  'with',
  'you',
  'your',
]);

/**
 * How much German evidence is needed before the German stemmer is chosen. Two is the
 * smallest count that cannot come from a single token, and real German prose clears
 * it immediately ("Wir suchen dich" is three).
 */
const MINIMUM_GERMAN_EVIDENCE = 2;

/**
 * Words, lowercased. Splitting on non-letters keeps umlauts intact — unlike the other
 * matchers here, this one must not ASCII-fold: folding would turn `für` into `fuer`,
 * and both spellings are listed above precisely so that neither has to be produced.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((token) => token.length > 0);
}

/**
 * A source's own language code, reduced to a bare ISO 639-1 code: `de-DE`, `de_AT`
 * and `DE` all become `de`. Returns null for anything this stage does not support,
 * which sends the caller back to the text.
 */
function parseDeclared(
  declared: string | null | undefined,
): SupportedLanguage | null {
  if (!declared) {
    return null;
  }

  const code = declared.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.find((language) => language === code) ?? null;
}

export interface LanguageDetectionInput {
  title?: string | null;
  /** Normalized plain-text description. */
  description?: string | null;
  /** The language code the source published, in whatever form it published it. */
  declared?: string | null;
}

/**
 * The ISO 639-1 code to store in `language`. Never null: every posting is stemmed by
 * one configuration or the other, so this stage always commits to one.
 */
export function detectLanguage(
  input: LanguageDetectionInput,
): SupportedLanguage {
  const declared = parseDeclared(input.declared);
  if (declared) {
    return declared;
  }

  const tokens = tokenize(
    [input.title, input.description].filter(Boolean).join(' '),
  );

  let german = 0;
  let english = 0;
  for (const token of tokens) {
    if (GERMAN_STOPWORDS.has(token)) {
      german += 1;
    } else if (ENGLISH_STOPWORDS.has(token)) {
      english += 1;
    }
  }

  return german > english && german >= MINIMUM_GERMAN_EVIDENCE
    ? 'de'
    : DEFAULT_LANGUAGE;
}

/**
 * The PostgreSQL text-search configuration for a stored `language`.
 *
 * This mirrors the `CASE` expression inside the `Job.searchVector` generated column
 * by hand, and it has to: a query built with `to_tsquery('english', …)` against a
 * vector built with `german` matches almost nothing, and the mismatch is silent. The
 * argument is a plain string because it arrives from the database column, which is
 * `char(2)` and carries no narrower type.
 */
export function textSearchConfiguration(
  language: string,
): 'english' | 'german' {
  return language.trim().toLowerCase() === 'de' ? 'german' : 'english';
}

/** Exported for the disjointness test only. */
export const STOPWORD_SETS = {
  de: GERMAN_STOPWORDS,
  en: ENGLISH_STOPWORDS,
} as const;
