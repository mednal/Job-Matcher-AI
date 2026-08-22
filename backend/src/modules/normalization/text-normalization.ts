/**
 * Whitespace and unicode normalization (M6.1, `ARCHITECTURE.md` 6.2).
 *
 * Everything downstream reads the text this produces: the classifier matches
 * patterns against it, `JobPosting.contentHash` decides whether re-classification is
 * needed, and the signal excerpts shown to the user are quoted from it verbatim
 * (6.4). That makes two properties load-bearing:
 *
 *  - **Stability.** Two fetches of the same posting that differ only in invisible
 *    characters, line endings, or the width of a space must produce identical text;
 *    otherwise the content hash changes and every unchanged posting is
 *    re-classified on every run.
 *  - **Idempotence.** `normalizePlainText(normalizePlainText(x))` equals
 *    `normalizePlainText(x)`. The pipeline normalizes text at more than one point,
 *    and a second pass must never be able to change the stored value.
 *
 * This is deliberately rule-driven and cheap: it runs on every posting on every run.
 */

/**
 * Invisible characters that carry no meaning here but do change a hash: soft
 * hyphen, Mongolian vowel separator, zero-width space / non-joiner / joiner, word
 * joiner, and the BOM.
 *
 * They are listed as code points rather than as a character class on purpose. A
 * literal zero-width character in this file would be invisible to the next reader,
 * who would have no way to tell a typo from a deliberate entry.
 */
const INVISIBLE_CODE_POINTS = new Set([
  0x00ad, 0x180e, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff,
]);

/**
 * Drops invisibles and control characters. `\n` survives as structure and `\t`
 * survives to be folded into a space below; every other C0 control and DEL goes,
 * because none of them can appear in a job description for a good reason.
 */
function stripInvisibleAndControlCharacters(text: string): string {
  let result = '';
  for (const char of text) {
    if (char === '\n' || char === '\t') {
      result += char;
      continue;
    }
    const codePoint = char.codePointAt(0) as number;
    if (INVISIBLE_CODE_POINTS.has(codePoint)) {
      continue;
    }
    if (codePoint < 0x20 || codePoint === 0x7f) {
      continue;
    }
    result += char;
  }
  return result;
}

/** Horizontal whitespace: anything whitespace-like that is not a line break. */
const HORIZONTAL_WHITESPACE = /[^\S\n]+/g;

/**
 * Glyphs used as list markers in plain-text descriptions. Sources that publish a
 * description as text rather than HTML carry whichever bullet their CMS produced,
 * so the same posting on two boards would otherwise normalize differently. Only a
 * line-leading marker is rewritten, which is why the dash inside a range such as
 * "0-2 years" is left alone.
 */
const LEADING_BULLET = /^[•‣⁃▪▫○●◦∙·–—][^\S\n]+/gm;

/**
 * A bullet with nothing after it: an empty `<li>`, or a stray marker. The line
 * break goes with it — leaving a blank line behind would split one list into two.
 */
const EMPTY_BULLET_LINE = /^-[ ]*\n/gm;
const TRAILING_EMPTY_BULLET = /\n-[ ]*$/;

/**
 * Normalizes already-tag-free text. Safe to call on any string; `htmlToPlainText`
 * calls it as its final step.
 */
export function normalizePlainText(input: string): string {
  if (!input) {
    return '';
  }

  /*
   * Line endings first, so the compatibility pass sees one break form.
   *
   * NFKC rather than NFC: compatibility folding is what turns full-width and
   * superscript digits into ASCII ones, and the classifier's strongest evidence is
   * numeric, so a full-width "5+ Jahre" has to reach experience extraction as an
   * ASCII one (6.4). It also collapses ligatures and the many exotic spaces a
   * pasted description carries, which is most of what makes the hash stable.
   */
  const unified = input.replace(/\r\n?/g, '\n').normalize('NFKC');

  return (
    stripInvisibleAndControlCharacters(unified)
      .replace(HORIZONTAL_WHITESPACE, ' ')
      .replace(LEADING_BULLET, '- ')
      // Trim each line before collapsing blank runs, so a line of spaces counts as
      // blank rather than as content.
      .replace(/ *\n */g, '\n')
      .replace(EMPTY_BULLET_LINE, '')
      .replace(TRAILING_EMPTY_BULLET, '')
      // Three or more breaks are a formatting accident; two is a paragraph.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
