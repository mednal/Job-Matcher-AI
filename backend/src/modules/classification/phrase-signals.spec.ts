import {
  compilePhrase,
  excerptFor,
  matchPhraseSignals,
  PHRASE_SIGNAL_DEFINITIONS,
} from './phrase-signals';
import { SIGNAL_WEIGHTS } from './signal';

/**
 * The compiler and the excerpt are pinned directly, because they are where every
 * phrase's tolerance and every signal's evidence come from. The dictionary itself is
 * exercised through the corpus in `signals.spec.ts`.
 */
describe('compilePhrase', () => {
  const matches = (phrase: string, text: string): boolean =>
    compilePhrase(phrase).test(text);

  it('is case-insensitive', () => {
    expect(matches('entry level', 'This is an ENTRY LEVEL role')).toBe(true);
  });

  it('accepts any separator between tokens', () => {
    for (const written of ['entry level', 'entry-level', 'entry–level']) {
      expect(matches('entry level', `an ${written} role`)).toBe(true);
    }
  });

  it('does not let a phrase span a paragraph break', () => {
    expect(matches('entry level', 'entry\nlevel')).toBe(false);
  });

  it('matches every spelling of an umlaut', () => {
    for (const written of [
      'Berufsanfänger',
      'Berufsanfaenger',
      'Berufsanfanger',
    ]) {
      expect(matches('berufsanfänger~', written)).toBe(true);
    }
  });

  it('respects word boundaries at the edges of the phrase', () => {
    expect(matches('on call', 'we share an on-call rotation')).toBe(true);
    expect(matches('senior role', 'seniority role')).toBe(false);
  });

  it('opens a word edge for `~`, and only there', () => {
    expect(matches('~erfahrung', 'mit Berufserfahrung')).toBe(true);
    expect(matches('~erfahrung', 'mit Erfahrung')).toBe(true);
    expect(matches('erfahrung', 'mit Berufserfahrung')).toBe(false);
  });

  it('lets `*` skip up to two words and no more', () => {
    expect(
      matches('no * experience * required', 'no experience required'),
    ).toBe(true);
    expect(
      matches(
        'no * experience * required',
        'no prior professional experience is required',
      ),
    ).toBe(true);
    expect(
      matches(
        'lead * team',
        'our lead engineer and the platform team meet weekly',
      ),
    ).toBe(false);
  });

  it('does not let a `*` gap cross a sentence end', () => {
    expect(
      matches('extensive * experience', 'extensive tooling. Experience helps'),
    ).toBe(false);
  });
});

describe('excerptFor', () => {
  const quote = (text: string, phrase: string): string => {
    const index = text.indexOf(phrase);
    return excerptFor(text, index, index + phrase.length);
  };

  it('quotes the sentence the phrase sits in', () => {
    const text =
      'We build payments infrastructure. This is an entry level position. Apply by Friday.';
    expect(quote(text, 'entry level')).toBe('This is an entry level position.');
  });

  it('stops at a paragraph break', () => {
    const text = 'What we offer\nTraining provided from day one\nWhat we ask';
    expect(quote(text, 'Training provided')).toBe(
      'Training provided from day one',
    );
  });

  it('never returns anything but a slice of the input', () => {
    const text =
      'A single very long paragraph with no punctuation at all that goes on and on about the company and its mission and then finally mentions an entry level position somewhere in the middle of all of this text and then continues for a while longer without ever stopping';
    const excerpt = quote(text, 'entry level');

    expect(text).toContain(excerpt);
    expect(excerpt).toContain('entry level');
  });
});

describe('the phrase dictionary', () => {
  it('emits only codes the weight table knows', () => {
    for (const definition of PHRASE_SIGNAL_DEFINITIONS) {
      expect(SIGNAL_WEIGHTS[definition.code]).toBeDefined();
    }
  });

  it('names each code once, so one code has one weight and one meaning', () => {
    const codes = PHRASE_SIGNAL_DEFINITIONS.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('returns matches in document order', () => {
    const text =
      'We provide training. Recent graduates are welcome. This is an entry level position.';
    expect(matchPhraseSignals(text).map((match) => match.code)).toEqual([
      'TRAINING_PROVIDED',
      'GRADUATES_WELCOME',
      'ENTRY_LEVEL_STATED',
    ]);
  });

  it('reads nothing out of an absent description', () => {
    expect(matchPhraseSignals(null)).toEqual([]);
    expect(matchPhraseSignals('')).toEqual([]);
  });
});
