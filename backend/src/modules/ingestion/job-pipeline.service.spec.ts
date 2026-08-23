import { JobPipelineService } from './job-pipeline.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobClassificationService } from '../classification/job-classification.service';
import { CanonicalJobService } from '../deduplication/canonical-job.service';
import {
  PostingIdentityService,
  type NormalizedPosting,
} from '../deduplication/posting-identity.service';
import { CompanyLocationService } from '../normalization/company-location.service';
import { JobAttributesService } from '../normalization/job-attributes.service';
import { LanguageDetectionService } from '../normalization/language-detection.service';
import { TextNormalizationService } from '../normalization/text-normalization.service';
import type { RawJobFields } from '../sources/source-adapter.types';

/**
 * M5.4 — the stage order, with the real normalization stages (which are pure) and
 * fake persistence, so this runs with no database at all.
 *
 * The normalizers are real on purpose: what this service decides is which value each
 * stage is handed, and substituting them would let a wiring mistake — the raw
 * description passed where the plain-text one belongs, the pre-parse location fed to
 * the workplace detector — pass a green suite.
 */

const SOURCE_ID = 'source-1';

interface Fakes {
  service: JobPipelineService;
  upsert: jest.Mock;
  assign: jest.Mock;
  classify: jest.Mock;
  jobFindUnique: jest.Mock;
}

function harness(
  options: {
    postingOutcome?: string;
    clusterOutcome?: string;
    job?: { id: string; title: string; description: string | null };
  } = {},
): Fakes {
  const {
    postingOutcome = 'CREATED',
    clusterOutcome = 'CREATED',
    job = { id: 'job-1', title: 'Canonical Title', description: 'Canonical.' },
  } = options;

  const upsert = jest.fn().mockResolvedValue({
    postingId: 'posting-1',
    outcome: postingOutcome,
    jobId: null,
    contentHash: 'hash',
  });
  const assign = jest.fn().mockResolvedValue({
    jobId: job.id,
    outcome: clusterOutcome,
    normalizedTitle: 'canonical title',
    dedupHash: 'dedup',
  });
  const classify = jest.fn().mockResolvedValue({
    jobId: job.id,
    classificationId: 'cls-1',
    classifierVersion: 'rules-1.0',
    inputHash: 'input',
    level: 'ENTRY_LEVEL',
    score: 92,
    minYears: 0,
    maxYears: 2,
    outcome: 'CLASSIFIED',
  });
  const jobFindUnique = jest.fn().mockResolvedValue(job);

  const service = new JobPipelineService(
    { job: { findUniqueOrThrow: jobFindUnique } } as unknown as PrismaService,
    new TextNormalizationService(),
    new CompanyLocationService(),
    new JobAttributesService(),
    new LanguageDetectionService(),
    { upsert } as unknown as PostingIdentityService,
    { assign } as unknown as CanonicalJobService,
    { classifyAndPersist: classify } as unknown as JobClassificationService,
  );

  return { service, upsert, assign, classify, jobFindUnique };
}

function fields(overrides: Partial<RawJobFields> = {}): RawJobFields {
  return {
    title: 'Junior Backend Developer (m/w/d)',
    companyName: 'Nordwind Software GmbH',
    location: 'Berlin, Germany',
    description:
      '<p>We are looking for a <b>Junior Backend Developer</b>.</p><ul><li>0-2 years of experience</li><li>Java and Spring Boot</li></ul>',
    ...overrides,
  };
}

function input(overrides: Partial<RawJobFields> = {}) {
  return {
    sourceId: SOURCE_ID,
    externalId: 'fx-001',
    url: 'https://example.com/jobs/fx-001',
    fields: fields(overrides),
  };
}

/** What tier 1 was actually handed. */
function normalized(upsert: jest.Mock): NormalizedPosting {
  return (
    upsert.mock.calls as unknown as unknown[][]
  )[0][0] as NormalizedPosting;
}

describe('JobPipelineService', () => {
  describe('normalization', () => {
    it('hands tier 1 plain text, never the source markup', async () => {
      const { service, upsert } = harness();

      await service.process(input());

      const posting = normalized(upsert);
      expect(posting.description).not.toContain('<');
      expect(posting.description).toContain('Junior Backend Developer');
      expect(posting.description).toContain('0-2 years of experience');
    });

    it('derives the company slug from the normalized company name', async () => {
      const { service, upsert } = harness();

      await service.process(input());

      // M6.2: the legal form is stripped, which is what makes two sources spelling
      // the same employer differently land in one cluster.
      expect(normalized(upsert).companySlug).toBe('nordwind-software');
    });

    it('splits the location into a display value and a country code', async () => {
      const { service, upsert } = harness();

      await service.process(input());

      const posting = normalized(upsert);
      expect(posting.countryCode).toBe('DE');
      expect(posting.location).toBeTruthy();
    });

    it('detects the attributes M6.3 owns', async () => {
      const { service, upsert } = harness();

      await service.process(
        input({
          description:
            'Werkstudent position. Remote work is possible. Stack: Python and Django.',
        }),
      );

      const posting = normalized(upsert);
      expect(posting.workplaceType).toBe('REMOTE');
      expect(posting.technologies).toEqual(
        expect.arrayContaining(['python', 'django']),
      );
    });

    it('lets a declared value outrank the text, per M6.3', async () => {
      const { service, upsert } = harness();

      await service.process(
        input({
          description: 'This role is fully remote.',
          workplaceType: 'ONSITE',
          employmentType: 'INTERNSHIP',
        }),
      );

      const posting = normalized(upsert);
      expect(posting.workplaceType).toBe('ONSITE');
      expect(posting.employmentType).toBe('INTERNSHIP');
    });

    it('detects German from the description', async () => {
      const { service, upsert } = harness();

      await service.process(
        input({
          title: 'Werkstudent Softwareentwicklung',
          description:
            'Wir suchen Berufseinsteiger und Studierende fuer unser Team. Keine Berufserfahrung ist erforderlich, denn die Einarbeitung wird von uns gestellt.',
        }),
      );

      expect(normalized(upsert).language).toBe('de');
    });

    it('falls back to the RawJob date when the mapping produced none', async () => {
      const { service, upsert } = harness();
      const postedAt = new Date('2026-08-20T09:00:00.000Z');

      await service.process({ ...input(), postedAt });

      expect(normalized(upsert).postedAt).toEqual(postedAt);
    });

    it('prefers the mapped date over the RawJob one', async () => {
      const { service, upsert } = harness();
      const mapped = new Date('2026-08-21T09:00:00.000Z');

      await service.process({
        ...input(),
        fields: fields({ postedAt: mapped }),
        postedAt: new Date('2026-08-01T00:00:00.000Z'),
      });

      expect(normalized(upsert).postedAt).toEqual(mapped);
    });
  });

  describe('stage order', () => {
    it('feeds tier 1 output into tiers 2 and 3', async () => {
      const { service, upsert, assign } = harness();
      upsert.mockResolvedValue({
        postingId: 'posting-9',
        outcome: 'UPDATED',
        jobId: 'job-existing',
        contentHash: 'hash',
      });

      await service.process(input());

      expect(assign).toHaveBeenCalledWith(expect.anything(), {
        postingId: 'posting-9',
        jobId: 'job-existing',
      });
    });

    it('classifies the canonical job text, not the posting in hand', async () => {
      const { service, classify, jobFindUnique } = harness({
        job: {
          id: 'job-1',
          title: 'Longest Title From The Cluster',
          description: 'The fullest description any source gave.',
        },
      });

      await service.process(input());

      // M7.4 re-derives these from the whole cluster before this point, so a
      // two-source vacancy is classified on the best text available — and the
      // M8.4 input hash stays a stable cache key across runs.
      expect(jobFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'job-1' } }),
      );
      expect(classify).toHaveBeenCalledWith({
        id: 'job-1',
        title: 'Longest Title From The Cluster',
        description: 'The fullest description any source gave.',
      });
    });

    it('reports every stage outcome for the run counters', async () => {
      const { service } = harness({
        postingOutcome: 'UPDATED',
        clusterOutcome: 'FUZZY_MATCHED',
      });

      const result = await service.process(input());

      expect(result).toEqual({
        postingId: 'posting-1',
        postingOutcome: 'UPDATED',
        jobId: 'job-1',
        clusterOutcome: 'FUZZY_MATCHED',
        classificationOutcome: 'CLASSIFIED',
      });
    });

    it('runs the stages for an unchanged posting too', async () => {
      const { service, upsert, assign, classify } = harness({
        postingOutcome: 'UNCHANGED',
        clusterOutcome: 'ALREADY_CLUSTERED',
      });

      const result = await service.process(input());

      // M5.6 retires a posting by `lastSeenAt`, and the stages are what stamp it.
      // Short-circuiting the unchanged case would retire everything nobody edits.
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledTimes(1);
      expect(classify).toHaveBeenCalledTimes(1);
      expect(result.postingOutcome).toBe('UNCHANGED');
    });
  });

  describe('failures', () => {
    it('propagates a stage failure to the run for counting', async () => {
      const { service, upsert } = harness();
      upsert.mockRejectedValue(new Error('posting has no externalId'));

      await expect(service.process(input())).rejects.toThrow(
        'posting has no externalId',
      );
    });

    it('does not classify when clustering failed', async () => {
      const { service, assign, classify } = harness();
      assign.mockRejectedValue(new Error('no usable title'));

      await expect(service.process(input())).rejects.toThrow('no usable title');
      expect(classify).not.toHaveBeenCalled();
    });
  });
});
