import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PaginatedResponse } from '../../common/dto/paginated.response';
import { PaginationQuery } from '../../common/dto/pagination.query';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JobsService } from '../jobs/jobs.service';
import { SaveJobDto } from './dto/save-job.dto';
import { SavedJobResponse } from './dto/saved-job.response';
import { SavedJobsService } from './saved-jobs.service';

/**
 * `GET`/`POST /saved-jobs` and `DELETE /saved-jobs/:jobId`
 * (`docs/ARCHITECTURE.md` §8).
 *
 * Every route is authenticated — the global `JwtAuthGuard`, with no `@Public()`
 * and no `@OptionalAuth()` here. Saving is inherently a thing an account does,
 * and unlike `/jobs/search` there is no anonymous answer to give.
 *
 * No route names a `SavedJob` by its own id: the collection is always the
 * caller's, and `:jobId` names the job. A user therefore cannot express another
 * user's saved row, which is the same structural ownership `ProfilesController`
 * relies on.
 */
@Controller('saved-jobs')
export class SavedJobsController {
  constructor(
    private readonly savedJobsService: SavedJobsService,
    private readonly jobsService: JobsService,
  ) {}

  @Get()
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: PaginationQuery,
  ): Promise<PaginatedResponse<SavedJobResponse>> {
    return this.savedJobsService.list(
      currentUser.userId,
      query.page,
      query.pageSize,
    );
  }

  /**
   * Saving twice is idempotent, so the second call answers exactly like the
   * first: 201 and no body. Reporting a conflict would make a client treat a
   * successful "this is saved" as an error it has to special-case.
   *
   * A `jobId` no job carries is a 404 rather than the 500 the foreign key would
   * otherwise raise. The check reads through `JobsService`, which owns
   * `prisma.job`; a merged-away or deactivated job passes it, because both rows
   * still exist and both are legitimate things to have saved.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async save(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: SaveJobDto,
  ): Promise<void> {
    if (!(await this.jobsService.exists(dto.jobId))) {
      throw new NotFoundException('Job not found');
    }
    await this.savedJobsService.save(currentUser.userId, dto.jobId);
  }

  /**
   * 204 when a row went away, 404 when none did.
   *
   * Not an idempotent 204 for both: "you had not saved this" is a different fact
   * from "it is now unsaved", and answering success to a delete that deleted
   * nothing is a lie the client cannot detect. The 404 says nothing about *why*
   * — another user's row and a job this user never saved are the same response,
   * because the query matched on `(userId, jobId)` and never saw the difference.
   */
  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<void> {
    const removed = await this.savedJobsService.remove(
      currentUser.userId,
      jobId,
    );
    if (!removed) {
      throw new NotFoundException('Saved job not found');
    }
  }
}
