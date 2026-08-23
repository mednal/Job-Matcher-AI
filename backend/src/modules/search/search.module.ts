import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { SearchController } from './search.controller';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';

// Query, filter and ranking over the canonical job model
// (`docs/ARCHITECTURE.md` §4.1). It reads the tables ingestion writes and depends
// on `jobs/` only for the response DTO — never on the pipeline modules.
//
// `ProfilesModule` is imported for M9.5's query-time personalization (§6.5): the
// profile is read through `ProfilesService`, which owns `prisma.profile`, rather
// than queried from here.
@Module({
  imports: [ProfilesModule],
  controllers: [SearchController],
  providers: [SearchService, SearchRepository],
  exports: [SearchService],
})
export class SearchModule {}
