import { EmploymentType } from '@prisma/client';
import { detectEmploymentType } from './employment-type';

describe('detectEmploymentType', () => {
  it('detects a working-student role', () => {
    expect(
      detectEmploymentType({
        title: 'Werkstudent Softwareentwicklung (m/w/d)',
      }),
    ).toBe(EmploymentType.WORKING_STUDENT);
    expect(detectEmploymentType({ title: 'Working Student — Backend' })).toBe(
      EmploymentType.WORKING_STUDENT,
    );
  });

  it('detects an internship', () => {
    expect(
      detectEmploymentType({ title: 'Praktikum Softwareentwicklung' }),
    ).toBe(EmploymentType.INTERNSHIP);
    expect(
      detectEmploymentType({ title: 'Software Engineering Internship' }),
    ).toBe(EmploymentType.INTERNSHIP);
    expect(detectEmploymentType({ title: 'Pflichtpraktikum Informatik' })).toBe(
      EmploymentType.INTERNSHIP,
    );
  });

  it('detects a contract role', () => {
    expect(
      detectEmploymentType({
        title: 'Backend Developer',
        description: 'Freelance engagement for six months.',
      }),
    ).toBe(EmploymentType.CONTRACT);
    expect(
      detectEmploymentType({
        description: 'Die Zusammenarbeit erfolgt auf Werkvertrag.',
      }),
    ).toBe(EmploymentType.CONTRACT);
  });

  it('detects part time and full time', () => {
    expect(detectEmploymentType({ title: 'Part-time Junior Developer' })).toBe(
      EmploymentType.PART_TIME,
    );
    expect(detectEmploymentType({ description: 'Teilzeit, 20 Stunden.' })).toBe(
      EmploymentType.PART_TIME,
    );
    expect(
      detectEmploymentType({ description: 'Vollzeit in Festanstellung.' }),
    ).toBe(EmploymentType.FULL_TIME);
    expect(
      detectEmploymentType({ description: 'This is a full-time position.' }),
    ).toBe(EmploymentType.FULL_TIME);
  });

  it('lets the narrower arrangement win', () => {
    // A Werkstudent posting says "Teilzeit" because that is what it legally is,
    // and an internship posting often says "Vollzeit" for the same reason.
    expect(
      detectEmploymentType({
        title: 'Werkstudent (m/w/d) in Teilzeit',
        description: 'Teilzeit, 20 Stunden pro Woche.',
      }),
    ).toBe(EmploymentType.WORKING_STUDENT);
    expect(
      detectEmploymentType({
        description: 'Praktikum in Vollzeit für sechs Monate.',
      }),
    ).toBe(EmploymentType.INTERNSHIP);
  });

  it('prefers the title over the description', () => {
    expect(
      detectEmploymentType({
        title: 'Praktikum Frontend',
        description: 'Vollzeit über sechs Monate, 40 Stunden pro Woche.',
      }),
    ).toBe(EmploymentType.INTERNSHIP);
  });

  it('does not read German "intern" as an internship', () => {
    expect(
      detectEmploymentType({
        title: 'Softwareentwickler (m/w/d)',
        description:
          'Sie optimieren interne Prozesse und arbeiten intern eng zusammen.',
      }),
    ).toBeNull();
  });

  it('ignores a negated mention', () => {
    expect(
      detectEmploymentType({
        title: 'Junior Developer',
        description: 'This is not an internship — it is a permanent position.',
      }),
    ).toBe(EmploymentType.FULL_TIME);
  });

  it('leaves an arrangement the enum has no member for as null', () => {
    // Ausbildung is a real German arrangement with no EmploymentType member.
    // Forcing it into the nearest one would be worse than not stating it.
    expect(
      detectEmploymentType({
        title: 'Ausbildung zum Fachinformatiker (m/w/d)',
      }),
    ).toBeNull();
  });

  it('lets a value declared by the source win over the text', () => {
    expect(
      detectEmploymentType({
        title: 'Praktikum Frontend',
        declared: EmploymentType.FULL_TIME,
      }),
    ).toBe(EmploymentType.FULL_TIME);
  });

  it('defaults to null when the posting says nothing', () => {
    expect(
      detectEmploymentType({
        title: 'Software Developer',
        description: 'You will work across our API surface.',
      }),
    ).toBeNull();
    expect(detectEmploymentType({})).toBeNull();
    expect(detectEmploymentType({ title: null, description: null })).toBeNull();
  });
});
