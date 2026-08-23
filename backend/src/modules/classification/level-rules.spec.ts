import { decideLevel, type LevelInput } from './level-rules';
import { createSignal, type Signal, type SignalCode } from './signal';

const signals = (...codes: SignalCode[]): Signal[] =>
  codes.map((code) => createSignal(code, 'evidence'));

const input = (overrides: Partial<LevelInput>): LevelInput => ({
  title: null,
  minYears: null,
  maxYears: null,
  positiveSignals: [],
  negativeSignals: [],
  ...overrides,
});

/** Everything the phrase dictionary can say in a posting's favour. */
const EVERY_POSITIVE: SignalCode[] = [
  'ENTRY_LEVEL_STATED',
  'CAREER_STARTER_WELCOME',
  'NO_EXPERIENCE_REQUIRED',
  'GRADUATES_WELCOME',
  'GRADUATE_PROGRAMME',
  'TRAINING_PROVIDED',
  'MENTORING_OFFERED',
  'INTERNSHIP_COUNTS',
  'YEARS_NOT_REQUIRED',
];

describe('decideLevel', () => {
  describe('a stated floor of three years or more', () => {
    it('is CLEARLY_EXPERIENCED from five years up', () => {
      for (const minYears of [5, 8, 12]) {
        expect(
          decideLevel(
            input({
              minYears,
              negativeSignals: signals('REQUIRES_5_PLUS_YEARS'),
            }),
          ),
        ).toBe('CLEARLY_EXPERIENCED');
      }
    });

    it('is EXPERIENCED at three and four', () => {
      for (const minYears of [3, 4]) {
        expect(
          decideLevel(
            input({
              minYears,
              negativeSignals: signals('REQUIRES_3_PLUS_YEARS'),
            }),
          ),
        ).toBe('EXPERIENCED');
      }
    });

    // The case the whole phase exists for, stated as a rule rather than left to a
    // corpus text: no amount of junior wording moves a posting that asks for five
    // years, because a junior who applies to it has wasted their time either way.
    it('is not moved by every positive phrase in the dictionary', () => {
      expect(
        decideLevel(
          input({
            title: 'Junior Developer',
            minYears: 5,
            positiveSignals: signals(...EVERY_POSITIVE),
            negativeSignals: signals('REQUIRES_5_PLUS_YEARS'),
          }),
        ),
      ).toBe('CLEARLY_EXPERIENCED');

      expect(
        decideLevel(
          input({
            title: 'Junior Developer',
            minYears: 3,
            positiveSignals: signals(...EVERY_POSITIVE),
            negativeSignals: signals('REQUIRES_3_PLUS_YEARS'),
          }),
        ),
      ).toBe('EXPERIENCED');
    });

    it('deepens to CLEARLY_EXPERIENCED when the responsibilities are senior too', () => {
      expect(
        decideLevel(
          input({
            minYears: 3,
            negativeSignals: signals(
              'REQUIRES_3_PLUS_YEARS',
              'TEAM_MANAGEMENT',
              'LEAD_RESPONSIBILITIES',
            ),
          }),
        ),
      ).toBe('CLEARLY_EXPERIENCED');
    });

    // Without this, the -35 the floor already carries would combine with a single
    // -15 concern and push a plain "3+ years" posting a second level down for
    // saying one thing.
    it('does not count the figure twice', () => {
      expect(
        decideLevel(
          input({
            minYears: 3,
            negativeSignals: signals(
              'REQUIRES_3_PLUS_YEARS',
              'OWNERSHIP_OF_EXISTING_SERVICES',
            ),
          }),
        ),
      ).toBe('EXPERIENCED');
    });
  });

  describe('a stated ceiling of two years or less', () => {
    it('is ENTRY_LEVEL when the posting also says no experience is needed', () => {
      expect(
        decideLevel(
          input({
            minYears: 0,
            maxYears: 1,
            positiveSignals: signals('ZERO_TO_ONE_YEARS', 'ENTRY_LEVEL_STATED'),
          }),
        ),
      ).toBe('ENTRY_LEVEL');
    });

    it('is LIKELY_ENTRY_LEVEL on softer positives alone', () => {
      expect(
        decideLevel(
          input({
            minYears: 0,
            maxYears: 2,
            positiveSignals: signals(
              'ZERO_TO_TWO_YEARS',
              'GRADUATE_PROGRAMME',
              'MENTORING_OFFERED',
              'GRADUATES_WELCOME',
            ),
          }),
        ),
      ).toBe('LIKELY_ENTRY_LEVEL');
    });

    it('is demoted one step by a single senior responsibility', () => {
      expect(
        decideLevel(
          input({
            minYears: 0,
            maxYears: 1,
            positiveSignals: signals('ZERO_TO_ONE_YEARS', 'ENTRY_LEVEL_STATED'),
            negativeSignals: signals('TEAM_LEAD'),
          }),
        ),
      ).toBe('LIKELY_ENTRY_LEVEL');
    });

    it('is left AMBIGUOUS when the responsibilities describe another job', () => {
      expect(
        decideLevel(
          input({
            minYears: 0,
            maxYears: 1,
            positiveSignals: signals('ZERO_TO_ONE_YEARS', 'ENTRY_LEVEL_STATED'),
            negativeSignals: signals(
              'TEAM_MANAGEMENT',
              'LEAD_RESPONSIBILITIES',
            ),
          }),
        ),
      ).toBe('AMBIGUOUS');
    });

    // The mirror of the rule above: phrase evidence adjusts within the side the
    // figure chose and never carries a posting across it.
    it('never reaches the experienced side, however many concerns are found', () => {
      expect(
        decideLevel(
          input({
            title: 'Senior Staff Engineer',
            minYears: 0,
            maxYears: 2,
            positiveSignals: signals('ZERO_TO_TWO_YEARS'),
            negativeSignals: signals(
              'TEAM_MANAGEMENT',
              'TEAM_LEAD',
              'LEAD_RESPONSIBILITIES',
              'SENIOR_RESPONSIBILITIES',
              'EXTENSIVE_PROFESSIONAL_EXPERIENCE',
              'ON_CALL_EXPECTED',
            ),
          }),
        ),
      ).toBe('AMBIGUOUS');
    });
  });

  describe('no usable figure', () => {
    it('reaches ENTRY_LEVEL on a decisive statement with corroboration', () => {
      expect(
        decideLevel(
          input({
            positiveSignals: signals(
              'ENTRY_LEVEL_STATED',
              'NO_EXPERIENCE_REQUIRED',
              'TRAINING_PROVIDED',
            ),
          }),
        ),
      ).toBe('ENTRY_LEVEL');
    });

    it('stops at LIKELY_ENTRY_LEVEL without one, however much weight is present', () => {
      expect(
        decideLevel(
          input({
            positiveSignals: signals(
              'GRADUATES_WELCOME',
              'GRADUATE_PROGRAMME',
              'TRAINING_PROVIDED',
              'MENTORING_OFFERED',
              'INTERNSHIP_COUNTS',
            ),
          }),
        ),
      ).toBe('LIKELY_ENTRY_LEVEL');
    });

    it('bands the negative side by the concerns named', () => {
      expect(
        decideLevel(input({ negativeSignals: signals('ON_CALL_EXPECTED') })),
      ).toBe('AMBIGUOUS');

      expect(
        decideLevel(
          input({
            negativeSignals: signals(
              'EXTENSIVE_PROFESSIONAL_EXPERIENCE',
              'LEAD_RESPONSIBILITIES',
            ),
          }),
        ),
      ).toBe('EXPERIENCED');

      expect(
        decideLevel(
          input({
            negativeSignals: signals(
              'SENIOR_RESPONSIBILITIES',
              'LEAD_RESPONSIBILITIES',
              'TEAM_MANAGEMENT',
              'ON_CALL_EXPECTED',
            ),
          }),
        ),
      ).toBe('CLEARLY_EXPERIENCED');
    });

    it('is AMBIGUOUS when the two sides cancel out', () => {
      expect(
        decideLevel(
          input({
            positiveSignals: signals('YEARS_NOT_REQUIRED'),
            negativeSignals: signals(
              'END_TO_END_OWNERSHIP',
              'ON_CALL_EXPECTED',
            ),
          }),
        ),
      ).toBe('AMBIGUOUS');
    });
  });

  describe('the title', () => {
    const JUNIOR_TITLES = [
      'Junior Software Engineer',
      'Jr. Developer',
      'Graduate Software Engineer',
      'Software Engineering Trainee',
      'Backend Intern',
      'Werkstudent Softwareentwicklung (m/w/d)',
      'Praktikant Backend (m/w/d)',
      'Berufseinsteiger Softwareentwicklung',
    ];

    const SENIOR_TITLES = [
      'Senior Software Engineer',
      'Lead Platform Engineer',
      'Principal Engineer',
      'Staff Software Engineer',
      'Head of Engineering',
      'Engineering Manager',
      'Solution Architect',
      'Teamleiter Softwareentwicklung (m/w/d)',
    ];

    it('breaks a tie one step towards the junior side', () => {
      for (const title of JUNIOR_TITLES) {
        expect(decideLevel(input({ title }))).toBe('LIKELY_ENTRY_LEVEL');
      }
    });

    it('breaks a tie one step towards the experienced side', () => {
      for (const title of SENIOR_TITLES) {
        expect(decideLevel(input({ title }))).toBe('EXPERIENCED');
      }
    });

    it('decides nothing when it says both, or neither', () => {
      for (const title of [
        'Junior Team Lead',
        'Software Engineer',
        'Backend Developer (m/w/d)',
        '',
      ]) {
        expect(decideLevel(input({ title }))).toBe('AMBIGUOUS');
      }
    });

    // "The title is one input among many and never decides the outcome alone"
    // (§6.4). It is read only where the body reached no verdict, and even then it
    // cannot produce a confident answer in either direction.
    it('never produces ENTRY_LEVEL or CLEARLY_EXPERIENCED on its own', () => {
      for (const title of [...JUNIOR_TITLES, ...SENIOR_TITLES]) {
        const level = decideLevel(input({ title }));
        expect(level).not.toBe('ENTRY_LEVEL');
        expect(level).not.toBe('CLEARLY_EXPERIENCED');
      }
    });

    it('is not read at all once the body has reached a verdict', () => {
      const body: Partial<LevelInput> = {
        positiveSignals: signals(
          'ENTRY_LEVEL_STATED',
          'NO_EXPERIENCE_REQUIRED',
          'TRAINING_PROVIDED',
        ),
      };

      for (const title of [...SENIOR_TITLES, ...JUNIOR_TITLES, null]) {
        expect(decideLevel(input({ ...body, title }))).toBe('ENTRY_LEVEL');
      }
    });

    it('does not rescue a posting whose figure is decisive', () => {
      for (const title of JUNIOR_TITLES) {
        expect(
          decideLevel(
            input({
              title,
              minYears: 5,
              negativeSignals: signals('REQUIRES_5_PLUS_YEARS'),
            }),
          ),
        ).toBe('CLEARLY_EXPERIENCED');
      }
    });
  });
});
