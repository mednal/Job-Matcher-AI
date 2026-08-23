import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { SearchModule } from './modules/search/search.module';
import { SavedJobsModule } from './modules/saved-jobs/saved-jobs.module';
import { SourcesModule } from './modules/sources/sources.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    // SearchModule before JobsModule: routes register in import order and
    // `/jobs/search` must be matched before `/jobs/:id` (see SearchController).
    SearchModule,
    JobsModule,
    SavedJobsModule,
    SourcesModule,
    IngestionModule,
  ],
})
export class AppModule {}
