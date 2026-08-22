import { normalizePlainText } from './text-normalization';

/**
 * Every non-ASCII character these tests care about is built from its code point and
 * named. A literal zero-width space or soft hyphen in a test file cannot be
 * reviewed: nobody can tell a deliberate case from a stray paste, and a later edit
 * would silently drop it.
 */
const ch = (codePoint: number): string => String.fromCodePoint(codePoint);

const SOFT_HYPHEN = ch(0x00ad);
const ZERO_WIDTH_SPACE = ch(0x200b);
const BYTE_ORDER_MARK = ch(0xfeff);
const NO_BREAK_SPACE = ch(0x00a0);
const EN_QUAD = ch(0x2000);
const BELL = ch(0x0007);
const FULLWIDTH_FIVE = ch(0xff15);
const FI_LIGATURE = ch(0xfb01);
const BULLET = ch(0x2022);
const BLACK_CIRCLE = ch(0x25cf);
const EN_DASH = ch(0x2013);

describe('normalizePlainText', () => {
  it('returns an empty string for empty input', () => {
    expect(normalizePlainText('')).toBe('');
  });

  it('unifies CRLF and CR line endings', () => {
    expect(normalizePlainText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('folds every horizontal whitespace form to a single space', () => {
    const input = `Node.js\tand ${NO_BREAK_SPACE}React${EN_QUAD}today`;
    expect(normalizePlainText(input)).toBe('Node.js and React today');
  });

  it('removes zero-width characters and soft hyphens', () => {
    // A posting that hyphenates "self-study" for justification must not reach the
    // classifier as two words, and an invisible character must never be the reason
    // an otherwise unchanged posting gets a new content hash.
    const input = `self${SOFT_HYPHEN}study${ZERO_WIDTH_SPACE} ok${BYTE_ORDER_MARK}`;
    expect(normalizePlainText(input)).toBe('selfstudy ok');
  });

  it('removes control characters but keeps line breaks', () => {
    expect(normalizePlainText(`a${BELL}b\nc`)).toBe('ab\nc');
  });

  it('folds compatibility characters to their ASCII form (NFKC)', () => {
    // The classifier's strongest evidence is numeric, so a full-width digit has to
    // arrive at experience extraction as an ASCII one.
    expect(normalizePlainText(`${FULLWIDTH_FIVE}+ Jahre`)).toBe('5+ Jahre');
    expect(normalizePlainText(`con${FI_LIGATURE}rmed`)).toBe('confirmed');
  });

  it('trims trailing whitespace from every line', () => {
    expect(normalizePlainText('a   \n   b   ')).toBe('a\nb');
  });

  it('collapses runs of blank lines to a single paragraph break', () => {
    expect(normalizePlainText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('keeps a single line break as a line break', () => {
    expect(normalizePlainText('- one\n- two')).toBe('- one\n- two');
  });

  it('rewrites line-leading bullet glyphs to a hyphen marker', () => {
    const input = `${BULLET} one\n${BLACK_CIRCLE} two\n${EN_DASH} three`;
    expect(normalizePlainText(input)).toBe('- one\n- two\n- three');
  });

  it('leaves a dash inside a line alone', () => {
    // Only a line-leading marker is a bullet. The dash in an experience range is
    // evidence and has to survive verbatim.
    const range = `0${EN_DASH}2 years of experience`;
    expect(normalizePlainText(range)).toBe(range);
  });

  it('drops a bullet with no content', () => {
    expect(normalizePlainText('- one\n-\n- two')).toBe('- one\n- two');
  });

  it('is idempotent', () => {
    const messy = `  Junior Developer \r\n\r\n\r\n${BULLET}\tBuild features${ZERO_WIDTH_SPACE}  \n\n`;
    const once = normalizePlainText(messy);
    expect(once).toBe('Junior Developer\n\n- Build features');
    expect(normalizePlainText(once)).toBe(once);
  });
});
