import { normalizePlainText } from './text-normalization';

/**
 * HTML to plain text (M6.1, `ARCHITECTURE.md` 6.2).
 *
 * Job descriptions arrive as whatever markup the source's editor produced. The
 * classifier reads text, not markup, but it reads *structured* text: a requirement
 * list where every bullet has run together into one line loses the boundary between
 * "3+ years of Java" and the next line, and the verbatim excerpt shown as evidence
 * (6.4) becomes unreadable. So the two things this preserves are exactly the two the
 * milestone names: **paragraph breaks and list breaks**.
 *
 * This is a converter, not a parser. It never builds a DOM and never executes
 * anything; markup is rewritten to text in a single pass. Job HTML is third-party
 * input, so the safe behaviour on anything it does not understand is to drop the
 * markup and keep the text.
 *
 * Known and accepted simplifications:
 *  - Nested list indentation is flattened; every item becomes a top-level `- ` line.
 *  - `<pre>` whitespace is collapsed like any other. Postings do not rely on it.
 *  - Link targets are dropped and only the link text survives. A URL inside the
 *    description is noise for classification, and every posting already carries its
 *    canonical `url` on the `RawJob`.
 */

/**
 * Elements whose content is not prose. Their text is dropped along with their tags,
 * so a stylesheet or a JSON-LD block never reaches the classifier as evidence.
 */
const NON_PROSE_ELEMENTS =
  /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** The same elements left unclosed by a truncated payload. */
const UNCLOSED_NON_PROSE_ELEMENT =
  /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*$/i;

/** Comments, doctypes and processing instructions. */
const COMMENT = /<!--[\s\S]*?-->/g;
const DECLARATION = /<[!?][^>]*>/g;

/**
 * One tag. Quoted attribute values are matched as units so that a `>` inside an
 * attribute cannot end the tag early, which is the usual way a naive tag-stripping
 * regex eats the paragraph that follows it.
 */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

/**
 * Elements that end a block of text. Each boundary becomes a blank line, which the
 * final normalization pass collapses to a single paragraph break.
 */
const BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'ul',
]);

/** The text a tag is replaced with. */
function separatorFor(name: string, isClosing: boolean): string {
  switch (name) {
    case 'br':
      return '\n';
    case 'li':
      // The marker goes on the opening tag so that an item keeps its bullet even
      // when the source never closes the element, which is common in hand-written
      // description HTML. The closing tag contributes nothing: a break on both ends
      // would put a blank line between every requirement in a list.
      return isClosing ? '' : '\n- ';
    case 'tr':
      return isClosing ? '\n' : '';
    case 'td':
    case 'th':
      // Cells stay on one line: a table in a posting is usually a two-column
      // benefits or requirements grid, and breaking every cell apart reads worse
      // than joining them.
      return isClosing ? ' ' : '';
    default:
      return BLOCK_ELEMENTS.has(name) ? '\n\n' : '';
  }
}

/**
 * Named entities common in job descriptions. `nbsp` maps to an ordinary space
 * rather than U+00A0 deliberately: NFKC folds the non-breaking space to one
 * anyway, and a literal invisible character in this table would be unreadable.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  middot: '·',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  euro: '€',
  pound: '£',
  deg: '°',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  shy: String.fromCodePoint(0x00ad),
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
};

const ENTITY = /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

/**
 * Decodes entities. Deliberately the **last** step: decoding before the tags are
 * removed would turn an escaped `&lt;script&gt;` in the body text into markup that
 * the tag pass has already gone past.
 */
function decodeEntities(text: string): string {
  return text.replace(ENTITY, (match, body: string) => {
    if (body.startsWith('#')) {
      const codePoint =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) {
        return match;
      }
      // Lone surrogates are not text; leaving the reference intact is more honest
      // than emitting an unpaired code unit that breaks later string handling.
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    }
    // An unknown name is left as written: it is more likely to be literal text
    // (`R&D;`-style) than an entity worth guessing at.
    return NAMED_ENTITIES[body] ?? match;
  });
}

/**
 * Whether the input is markup at all. Sources publish descriptions both ways, and
 * the difference matters for exactly one reason: **a line break in HTML source is
 * insignificant whitespace, and a line break in a plain-text description is
 * structure**. Treating hard-wrapped HTML as if its wrapping were real produces a
 * ragged description; collapsing a text description's breaks destroys its lists.
 *
 * The test requires a tag name followed by whitespace, `/` or `>`, so a plain-text
 * address such as `<jobs@example.com>` is not mistaken for markup. Not global: a
 * `lastIndex` carried between calls would make the result depend on call order.
 */
const CONTAINS_MARKUP = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/;

/**
 * Converts a description to normalized plain text. Also correct for input that is
 * already plain text, so callers do not have to guess the format a source uses.
 *
 * Not idempotent, and it does not need to be: converted text can legitimately
 * contain `<...>` (an email address in angle brackets, a generic type), which a
 * second conversion would read as a tag and drop. A description is converted
 * exactly once, where the raw payload becomes a `JobPosting`. What *is* idempotent
 * is the normalization this ends with, so re-normalizing stored text is always a
 * no-op.
 */
export function htmlToPlainText(input: string | null | undefined): string {
  if (!input) {
    return '';
  }

  if (!CONTAINS_MARKUP.test(input)) {
    return normalizePlainText(decodeEntities(input));
  }

  const withoutMarkup = input
    .replace(NON_PROSE_ELEMENTS, ' ')
    .replace(UNCLOSED_NON_PROSE_ELEMENT, ' ')
    .replace(COMMENT, ' ')
    .replace(DECLARATION, ' ')
    // Source formatting is not content: indentation and hard wrapping collapse to a
    // single space *before* the tags become breaks, so the only line structure in
    // the result is the structure the markup actually declared.
    .replace(/\s+/g, ' ')
    .replace(TAG, (_match, closing: string, name: string) =>
      separatorFor(name.toLowerCase(), closing === '/'),
    );

  return normalizePlainText(decodeEntities(withoutMarkup));
}
