import { Test } from '@nestjs/testing';
import { EmploymentType, WorkplaceType } from '@prisma/client';
import { JobAttributesService } from './job-attributes.service';
import { NormalizationModule } from './normalization.module';

describe('JobAttributesService', () => {
  let service: JobAttributesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NormalizationModule],
    }).compile();

    service = moduleRef.get(JobAttributesService);
  });

  it('resolves from the module', () => {
    expect(service).toBeInstanceOf(JobAttributesService);
  });

  describe('against the fixture source payloads', () => {
    // The values the fixture adapter serves, so M5.4 wires this stage to input it
    // has already been checked against. `declared` is what the adapter maps out of
    // the payload's own `workplace` / `employmentType` fields; the expectations
    // below are what the text alone yields, which is what a source publishing no
    // structured field would get.
    const cases: ReadonlyArray<
      readonly [
        string,
        string,
        string,
        WorkplaceType | null,
        EmploymentType | null,
        readonly string[],
      ]
    > = [
      [
        'Junior Backend Developer (m/f/d)',
        'Berlin, Germany',
        'We are looking for a Junior Backend Developer to join our platform team. This is an entry level position and recent graduates are welcome. 0-2 years of professional experience. Training provided. Stack: Java, Spring Boot, PostgreSQL.',
        null,
        null,
        ['java', 'postgresql', 'spring', 'spring-boot'],
      ],
      [
        'Graduate Software Engineer',
        'Dublin, Ireland',
        'Graduate programme for career starters. No experience required beyond a degree or equivalent portfolio. Structured mentoring for the first 12 months. TypeScript, Node.js, PostgreSQL.',
        null,
        null,
        ['nodejs', 'postgresql', 'typescript'],
      ],
      [
        'Werkstudent Softwareentwicklung (m/w/d)',
        'Munich, Germany',
        'Wir suchen Berufseinsteiger und Studierende. Keine Berufserfahrung erforderlich. Einarbeitung wird gestellt. Technologien: Python, Django, PostgreSQL.',
        null,
        EmploymentType.WORKING_STUDENT,
        ['django', 'postgresql', 'python'],
      ],
      [
        'Software Developer',
        'Remote, Germany',
        'Software Developer for our integrations team. You will work across our API surface. Familiarity with REST and relational databases expected. The posting does not state a required number of years.',
        WorkplaceType.REMOTE,
        null,
        [],
      ],
      [
        'Praktikum Softwareentwicklung',
        'Cologne, Germany',
        'Praktikum fuer Studierende der Informatik. 0 Jahre Berufserfahrung. Betreuung durch erfahrene Entwickler. Java, Spring.',
        null,
        EmploymentType.INTERNSHIP,
        ['java', 'spring'],
      ],
      [
        'Entry Level Frontend Developer',
        'Lisbon, Portugal',
        'Entry level frontend role. 0-1 years experience. We provide a six week onboarding programme. Angular, TypeScript, RxJS.',
        null,
        null,
        ['angular', 'rxjs', 'typescript'],
      ],
    ];

    it.each(cases)(
      '%s',
      (
        title,
        location,
        description,
        expectedWorkplace,
        expectedEmployment,
        expectedTechnologies,
      ) => {
        expect(
          service.detectWorkplaceType({ title, location, description }),
        ).toBe(expectedWorkplace);
        expect(service.detectEmploymentType({ title, description })).toBe(
          expectedEmployment,
        );
        expect(service.extractTechnologies(title, description)).toEqual([
          ...expectedTechnologies,
        ]);
      },
    );
  });

  it('takes the structured value the adapter mapped out of a payload', () => {
    // fx-001 declares HYBRID in a field its prose never mentions. Losing that to
    // text detection would throw away the employer's own answer.
    expect(
      service.detectWorkplaceType({
        title: 'Junior Backend Developer (m/f/d)',
        location: 'Berlin, Germany',
        description: 'We are looking for a Junior Backend Developer.',
        declared: WorkplaceType.HYBRID,
      }),
    ).toBe(WorkplaceType.HYBRID);
  });
});
