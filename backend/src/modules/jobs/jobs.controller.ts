import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobSummaryResponse } from './dto/job-summary.response';
import { JobDetailResponse } from './dto/job-detail.response';
import { PaginatedResponse } from '../../common/dto/paginated.response';
import { PaginationQuery } from '../../common/dto/pagination.query';
import { Public } from '../../common/decorators/public.decorator';

// Readable without a token, so the product is evaluable before signup
// (docs/ARCHITECTURE.md §8). @Public() skips authentication entirely rather than
// making it optional; when personalized ranking arrives (M9.5) these routes need
// a guard that attaches the user when a token is present and still allows none.
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Public()
  @Get()
  list(
    @Query() query: PaginationQuery,
  ): Promise<PaginatedResponse<JobSummaryResponse>> {
    return this.jobsService.list(query.page, query.pageSize);
  }

  // Any literal route under /jobs (e.g. /jobs/search, M9.1) must be declared
  // above this one: ':id' is parsed as a UUID and would reject the literal.
  @Public()
  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobDetailResponse> {
    const job = await this.jobsService.findDetail(id);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }
}
