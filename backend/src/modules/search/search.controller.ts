import { Controller, Get, Query } from '@nestjs/common';
import { PaginatedResponse } from '../../common/dto/paginated.response';
import { Public } from '../../common/decorators/public.decorator';
import { JobSummaryResponse } from '../jobs/dto/job-summary.response';
import { SearchQuery } from './dto/search.query';
import { SearchService } from './search.service';

/**
 * `GET /jobs/search` (`docs/ARCHITECTURE.md` §8). It shares the `/jobs` prefix
 * with `JobsController` but lives in this module, so `SearchModule` is imported
 * **before** `JobsModule` in `AppModule`: Nest registers routes in module import
 * order, and `/jobs/:id` is parsed by `ParseUUIDPipe`, which would reject the
 * literal `search` with a 400 rather than falling through.
 *
 * Public, so the product is evaluable before signup. When M9.5 adds profile-fit
 * ranking this route needs a guard that attaches the user when a token is present
 * and still serves anonymous requests — `@Public()` skips authentication
 * entirely rather than making it optional.
 */
@Controller('jobs')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('search')
  search(
    @Query() query: SearchQuery,
  ): Promise<PaginatedResponse<JobSummaryResponse>> {
    return this.searchService.search(query);
  }
}
