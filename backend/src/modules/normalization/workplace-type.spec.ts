import { WorkplaceType } from '@prisma/client';
import { detectWorkplaceType } from './workplace-type';

describe('detectWorkplaceType', () => {
  it('reads a remote location', () => {
    expect(
      detectWorkplaceType({
        title: 'Software Developer',
        location: 'Remote, Germany',
      }),
    ).toBe(WorkplaceType.REMOTE);
  });

  it('reads remote phrasing in either language', () => {
    expect(
      detectWorkplaceType({ description: 'This role is 100% remote.' }),
    ).toBe(WorkplaceType.REMOTE);
    expect(
      detectWorkplaceType({
        description: 'Homeoffice ist jederzeit moeglich.',
      }),
    ).toBe(WorkplaceType.REMOTE);
    expect(
      detectWorkplaceType({
        description: 'Mobiles Arbeiten wird unterstützt.',
      }),
    ).toBe(WorkplaceType.REMOTE);
  });

  it('reads onsite phrasing in either language', () => {
    expect(
      detectWorkplaceType({ description: 'You will work on-site every day.' }),
    ).toBe(WorkplaceType.ONSITE);
    expect(
      detectWorkplaceType({ description: 'Die Arbeit findet vor Ort statt.' }),
    ).toBe(WorkplaceType.ONSITE);
    expect(
      detectWorkplaceType({ description: 'Präsenz wird vorausgesetzt.' }),
    ).toBe(WorkplaceType.ONSITE);
  });

  it('reads an explicit hybrid statement', () => {
    expect(
      detectWorkplaceType({ description: 'We work in a hybrid model.' }),
    ).toBe(WorkplaceType.HYBRID);
    expect(
      detectWorkplaceType({ description: 'Teilweise remote nach Absprache.' }),
    ).toBe(WorkplaceType.HYBRID);
  });

  it('reads a split week stated as a day count', () => {
    expect(
      detectWorkplaceType({
        description: 'You spend 2 days per week in the office.',
      }),
    ).toBe(WorkplaceType.HYBRID);
    expect(detectWorkplaceType({ description: '3 Tage vor Ort.' })).toBe(
      WorkplaceType.HYBRID,
    );
    expect(
      detectWorkplaceType({ description: '2 Tage remote pro Woche.' }),
    ).toBe(WorkplaceType.HYBRID);
  });

  it('treats remote and onsite evidence together as hybrid', () => {
    // The damaging error is the other way round: telling a candidate a job is
    // fully remote when it needs them in the office three days a week.
    expect(
      detectWorkplaceType({
        description: 'Mostly remote, with occasional on-site workshops.',
      }),
    ).toBe(WorkplaceType.HYBRID);
  });

  it('ignores a negated remote mention', () => {
    expect(
      detectWorkplaceType({
        title: 'Backend Developer',
        location: 'Berlin, Germany',
        description: 'There is no remote work for this position.',
      }),
    ).toBeNull();
    expect(
      detectWorkplaceType({ description: 'Kein Homeoffice in dieser Rolle.' }),
    ).toBeNull();
  });

  it('counts a later unnegated mention despite an earlier negated one', () => {
    expect(
      detectWorkplaceType({
        description:
          'No remote work during the probation period. Remote afterwards.',
      }),
    ).toBe(WorkplaceType.REMOTE);
  });

  it('prefers the title and location over the description', () => {
    expect(
      detectWorkplaceType({
        title: 'Frontend Developer — Remote',
        location: 'Lisbon, Portugal',
        description: 'Our office has a roof terrace and a coffee bar.',
      }),
    ).toBe(WorkplaceType.REMOTE);
  });

  it('lets a value declared by the source win over the text', () => {
    expect(
      detectWorkplaceType({
        description: 'This role is fully remote.',
        declared: WorkplaceType.ONSITE,
      }),
    ).toBe(WorkplaceType.ONSITE);
  });

  it('defaults to null when the posting says nothing', () => {
    expect(
      detectWorkplaceType({
        title: 'Junior Backend Developer (m/f/d)',
        location: 'Berlin, Germany',
        description: 'You will join our platform team and learn a lot.',
      }),
    ).toBeNull();
    expect(detectWorkplaceType({})).toBeNull();
    expect(
      detectWorkplaceType({ title: null, location: null, description: null }),
    ).toBeNull();
  });
});
