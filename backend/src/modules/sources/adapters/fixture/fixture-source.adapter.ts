/**
 * SOURCE: Local development fixtures (`./fixtures/*.json`).
 *
 * ACCESS METHOD: none — nothing is fetched. The payloads are synthetic files
 * committed to this repository and read from disk. No network call is made, no
 * third-party system is contacted, and no terms of any external service apply.
 *
 * PERMITTED BY: this repository's own content. `termsUrl` points at
 * `docs/SOURCES.md`, the review register that governs which sources may be
 * integrated (docs/ARCHITECTURE.md §7.5); it is the only document that can grant
 * that, and for synthetic local data it is the honest answer to "what permits this".
 *
 * This adapter is **not** a real source and must never be read as one. It exists so
 * the whole ingestion pipeline can be built, tested and smoke-tested before any
 * source has cleared review (decision A6: it ships in all builds, so a production
 * deployment can be exercised end to end without touching anyone's API).
 *
 * `accessMethod` is stamped `OFFICIAL_FEED` because the enum has no value meaning
 * "local file" and deliberately never will — every value describes a permitted way
 * of obtaining someone else's data, and adding a fixture value would create a
 * category that a real adapter could hide in. The display name says "development
 * only" so no row in `JobSource` can be mistaken for a reviewed source.
 */
import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PaginatedSourceAdapter } from '../../paginated-source.adapter';
import type {
  FetchContext,
  RawJob,
  SourceDescriptor,
  SourcePage,
  SourcePageRequest,
} from '../../source-adapter.types';
import { SourceProtocolError } from '../../source-errors';

/** The shape of the committed fixture file. Local to this adapter by design. */
interface FixtureFile {
  meta?: unknown;
  jobs?: FixtureJob[];
}

interface FixtureJob {
  id?: unknown;
  url?: unknown;
  postedAt?: unknown;
  [key: string]: unknown;
}

export const FIXTURE_SOURCE_KEY = 'fixture-board';

const FIXTURE_FILE = 'fixture-board-jobs.json';

@Injectable()
export class FixtureSourceAdapter extends PaginatedSourceAdapter {
  readonly descriptor: SourceDescriptor = {
    key: FIXTURE_SOURCE_KEY,
    displayName: 'Fixture Job Board (development only)',
    accessMethod: 'OFFICIAL_FEED',
    termsUrl:
      'https://github.com/mednal/Job-Matcher-AI/blob/main/docs/SOURCES.md',
    attributionText:
      'Synthetic development data. Not a real job source and not a reviewed one.',
    complianceNote:
      'Reads synthetic JSON committed to this repository. No network access, no ' +
      'third-party data, and no external terms apply. Exists so the pipeline can be ' +
      'exercised before any real source clears the §7.5 review.',
    // The fixture file is ordered newest-first, so the `since` early-stop is sound
    // here. Declaring this wrongly would silently truncate a run.
    ordering: 'RECENT_FIRST',
    // `meta.requestId` and `fetchedAt` change on every regeneration of the file
    // without the posting having changed. Excluding them from the content hash is
    // what makes the "unchanged payload writes no row" rule work; the payload is
    // still stored verbatim.
    volatilePayloadPaths: ['meta.requestId', 'meta.generatedAt', 'fetchedAt'],
    defaults: {
      // Meaningless for a local file, but the descriptor contract requires a real
      // ceiling and a zero would disable the check §7.3.3 depends on.
      rateLimitRps: 5,
      pageSize: 3,
      maxPages: 10,
    },
  };

  /** Cached after the first read — the file cannot change mid-run. */
  private cache?: FixtureJob[];

  /**
   * Slices the fixture file into pages so the shared base's pagination, page cap
   * and cursor-progress logic are exercised by a real adapter rather than only by
   * their own unit tests.
   */
  protected async fetchPage(
    request: SourcePageRequest,
    ctx: FetchContext,
  ): Promise<SourcePage> {
    const all = await this.load();
    const start = (request.pageNumber - 1) * request.pageSize;
    const slice = all.slice(start, start + request.pageSize);

    const jobs: RawJob[] = [];
    for (const entry of slice) {
      const mapped = this.toRawJob(entry);
      if (mapped) {
        jobs.push(mapped);
      } else {
        // Degrades rather than failing the run: one unusable fixture entry must
        // not discard the others.
        const label = typeof entry?.id === 'string' ? entry.id : '<no id>';
        ctx.logger.warn(`Fixture entry ${label} is unusable; skipping`);
      }
    }

    const hasMore = start + request.pageSize < all.length;
    return {
      jobs,
      nextCursor: hasMore ? `page-${request.pageNumber + 1}` : undefined,
    };
  }

  private async load(): Promise<FixtureJob[]> {
    if (this.cache) {
      return this.cache;
    }
    // __dirname keeps this working from dist/, where the JSON is copied alongside
    // the compiled adapter by nest-cli's asset rule.
    const path = join(__dirname, 'fixtures', FIXTURE_FILE);

    let parsed: FixtureFile;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8')) as FixtureFile;
    } catch (error) {
      throw new SourceProtocolError(
        this.descriptor.key,
        `Could not read fixture file ${path}`,
        { cause: error },
      );
    }

    if (!Array.isArray(parsed.jobs)) {
      throw new SourceProtocolError(
        this.descriptor.key,
        `Fixture file ${path} has no "jobs" array`,
      );
    }

    this.cache = parsed.jobs;
    return this.cache;
  }

  /** Returns undefined for an entry that cannot become a valid RawJob. */
  private toRawJob(entry: FixtureJob): RawJob | undefined {
    if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
      return undefined;
    }
    if (typeof entry.url !== 'string' || !entry.url.startsWith('https://')) {
      return undefined;
    }

    const postedAt =
      typeof entry.postedAt === 'string' ? new Date(entry.postedAt) : undefined;

    return {
      externalId: entry.id,
      url: entry.url,
      // Verbatim: normalization (M6) owns interpreting this, not the adapter.
      payload: entry,
      postedAt:
        postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
    };
  }
}
