import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaginatedResponse } from '../../common/dto/paginated.response';
import {
  countDistinctSources,
  JobSummaryResponse,
  ResolvedJobSummary,
} from './dto/job-summary.response';
import { JobDetailResponse } from './dto/job-detail.response';

/**
 * What a list may show. Merged jobs are excluded by `mergedIntoJobId IS NULL`
 * (D2) and deactivated ones by `isActive` (docs/DATABASE.md §8) — neither row is
 * deleted, both stay reachable by id so a saved job never dangles.
 *
 * This is the *structural* exclusion only. The product's default result set also
 * hides CLEARLY_EXPERIENCED jobs (PRODUCT.md §8); that belongs to the search
 * default set (M9.3) and is deliberately not applied here.
 */
export const LISTABLE_JOBS_WHERE = {
  isActive: true,
  mergedIntoJobId: null,
} satisfies Prisma.JobWhereInput;

/**
 * Exported so `saved-jobs/` can project the same job summary through its own
 * relation without restating seventeen column names. A second copy would be a
 * second contract to keep in sync, and the two lists render the same card.
 */
export const JOB_SUMMARY_SELECT = {
  id: true,
  title: true,
  companyName: true,
  location: true,
  countryCode: true,
  workplaceType: true,
  employmentType: true,
  language: true,
  technologies: true,
  postedAt: true,
  effectivePostedAt: true,
  juniorLevel: true,
  juniorScore: true,
  requiredMinYears: true,
  requiredMaxYears: true,
  // Only the source ids, to count distinct sources without loading postings.
  postings: { select: { sourceId: true } },
} satisfies Prisma.JobSelect;

const JOB_DETAIL_SELECT = {
  id: true,
  title: true,
  companyName: true,
  location: true,
  countryCode: true,
  workplaceType: true,
  employmentType: true,
  language: true,
  description: true,
  technologies: true,
  postedAt: true,
  effectivePostedAt: true,
  isActive: true,
  juniorLevel: true,
  juniorScore: true,
  requiredMinYears: true,
  requiredMaxYears: true,
  classifiedAt: true,
  postings: {
    select: {
      url: true,
      source: {
        select: { key: true, displayName: true, attributionText: true },
      },
    },
    orderBy: [{ source: { key: 'asc' } }, { url: 'asc' }],
  },
  classifications: {
    where: { isCurrent: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      classifierVersion: true,
      level: true,
      score: true,
      minYears: true,
      maxYears: true,
      positiveSignals: true,
      negativeSignals: true,
      summary: true,
      createdAt: true,
    },
  },
} satisfies Prisma.JobSelect;

/**
 * A merge chain longer than this is a data defect, not a deep hierarchy: dedup
 * merges the loser into a canonical job, so chains should be one hop and only
 * ever grow by re-merging an already-merged job.
 */
const MAX_MERGE_HOPS = 8;

// The only place `prisma.job` is read for the API (docs/ARCHITECTURE.md §4.2).
// Prisma types stay inside this file: every method returns a response DTO.
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of listable jobs, newest first. `id` breaks ties on
   * `effectivePostedAt` so two jobs sharing a timestamp cannot swap places
   * between page 1 and page 2 and hide a row.
   */
  async list(
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<JobSummaryResponse>> {
    // One transaction, so `total` describes the same snapshot the page came
    // from and a concurrent ingestion cannot make the two disagree.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where: LISTABLE_JOBS_WHERE,
        orderBy: [{ effectivePostedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: JOB_SUMMARY_SELECT,
      }),
      this.prisma.job.count({ where: LISTABLE_JOBS_WHERE }),
    ]);

    const items = rows.map((row) =>
      JobSummaryResponse.fromEntity(row, countDistinctSources(row.postings)),
    );

    return PaginatedResponse.of(items, page, pageSize, total);
  }

  /**
   * Whether a job id names a real row — merged-away and deactivated rows
   * included, since both still exist and both can legitimately be saved (M10.1).
   *
   * It lives here rather than in `saved-jobs/` so that `prisma.job` keeps a
   * single owner (docs/ARCHITECTURE.md §4.2). The caller gets a boolean, not a
   * row, so no Prisma type escapes.
   */
  async exists(id: string): Promise<boolean> {
    const row = await this.prisma.job.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * M10.2 — the canonical summary behind each of the given job ids, keyed by the
   * id that was *asked for* rather than the one that answered. A job merged away
   * (D2) resolves through `mergedIntoJobId`, so a saved job whose vacancy was
   * folded into another shows the survivor's card instead of a dead row.
   *
   * It lives here, not in `saved-jobs/`, because it reads `prisma.job` and that
   * table has one owner (`docs/ARCHITECTURE.md` §4.2). The caller gets response
   * DTOs, so no Prisma type escapes.
   *
   * An id whose chain is broken — a cycle, or longer than `MAX_MERGE_HOPS` — is
   * simply **absent from the map**, already logged by the walk. The list caller
   * then falls back to the row as stored: a data defect must not remove an entry
   * from someone's collection, and a job the user can still open is a better
   * answer than a gap in their saved list.
   */
  async findCanonicalSummaries(
    ids: readonly string[],
  ): Promise<Map<string, ResolvedJobSummary>> {
    const canonicalIds = new Map<string, string>();
    // Sequential on purpose: a caller passes the merged rows of one page, which
    // is normally none and never more than a page, and each walk is one hop.
    for (const id of new Set(ids)) {
      const canonicalId = await this.resolveCanonicalId(id);
      if (canonicalId) {
        canonicalIds.set(id, canonicalId);
      }
    }
    if (canonicalIds.size === 0) {
      return new Map();
    }

    const rows = await this.prisma.job.findMany({
      where: { id: { in: [...new Set(canonicalIds.values())] } },
      // The shared summary plus the one column the discovery lists never need,
      // because they exclude every row where it is false.
      select: { ...JOB_SUMMARY_SELECT, isActive: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    const summaries = new Map<string, ResolvedJobSummary>();
    for (const [id, canonicalId] of canonicalIds) {
      const row = byId.get(canonicalId);
      if (!row) {
        continue;
      }
      summaries.set(id, {
        job: JobSummaryResponse.fromEntity(
          row,
          countDistinctSources(row.postings),
        ),
        isActive: row.isActive,
      });
    }
    return summaries;
  }

  /**
   * Canonical detail for a job id. A job that was merged away (D2) resolves to
   * the job it was merged into rather than returning a dead row; the requested
   * id comes back as `redirectedFromJobId`.
   *
   * Inactive jobs are returned. Only lists exclude them — a user who saved a job
   * that has since gone stale must still be able to open it (docs/DATABASE.md §8).
   */
  async findDetail(id: string): Promise<JobDetailResponse | null> {
    const canonicalId = await this.resolveCanonicalId(id);
    if (!canonicalId) {
      return null;
    }

    const job = await this.prisma.job.findUnique({
      where: { id: canonicalId },
      select: JOB_DETAIL_SELECT,
    });
    if (!job) {
      return null;
    }

    return JobDetailResponse.fromEntity(job, job.id === id ? null : id);
  }

  /**
   * Walks `mergedIntoJobId` to the end of the merge chain. Only the redirect
   * columns are read while walking; the full row is fetched once, at the end.
   *
   * A cycle or an over-long chain returns null (→ 404) rather than the tombstone
   * it stopped on: serving a merged-away job is exactly what this milestone
   * forbids, and corrupt merge data should be loud, not silently papered over.
   */
  private async resolveCanonicalId(id: string): Promise<string | null> {
    const visited = new Set<string>();
    let currentId = id;

    for (let hop = 0; hop <= MAX_MERGE_HOPS; hop++) {
      if (visited.has(currentId)) {
        this.logger.error(
          `Merge cycle detected while resolving job ${id} (at ${currentId})`,
        );
        return null;
      }
      visited.add(currentId);

      const row = await this.prisma.job.findUnique({
        where: { id: currentId },
        select: { id: true, mergedIntoJobId: true },
      });
      if (!row) {
        return null;
      }
      if (!row.mergedIntoJobId) {
        return row.id;
      }
      currentId = row.mergedIntoJobId;
    }

    this.logger.error(
      `Merge chain for job ${id} exceeded ${MAX_MERGE_HOPS} hops`,
    );
    return null;
  }
}
