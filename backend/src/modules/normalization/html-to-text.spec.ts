import { htmlToPlainText } from './html-to-text';

const ch = (codePoint: number): string => String.fromCodePoint(codePoint);
const RIGHT_SINGLE_QUOTE = ch(0x2019);
const EM_DASH = ch(0x2014);
const EN_DASH = ch(0x2013);
const U_UMLAUT = ch(0x00fc);

describe('htmlToPlainText', () => {
  it('returns an empty string for empty, null or undefined input', () => {
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText(undefined)).toBe('');
  });

  describe('structure', () => {
    it('turns a block boundary into a paragraph break', () => {
      expect(htmlToPlainText('<p>One</p><p>Two</p>')).toBe('One\n\nTwo');
      expect(htmlToPlainText('<h2>Role</h2><div>Details</div>')).toBe(
        'Role\n\nDetails',
      );
    });

    it('turns a line break into a single line break', () => {
      expect(htmlToPlainText('<p>One<br/>Two</p>')).toBe('One\nTwo');
    });

    it('turns list items into consecutive bullet lines', () => {
      // Consecutive, not paragraph-separated: a requirement list read as a wall of
      // paragraphs is unusable as classification evidence.
      expect(
        htmlToPlainText('<ul><li>First</li><li>Second</li><li>Third</li></ul>'),
      ).toBe('- First\n- Second\n- Third');
    });

    it('keeps the bullet when the source never closes the item', () => {
      // Hand-written description HTML omits </li> constantly.
      expect(htmlToPlainText('<ul><li>First<li>Second</ul>')).toBe(
        '- First\n- Second',
      );
    });

    it('drops an empty list item rather than emitting a bare marker', () => {
      expect(htmlToPlainText('<ul><li>First</li><li></li></ul>')).toBe(
        '- First',
      );
    });

    it('keeps a table row on one line and separates rows', () => {
      expect(
        htmlToPlainText(
          '<table><tr><th>Contract</th><td>Permanent</td></tr>' +
            '<tr><th>Level</th><td>Entry</td></tr></table>',
        ),
      ).toBe('Contract Permanent\nLevel Entry');
    });

    it('treats source indentation and hard wrapping as insignificant', () => {
      // A line break inside HTML source is whitespace, not structure. Honouring it
      // would shred every posting whose ATS wraps its markup at 80 columns.
      const wrapped =
        '<p>We are looking for a\n   career starter to join\n   the team.</p>';
      expect(htmlToPlainText(wrapped)).toBe(
        'We are looking for a career starter to join the team.',
      );
    });

    it('does not let inline markup break a sentence', () => {
      expect(
        htmlToPlainText(
          '<p>Build in <code>TypeScript</code> and <b>Node.js</b>.</p>',
        ),
      ).toBe('Build in TypeScript and Node.js.');
    });
  });

  describe('markup that is not prose', () => {
    it('drops script content, including a JSON-LD block', () => {
      // The structured-data block of a posting routinely contradicts its body. If
      // its text reached the classifier it would be evidence for a title nobody
      // wrote in the description.
      const html =
        '<script type="application/ld+json">{"title":"Senior Staff Engineer"}</script>' +
        '<p>Junior Developer</p>';
      expect(htmlToPlainText(html)).toBe('Junior Developer');
    });

    it('drops style and comment content', () => {
      expect(
        htmlToPlainText(
          '<style>p { margin: 0 }</style><!-- internal --><p>Text</p>',
        ),
      ).toBe('Text');
    });

    it('drops a doctype and a processing instruction', () => {
      expect(htmlToPlainText('<!DOCTYPE html><p>Text</p>')).toBe('Text');
    });

    it('drops an unclosed non-prose element instead of leaking its content', () => {
      expect(htmlToPlainText('<p>Text</p><style>p { margin: 0 }')).toBe('Text');
    });

    it('is not fooled by a greater-than sign inside an attribute value', () => {
      // The usual failure of a naive tag stripper: the tag ends early and the rest
      // of the attribute is emitted as body text.
      expect(
        htmlToPlainText('<div data-note="salary > market"><p>Text</p></div>'),
      ).toBe('Text');
    });
  });

  describe('entities', () => {
    it('decodes named entities', () => {
      expect(htmlToPlainText('<p>R&amp;D f&uuml;r alle</p>')).toBe(
        `R&D f${U_UMLAUT}r alle`,
      );
    });

    it('decodes decimal and hexadecimal references', () => {
      expect(htmlToPlainText('<p>you&#39;ll &#x2014; today</p>')).toBe(
        `you'll ${EM_DASH} today`,
      );
    });

    it('decodes an entity that normalization then removes', () => {
      expect(htmlToPlainText('<p>self&shy;study</p>')).toBe('selfstudy');
    });

    it('leaves an unknown entity as written', () => {
      expect(htmlToPlainText('<p>Ben &andme; Co</p>')).toBe('Ben &andme; Co');
    });

    it('leaves an out-of-range numeric reference as written', () => {
      expect(htmlToPlainText('<p>&#1114112;</p>')).toBe('&#1114112;');
    });

    it('decodes after the tags are removed, so escaped markup stays text', () => {
      // Decoding first would turn this into a tag the tag pass has already gone
      // past, and the address would vanish from the description.
      expect(htmlToPlainText('<p>Write to &lt;jobs@example.com&gt;</p>')).toBe(
        'Write to <jobs@example.com>',
      );
    });
  });

  describe('plain-text input', () => {
    it('keeps the line structure of a description that is not markup', () => {
      const text = 'Requirements:\n- 0-2 years\n- A degree';
      expect(htmlToPlainText(text)).toBe(text);
    });

    it('does not mistake an angle-bracketed address for markup', () => {
      expect(htmlToPlainText('Apply to <jobs@example.com>\nBerlin')).toBe(
        'Apply to <jobs@example.com>\nBerlin',
      );
    });

    it('still normalizes whitespace and bullets', () => {
      const text = `Stack:\tNode.js\n\n\n${ch(0x2022)} Write tests   `;
      expect(htmlToPlainText(text)).toBe('Stack: Node.js\n\n- Write tests');
    });
  });

  it('produces text that is stable under re-normalization', () => {
    // Conversion runs exactly once, where a raw payload becomes a JobPosting, so
    // what has to hold is that normalizing the stored result changes nothing.
    const html =
      `<div><h2>Junior Dev</h2><ul><li>0${EN_DASH}2 years</li></ul>` +
      `<p>We${RIGHT_SINGLE_QUOTE}re hiring.</p></div>`;
    const once = htmlToPlainText(html);
    expect(once).toBe(
      `Junior Dev\n\n- 0${EN_DASH}2 years\n\nWe${RIGHT_SINGLE_QUOTE}re hiring.`,
    );
    expect(htmlToPlainText(once)).toBe(once);
  });
});
