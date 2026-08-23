import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  JobClassificationService,
  type ClassificationOutcome,
} from '../classification/job-classification.service';
import {
  CanonicalJobService,
  type ClusterOutcome,
} from '../deduplication/canonical-job.service';
import {
  PostingIdentityService,
  type NormalizedPosting,
  type PostingUpsertOutcome,
} from '../deduplication/posting-identity.service';
import { CompanyLocationService } from '../normalization/company-location.service';
import { JobAttributesService } from '../normalization/job-attributes.service';
import { LanguageDetectionService } from '../normalization/language-detection.service';
import { TextNormalizationService } from '../normalization/text-normalization.service';
import type { RawJobFields } from '../sources/source-adapter.types';

/**
 * M5.4 — the per-posting half of the pipeline (`ARCHITECTURE.md` §6).
 *
 * One posting in, one row of run counters out: normalize → dedupe → classify →
 * score. The stages themselves live in their own modules and this service decides
 * nothing about a posting — it only decides the **order**, which is the part that
 * has to be right in one place. Every arrow points forward: normalization does not
 * know deduplication exists, and classification is handed a `Job` rather than a
 * posting, because by then deduplication has decided which vacancy the posting is.
 *
 * Split out of the run engine deliberately. `RawIngestionService` owns fetching,
 * the `IngestionRun` row and failure isolation; this owns what happens to a single
 * posting. That is what lets the stage order be tested with fake stages and no
 * network, and the run bookkeeping be tested without any stages at all.
 */

/** Everything the stages need about one fetched posting. */
export interface PipelineInput {
  readonly sourceId: string;
  readonly externalId: string;
  /** Absolute https URL of the original posting — what the UI links out to (§7.4). */
  readonly url: string;
  /** The adapter's mapping of its own payload. Unnormalized by definition. */
  readonly fields: RawJobFields;
  /** `RawJob.postedAt`, used when the field mapping produced none. */
  readonly postedAt?: Date | null;
}

export interface PipelineResult {
  readonly postingId: string;
  readonly postingOutcome: PostingUpsertOutcome;
  readonly jobId: string;
  readonly clusterOutcome: ClusterOutcome;
  readonly classificationOutcome: ClassificationOutcome;
}

@Injectable()
export class JobPipelineService {
  private readonly logger = new Logger(JobPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly text: TextNormalizationService,
    private readonly companyLocation: CompanyLocationService,
    private readonly attributes: JobAttributesService,
    private readonly language: LanguageDetectionService,
    private readonly postings: PostingIdentityService,
    private readonly clusters: CanonicalJobService,
    private readonly classification: JobClassificationService,
  ) {}

  /**
   * Runs one posting through every stage after the raw write.
   *
   * Called for **every** fetched item, including one whose raw payload was
   * byte-identical to the stored copy. That is not wasted work: `JobPosting` and
   * `Job` are retired by `lastSeenAt` (M5.6, `DATABASE.md` §8), and a posting the
   * source is still listing has been seen whether or not its text moved. Skipping
   * the unchanged case would retire every posting nobody ever edits, which is most
   * of them. The cost is bounded — tier 1 reports `UNCHANGED` and writes one
   * timestamp, and classification reuses its cached row without running the
   * classifier (M8.4).
   *
   * Throws on anything it cannot process. The caller counts that as one item
   * failure and carries on with the rest of the run.
   */
  async process(input: PipelineInput): Promise<PipelineResult> {
    const posting = this.normalize(input);

    const identity = await this.postings.upsert(posting);
    const cluster = await this.clusters.assign(posting, {
      postingId: identity.postingId,
      jobId: identity.jobId,
    });

    const classified = await this.classify(cluster.jobId);

    return {
      postingId: identity.postingId,
      postingOutcome: identity.outcome,
      jobId: cluster.jobId,
      clusterOutcome: cluster.outcome,
      classificationOutcome: classified,
    };
  }

  /**
   * The M6 stages, in the only order they compose in: text first, because every
   * later detector reads the plain-text description rather than the source's markup.
   */
  private normalize(input: PipelineInput): NormalizedPosting {
    const { fields } = input;

    const title = this.text.normalize(fields.title);
    const companyName = this.text.normalize(fields.companyName);
    // Markup, so `toPlainText` — not `normalize`, which would leave tags in place
    // for the classifier to read as prose.
    const description = this.text.toPlainText(fields.description);
    const { location, countryCode } = this.companyLocation.parseLocation(
      fields.location,
    );

    return {
      sourceId: input.sourceId,
      externalId: input.externalId,
      url: input.url,
      title,
      companyName,
      companySlug: this.companyLocation.toCompanySlug(companyName),
      location,
      countryCode,
      // The declared value wins over the text where the source stated one (M6.3);
      // `null` stays a real answer, meaning the posting says nothing either way.
      workplaceType: this.attributes.detectWorkplaceType({
        title,
        location,
        description,
        declared: fields.workplaceType,
      }),
      employmentType: this.attributes.detectEmploymentType({
        title,
        description,
        declared: fields.employmentType,
      }),
      language: this.language.detect({
        title,
        description,
        declared: fields.language,
      }),
      description,
      technologies: this.attributes.extractTechnologies(title, description),
      // The field mapping's date first, then the one the adapter read off the
      // listing; null when the source published neither. `Job.effectivePostedAt`
      // is what fills that gap, and deduplication owns it.
      postedAt: fields.postedAt ?? input.postedAt ?? null,
    };
  }

  /**
   * Classifies the **canonical** job, not the posting.
   *
   * The title and description are re-read here rather than taken from the posting
   * in hand, because M7.4 has just re-derived them from the whole cluster: a
   * two-source vacancy is classified on the fullest description any source gave,
   * and that may well not be the posting that triggered this run. It is also what
   * makes `classificationInputHash` a stable cache key — the same job classified
   * twice from two different postings would otherwise miss the cache every time.
   */
  private async classify(jobId: string): Promise<ClassificationOutcome> {
    const job = await this.prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      select: { id: true, title: true, description: true },
    });

    const stored = await this.classification.classifyAndPersist(job);
    if (stored.outcome === 'CLASSIFIED') {
      this.logger.debug(
        `Job ${jobId} classified ${stored.level} (score ${stored.score})`,
      );
    }
    return stored.outcome;
  }
}
