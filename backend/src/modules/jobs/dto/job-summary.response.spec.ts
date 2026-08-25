import {
  JobSummaryResponse,
  JobSummaryRow,
  SUMMARY_SIGNAL_LIMIT,
  topSignals,
} from './job-summary.response';
import { SignalResponse } from './job-detail.response';

function signal(
  code: string,
  weight: number,
  evidence = `evidence for ${code}`,
): SignalResponse {
  const response = new SignalResponse();
  response.code = code;
  response.weight = weight;
  response.evidence = evidence;
  return response;
}

function row(overrides: Partial<JobSummaryRow> = {}): JobSummaryRow {
  return {
    id: 'job-1',
    title: 'Junior Java Developer',
    companyName: 'Example GmbH',
    location: 'Berlin',
    countryCode: 'DE',
    workplaceType: 'HYBRID',
    employmentType: 'FULL_TIME',
    language: 'en',
    technologies: ['java'],
    postedAt: new Date('2026-08-19T00:00:00.000Z'),
    effectivePostedAt: new Date('2026-08-19T00:00:00.000Z'),
    juniorLevel: 'ENTRY_LEVEL',
    juniorScore: 94,
    requiredMinYears: 0,
    requiredMaxYears: 1,
    ...overrides,
  };
}

describe('topSignals', () => {
  it('orders by absolute weight, strongest first', () => {
    const kept = topSignals(
      [signal('a', -10), signal('b', -40), signal('c', -25)],
      3,
    );

    expect(kept.map((entry) => entry.code)).toEqual(['b', 'c', 'a']);
  });

  it('caps the list at the limit', () => {
    const kept = topSignals([signal('a', 30), signal('b', 20)], 1);

    expect(kept.map((entry) => entry.code)).toEqual(['a']);
  });

  // Equal weights are common — the table assigns several codes the same number —
  // so the tie-break has to be deterministic or two requests for one job would
  // show different evidence on different pages.
  it('is stable, so equal weights keep extraction order', () => {
    const kept = topSignals(
      [signal('first', 15), signal('second', 15), signal('third', 15)],
      2,
    );

    expect(kept.map((entry) => entry.code)).toEqual(['first', 'second']);
  });

  it('returns nothing for a non-positive limit', () => {
    expect(topSignals([signal('a', 30)], 0)).toEqual([]);
  });
});

describe('JobSummaryResponse.fromEntity', () => {
  const positive = [signal('ENTRY_LEVEL_STATED', 30)];
  const negative = [signal('REQUIRES_5_PLUS_YEARS', -40)];

  it('reads the nested shape a Prisma select produces', () => {
    const response = JobSummaryResponse.fromEntity(
      row({
        classifications: [
          { positiveSignals: positive, negativeSignals: negative },
        ],
      }),
      1,
    );

    expect(response.positiveSignals).toEqual(positive);
    expect(response.negativeSignals).toEqual(negative);
  });

  it('reads the flat shape the search SQL returns, identically', () => {
    const nested = JobSummaryResponse.fromEntity(
      row({
        classifications: [
          { positiveSignals: positive, negativeSignals: negative },
        ],
      }),
      1,
    );
    const flat = JobSummaryResponse.fromEntity(
      row({ positiveSignals: positive, negativeSignals: negative }),
      1,
    );

    expect(flat).toEqual(nested);
  });

  it('serves empty arrays for a job that has never been classified', () => {
    const response = JobSummaryResponse.fromEntity(row(), 1);

    expect(response.positiveSignals).toEqual([]);
    expect(response.negativeSignals).toEqual([]);
  });

  it('caps each polarity at SUMMARY_SIGNAL_LIMIT', () => {
    const many = [
      signal('a', -40),
      signal('b', -30),
      signal('c', -20),
      signal('d', -10),
    ];

    const response = JobSummaryResponse.fromEntity(
      row({ positiveSignals: many, negativeSignals: many }),
      1,
    );

    expect(response.positiveSignals).toHaveLength(SUMMARY_SIGNAL_LIMIT);
    expect(response.negativeSignals).toHaveLength(SUMMARY_SIGNAL_LIMIT);
    expect(response.negativeSignals.map((entry) => entry.code)).toEqual([
      'a',
      'b',
    ]);
  });

  // The columns are JSON with no database constraint (docs/DATABASE.md §4.1),
  // so a malformed entry must cost that entry and not the whole card.
  it('drops malformed entries rather than failing the job', () => {
    const response = JobSummaryResponse.fromEntity(
      row({
        positiveSignals: [
          { code: 'ENTRY_LEVEL_STATED' },
          signal('RECENT_GRADUATES_WELCOME', 25),
        ],
        negativeSignals: 'not an array',
      }),
      1,
    );

    expect(response.positiveSignals.map((entry) => entry.code)).toEqual([
      'RECENT_GRADUATES_WELCOME',
    ]);
    expect(response.negativeSignals).toEqual([]);
  });
});

/**
 * M11.10 — the posting that titles itself junior and then states otherwise.
 * This is the product's headline claim, so the boundaries are pinned rather
 * than assumed.
 */
describe('JobSummaryResponse.fromEntity — juniorTitleContradicted', () => {
  const flag = (title: string, requiredMinYears: number | null) =>
    JobSummaryResponse.fromEntity(row({ title, requiredMinYears }), 1)
      .juniorTitleContradicted;

  it('is set for a junior title over an experienced floor', () => {
    expect(flag('Junior Java Developer', 5)).toBe(true);
    expect(flag('Graduate Software Engineer (m/w/d)', 3)).toBe(true);
    expect(flag('Werkstudentin Backend', 4)).toBe(true);
  });

  it('is clear at two years, the band this product is built for', () => {
    expect(flag('Junior Java Developer', 2)).toBe(false);
    expect(flag('Junior Java Developer', 0)).toBe(false);
  });

  // Absence of a figure is not evidence of a contradiction.
  it('is clear when the posting states no minimum at all', () => {
    expect(flag('Junior Java Developer', null)).toBe(false);
  });

  // An honest senior posting is not a contradiction; it is already kept out of
  // the default result set by its level.
  it('is clear for a title that never claimed to be junior', () => {
    expect(flag('Senior Platform Engineer', 5)).toBe(false);
    expect(flag('Head of Engineering', 10)).toBe(false);
  });

  // The pattern's own boundaries, inherited from level-rules: `intern` must not
  // match `internal`.
  it('does not fire on a word that merely contains a junior term', () => {
    expect(flag('Internal Tools Engineer', 5)).toBe(false);
  });
});
