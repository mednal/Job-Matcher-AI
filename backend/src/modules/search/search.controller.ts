import { Controller, Get, Query } from '@nestjs/common';
import { PaginatedResponse } from '../../common/dto/paginated.response';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
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
 * Readable without a token, so the product is evaluable before signup, and
 * personalized when there is one (`docs/ARCHITECTURE.md` §8 marks it "opt.").
 * That is `@OptionalAuth()` rather than `@Public()`: `@Public()` skips
 * authentication entirely, so no user would be attached even when the caller sent
 * a valid token, and M9.5's profile-fit ranking needs the identity.
 */
@Controller('jobs')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @OptionalAuth()
  @Get('search')
  search(
    @Query() query: SearchQuery,
    // `undefined` when the request carried no token. Nothing else about the
    // request changes: profile fit reorders a result set, it never narrows one.
    @CurrentUser() currentUser: AuthenticatedUser | undefined,
  ): Promise<PaginatedResponse<JobSummaryResponse>> {
    return this.searchService.search(query, currentUser?.userId);
  }
}
