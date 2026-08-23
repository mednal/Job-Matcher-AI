import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';

// Query, filter and ranking over the canonical job model
// (`docs/ARCHITECTURE.md` §4.1). It reads the tables ingestion writes and depends
// on `jobs/` only for the response DTO — never on the pipeline modules.
@Module({
  controllers: [SearchController],
  providers: [SearchService, SearchRepository],
  exports: [SearchService],
})
export class SearchModule {}
