import { descriptionParagraphs } from './description-paragraphs';

describe('descriptionParagraphs', () => {
  it('splits a body on its blank lines', () => {
    expect(descriptionParagraphs('First paragraph.\n\nSecond paragraph.')).toEqual([
      'First paragraph.',
      'Second paragraph.',
    ]);
  });

  /** A requirements list is one paragraph whose line breaks carry its shape. */
  it('keeps a single newline inside a paragraph', () => {
    expect(descriptionParagraphs('What we ask:\n- Java\n- Curiosity')).toEqual([
      'What we ask:\n- Java\n- Curiosity',
    ]);
  });

  it('treats a run of blank lines as one break', () => {
    expect(descriptionParagraphs('One.\n\n\n\nTwo.')).toEqual(['One.', 'Two.']);
  });

  it('handles Windows line endings', () => {
    expect(descriptionParagraphs('One.\r\n\r\nTwo.')).toEqual(['One.', 'Two.']);
  });

  it('drops a paragraph that is only whitespace', () => {
    expect(descriptionParagraphs('One.\n   \nTwo.\n\n   ')).toEqual(['One.', 'Two.']);
  });

  it('answers an empty list for a body with nothing in it', () => {
    expect(descriptionParagraphs('')).toEqual([]);
    expect(descriptionParagraphs(null)).toEqual([]);
  });
});
