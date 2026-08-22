import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { JobsModule } from './modules/jobs/jobs.module';
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
    JobsModule,
    SourcesModule,
    IngestionModule,
  ],
})
export class AppModule {}
