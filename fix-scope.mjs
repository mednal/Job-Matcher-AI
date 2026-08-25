import fs from 'node:fs';
const p = 'docs/PRODUCT.md';
let s = fs.readFileSync(p, 'utf8');
const anchor = 'The initial product focuses on software-development jobs.\n';
if (!s.includes(anchor)) throw new Error('anchor not found');
if (!s.includes('no geographic restriction')) {
  s = s.replace(anchor, anchor + `
There is **no geographic restriction**. JuniorJob AI is a global search surface: jobs are
aggregated from every supported source regardless of country, and the user narrows the
result set by location, country and posting language through filters, the way a general
job board does. Examples elsewhere in this document that name a single country are
illustrations of one search, not a statement of market scope.
`);
}
fs.writeFileSync(p, s);
console.log('inserted');
