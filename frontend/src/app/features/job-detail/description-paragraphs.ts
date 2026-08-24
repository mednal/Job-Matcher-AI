/**
 * The posting's description body, split into the paragraphs it was written as.
 *
 * The description is plain text — `Job.description` holds whatever the source's
 * body was normalized to (`docs/DATABASE.md` §3), never HTML — so it is split here
 * and bound as text rather than rendered as markup. Nothing from a source is ever
 * put through `innerHTML`, which is the whole reason this returns strings and not
 * a sanitized fragment.
 *
 * Blank lines separate paragraphs; a single newline inside one is left in the
 * string, because a body that lists requirements one per line loses its shape
 * otherwise. The stylesheet renders those with `white-space: pre-line`.
 */
export function descriptionParagraphs(description: string | null | undefined): string[] {
  return (description ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
