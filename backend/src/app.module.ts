import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './common/config/config.module';
import { ThrottlingModule } from './common/throttling/throttling.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
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
    // Before AuthModule: both register a global guard, they run in registration
    // order, and rate limiting has to happen before authentication rather than
    // after it (see ThrottlingModule).
    ThrottlingModule,
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
  // Registered here rather than in main.ts so that the error envelope is a
  // property of the application, not of one bootstrap path: every e2e spec
  // builds its own app from this module and gets the same shape.
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*splat');
  }
}
