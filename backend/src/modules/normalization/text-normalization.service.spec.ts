import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import { NormalizationModule } from './normalization.module';
import { TextNormalizationService } from './text-normalization.service';

const FIXTURE_DIR = join(__dirname, '__fixtures__');

/**
 * `.expected.txt` is compared with its line endings unified. The fixtures are
 * checked in with LF, but a Windows checkout can hand them back as CRLF, and that
 * would fail a test for a reason that has nothing to do with the code.
 */
function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8').replace(/\r\n/g, '\n');
}

describe('TextNormalizationService', () => {
  let service: TextNormalizationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NormalizationModule],
    }).compile();

    service = moduleRef.get(TextNormalizationService);
  });

  it('resolves from the module', () => {
    expect(service).toBeInstanceOf(TextNormalizationService);
  });

  it('treats null and undefined as empty', () => {
    expect(service.toPlainText(null)).toBe('');
    expect(service.toPlainText(undefined)).toBe('');
    expect(service.normalize(null)).toBe('');
  });

  it('normalizes a value without giving it line structure', () => {
    // Titles and company names go through `normalize`, never `toPlainText`.
    expect(service.normalize('  Junior   Developer  ')).toBe(
      'Junior Developer',
    );
  });

  describe('fixture corpus', () => {
    const inputs = readdirSync(FIXTURE_DIR).filter((file) =>
      file.endsWith('.input.html'),
    );

    it('has fixtures to run', () => {
      expect(inputs.length).toBeGreaterThan(0);
    });

    it.each(inputs)('produces the expected text for %s', (input) => {
      const expected = readFixture(
        input.replace('.input.html', '.expected.txt'),
      );
      expect(service.toPlainText(readFixture(input))).toBe(expected);
    });

    it.each(inputs)('produces stable text for %s', (input) => {
      // Stability is what keeps `JobPosting.contentHash` meaningful: the same
      // posting fetched twice must normalize to the same text, and re-normalizing
      // stored text must be a no-op.
      const source = readFixture(input);
      const once = service.toPlainText(source);
      expect(service.toPlainText(source)).toBe(once);
      expect(service.normalize(once)).toBe(once);
    });

    it.each(inputs)('leaves no markup or entity behind in %s', (input) => {
      const text = service.toPlainText(readFixture(input));
      expect(text).not.toMatch(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/);
      expect(text).not.toMatch(/&(amp|nbsp|lt|gt|quot|shy|#\d+);/);
      expect(text).not.toMatch(/\n{3,}/);
      expect(text).not.toMatch(/[ \t]$/m);
    });
  });
});
