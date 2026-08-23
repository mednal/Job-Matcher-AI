import { SEED_JOBS } from '../../../prisma/seed-data';
import { EXPERIENCE_CORPUS } from './__fixtures__/experience-corpus';
import { extractExperience } from './experience';

describe('extractExperience', () => {
  describe('the fixture corpus', () => {
    it.each(EXPERIENCE_CORPUS)('$name', (testCase) => {
      const result = extractExperience(testCase.text);

      expect(result.minYears).toBe(testCase.minYears);
      expect(result.maxYears).toBe(testCase.maxYears);

      if (testCase.evidence) {
        expect(result.mentions.map((mention) => mention.text)).toEqual(
          testCase.evidence,
        );
      }
    });

    // The excerpt is evidence, and evidence that was rewritten is worthless (M8.2
    // makes this a hard requirement). Every mention must be exactly the slice of the
    // input its own offset points at.
    it('every excerpt is a verbatim slice at its own offset', () => {
      for (const testCase of EXPERIENCE_CORPUS) {
        for (const mention of extractExperience(testCase.text).mentions) {
          expect(
            testCase.text.slice(
              mention.index,
              mention.index + mention.text.length,
            ),
          ).toBe(mention.text);
        }
      }
    });
  });

  describe('the seeded corpus', () => {
    // prisma/seed-data.ts carries hand-written minYears/maxYears on ten jobs, and
    // Phases 6–8 are checked against them. Nine state their requirement as a number
    // and must come back byte-identical; the tenth is the documented exception below.
    const PHRASE_ONLY_SEEDS: ReadonlyMap<
      string,
      { minYears: null; maxYears: null }
    > = new Map([
      // "No experience required" with no figure anywhere. The seeded 0/1 is a
      // judgement made from that phrase, and phrases are M8.2's evidence, not this
      // stage's — reading a number here would be inventing one.
      ['Junior QA Engineer', { minYears: null, maxYears: null }],
    ]);

    it.each(SEED_JOBS)('$title', (job) => {
      const expected = PHRASE_ONLY_SEEDS.get(job.title) ?? {
        minYears: job.classification.minYears,
        maxYears: job.classification.maxYears,
      };
      const result = extractExperience(job.description);

      expect({
        minYears: result.minYears,
        maxYears: result.maxYears,
      }).toEqual(expected);
    });

    // Eight state a figure; the other two ("the number of years on your CV" and the
    // QA posting's "No experience required") state none, and must produce none.
    it('finds a numeric statement in exactly eight of the ten seeded jobs', () => {
      const numeric = SEED_JOBS.filter(
        (job) => extractExperience(job.description).mentions.length > 0,
      );

      expect(numeric).toHaveLength(8);
    });
  });

  describe('aggregation across mentions', () => {
    it('takes the strictest floor stated anywhere in the text', () => {
      const result = extractExperience(
        [
          'Entry level friendly: 0-2 years of experience is fine.',
          '',
          'You must have at least 6 years of professional experience.',
        ].join('\n'),
      );

      expect(result.minYears).toBe(6);
      expect(result.mentions).toHaveLength(2);
    });

    it('drops a ceiling when another mention is open-ended', () => {
      const result = extractExperience(
        'Up to 2 years of experience is welcome, but 5+ years of experience is required for the senior track.',
      );

      expect(result).toMatchObject({ minYears: 5, maxYears: null });
    });

    // DATABASE.md §5: CHECK ("minYears" IS NULL OR "maxYears" IS NULL OR
    // "minYears" <= "maxYears"). A pair this stage cannot store is not emitted.
    it('never returns a ceiling below the floor', () => {
      const result = extractExperience(
        'We ask for at least 5 years of professional experience. Applications from candidates with less than 2 years of experience are also read.',
      );

      expect(result.minYears).toBe(5);
      expect(result.maxYears).toBeNull();
    });

    it('keeps a ceiling when nothing is open-ended', () => {
      const result = extractExperience(
        'Open to 0-1 years of experience, and we also consider up to 3 years of experience.',
      );

      expect(result).toMatchObject({ minYears: 0, maxYears: 3 });
    });
  });

  describe('absent and unusable input', () => {
    it.each([[null], [undefined], [''], ['   ']])(
      'returns no requirement for %p',
      (input) => {
        expect(extractExperience(input)).toEqual({
          minYears: null,
          maxYears: null,
          mentions: [],
        });
      },
    );

    it('ignores an implausible figure', () => {
      expect(extractExperience('99 years of experience.').minYears).toBeNull();
    });
  });

  describe('determinism', () => {
    it('returns the same result for the same text', () => {
      const text = SEED_JOBS[0].description;

      expect(extractExperience(text)).toEqual(extractExperience(text));
    });
  });
});
