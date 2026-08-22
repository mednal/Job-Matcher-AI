import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { descriptionSimilarity } from './description-similarity';

/**
 * M7.3 — deduplication tier 3: the fuzzy match (`ARCHITECTURE.md` §6.3).
 *
 * The last and most expensive tier, and the only one that can be wrong in the
 * expensive direction. It runs **only** for postings tier 2 could not place, and
 * **only** within one `companySlug`: `pg_trgm` similarity on `normalizedTitle`,
 * confirmed by a description similarity check. Anything below either threshold
 * returns no match, and the caller opens a new `Job` — a false split is a far
 * cheaper error than a false merge, which hides a real vacancy from the user.
 *
 * What tier 3 catches that tier 2 cannot, in order of how often it will fire:
 *
 * - **The same vacancy in two countries, or in one country and nowhere.**
 *   `countryCode` is a `dedupHash` input and M6.2 refuses to infer a country from a
 *   city, so one board writing "Berlin" and another writing "Berlin, Germany" hash
 *   differently with byte-identical titles. Tier 3 never reads the country, so it
 *   is what re-joins them.
 * - **Spelling drift in the title** — "Front End Developer" against "Frontend
 *   Developer", "C# Entwickler" against "C-Sharp Entwickler".
 *
 * **Tier 3 does not memoize.** The matched `Job` keeps the `dedupHash` it was
 * created with; the posting's own hash is not written anywhere, because `dedupHash`
 * is UNIQUE (D1) and a row can only carry one. A third posting spelled like the
 * second therefore comes back through tier 3 rather than hitting tier 2's index.
 * That costs one indexed query per unmatched posting and keeps the hash meaning
 * exactly one thing.
 */

/**
 * Both thresholds are the conservative first guess of `ARCHITECTURE.md` §14 open
 * question 2, biased toward splitting, and M11 tunes them against ingested
 * postings. They are exported so tests can state the bias rather than encode the
 * numbers by hand.
 *
 * 0.75 on the title is far above `pg_trgm`'s own 0.3 default. It admits the
 * spelling-drift cases above (`front end developer` against `frontend developer`
 * scores ≈0.77) and rejects same-family role changes (`software developer` against
 * `software engineer` scores ≈0.37), which stay two vacancies.
 */
export const TITLE_SIMILARITY_THRESHOLD = 0.75;

/**
 * 0.5 on the description is a strong requirement for a Jaccard over vocabularies:
 * two ads from one company always share their "about us" and benefits boilerplate,
 * so a lower bar would confirm almost anything the title gate let through.
 */
export const DESCRIPTION_SIMILARITY_THRESHOLD = 0.5;

/**
 * How many title candidates are confirmed against. The set is already narrowed to
 * one company and one similarity floor, so a company would need six near-identical
 * titles to lose one — and the ones beyond the fifth are the least similar.
 */
const CANDIDATE_LIMIT = 5;

export interface FuzzyMatchQuery {
  readonly companySlug: string;
  /** Already canonicalized by `toNormalizedTitle`, and guaranteed non-empty. */
  readonly normalizedTitle: string;
  /** The posting's normalized plain-text description (M6.1). */
  readonly description: string;
}

export interface FuzzyMatch {
  readonly jobId: string;
  readonly titleSimilarity: number;
  readonly descriptionSimilarity: number;
}

/**
 * The seam `CanonicalJobService` depends on. It exists so tier 2 can be tested
 * without a trigram query, and so tier 3's thresholds cannot silently change what a
 * tier-2 test is asserting.
 */
export interface FuzzyMatcher {
  findMatch(query: FuzzyMatchQuery): Promise<FuzzyMatch | null>;
}

interface CandidateRow {
  readonly id: string;
  readonly normalizedTitle: string;
  readonly description: string;
  readonly titleSimilarity: number;
}

@Injectable()
export class FuzzyMatchService implements FuzzyMatcher {
  private readonly logger = new Logger(FuzzyMatchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The most similar `Job` at this company whose description confirms the title
   * match, or `null` when nothing clears both gates.
   */
  async findMatch(query: FuzzyMatchQuery): Promise<FuzzyMatch | null> {
    const candidates = await this.candidates(query);

    for (const candidate of candidates) {
      const confirmation = descriptionSimilarity(
        query.description,
        candidate.description,
      );

      if (confirmation === null) {
        // Not "different" — unknown. One of the two descriptions is too thin to
        // confirm anything, and tier 3 does not merge on an absence of evidence.
        this.logger.debug(
          `Tier 3: "${query.normalizedTitle}" ~ "${candidate.normalizedTitle}" ` +
            `(${candidate.titleSimilarity.toFixed(2)}) at ${query.companySlug}: ` +
            `description too thin to confirm`,
        );
        continue;
      }

      if (confirmation >= DESCRIPTION_SIMILARITY_THRESHOLD) {
        return {
          jobId: candidate.id,
          titleSimilarity: candidate.titleSimilarity,
          descriptionSimilarity: confirmation,
        };
      }

      this.logger.debug(
        `Tier 3: "${query.normalizedTitle}" ~ "${candidate.normalizedTitle}" ` +
          `(${candidate.titleSimilarity.toFixed(2)}) at ${query.companySlug}: ` +
          `description ${confirmation.toFixed(2)} below ${DESCRIPTION_SIMILARITY_THRESHOLD}`,
      );
    }

    return null;
  }

  /**
   * The trigram query, and the only raw SQL outside migrations and the search
   * repository (`DATABASE.md` §5): `similarity()` is a `pg_trgm` function and
   * Prisma's query API cannot express it.
   *
   * `companySlug` is an equality on `Job(companySlug, normalizedTitle)`, which is
   * what makes this affordable — the similarity is then computed over one company's
   * rows rather than the table. `Job_normalizedTitle_trgm_idx` is not what serves
   * this query; the `%` operator that would use it depends on
   * `pg_trgm.similarity_threshold`, a **session** GUC, and a pooled connection is
   * the wrong place to keep a threshold that decides whether two vacancies merge.
   * An explicit `similarity() >=` states the number in the code instead.
   *
   * Rows merged away (D2) are candidates like any other: tier 2's hash lookup finds
   * a tombstone and redirects to the survivor, and tier 3 disagreeing with that
   * would split a posting off a cluster somebody deliberately merged. The caller
   * resolves the chain before attaching.
   */
  private async candidates(query: FuzzyMatchQuery): Promise<CandidateRow[]> {
    return this.prisma.$queryRaw<CandidateRow[]>`
      SELECT "id",
             "normalizedTitle",
             "description",
             similarity("normalizedTitle", ${query.normalizedTitle}) AS "titleSimilarity"
      FROM "Job"
      WHERE "companySlug" = ${query.companySlug}
        AND similarity("normalizedTitle", ${query.normalizedTitle}) >= ${TITLE_SIMILARITY_THRESHOLD}
      ORDER BY "titleSimilarity" DESC, "id" ASC
      LIMIT ${CANDIDATE_LIMIT}
    `;
  }
}
