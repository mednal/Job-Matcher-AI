/**
 * The posting's language, named rather than coded: `de` reads as "German".
 *
 * It matters on this page and not on a result card, because the detail page is
 * where the body itself is shown — a reader who cannot read German should learn
 * that from a label rather than from the first paragraph.
 *
 * `Intl.DisplayNames` is used instead of a hand-kept table: the language column is
 * open (`normalization/language.ts` detects whatever the source wrote in), so a
 * table would answer for the two languages the fixtures happen to use and show a
 * raw code for the third. When the runtime has no name for a tag it falls back to
 * the tag itself, and this returns the uppercased code rather than a lowercase
 * fragment that looks like a defect.
 */
let displayNames: Intl.DisplayNames | null | undefined;

function languageNames(): Intl.DisplayNames | null {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      // A build without the language display data. The code itself still reads.
      displayNames = null;
    }
  }
  return displayNames;
}

export function languageLabel(code: string | null | undefined): string | null {
  const tag = code?.trim();
  if (!tag) {
    return null;
  }

  try {
    const named = languageNames()?.of(tag);
    if (named && named.toLowerCase() !== tag.toLowerCase()) {
      return named;
    }
  } catch {
    // `of()` throws a RangeError on an ill-formed tag; the code is still shown.
  }

  return tag.toUpperCase();
}
