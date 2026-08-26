import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { RootConfig } from '../config/configuration';
import { AUTH_PATH_PREFIX } from '../http/api-prefix';

// docs/ARCHITECTURE.md §9: a global rate limit, stricter on `/auth/*`.
//
// Two named throttlers rather than a decorator on AuthController, because the
// limits are configuration read at boot and a decorator takes its numbers at
// import time. The `auth` throttler skips itself on every other path, so the
// stricter rule is declared once, in one place, instead of being something each
// new auth route has to remember to opt into.
export function isAuthRequest(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<Request>();
  return (
    typeof request.path === 'string' &&
    request.path.startsWith(AUTH_PATH_PREFIX)
  );
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<RootConfig, true>) => {
        const throttle = configService.get('throttle', { infer: true });
        const ttl = throttle.ttlSeconds * 1000;
        return {
          // The default ThrottlerException message names its own class, which
          // tells a caller nothing they can act on.
          errorMessage: 'Too many requests. Please try again later.',
          throttlers: [
            {
              name: 'default',
              ttl,
              limit: throttle.limit,
              skipIf: () => !throttle.enabled,
            },
            {
              name: 'auth',
              ttl,
              limit: throttle.authLimit,
              // The `enabled` check is repeated rather than set once at module
              // level, because ThrottlerGuard reads
              // `namedThrottler.skipIf || commonOptions.skipIf` — a throttler
              // that defines its own *replaces* the shared one instead of
              // combining with it. A module-level switch would have turned off
              // the global limit and left this one running.
              skipIf: (context) => !throttle.enabled || !isAuthRequest(context),
            },
          ],
        };
      },
    }),
  ],
  // Registered before AuthModule's JwtAuthGuard (global guards run in the order
  // their modules are resolved, and AppModule imports this one first), so a
  // flood of guessed credentials is turned away before it reaches the database.
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
