import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';
import type { HealthStatus } from './health.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // Liveness/readiness must stay reachable without a token — see
  // docs/ARCHITECTURE.md §8 (Auth: "–") and the global JwtAuthGuard in AuthModule.
  @Public()
  // Exempt from the rate limit (M1.4): a load balancer polling liveness every
  // few seconds is the expected traffic here, and a probe answered with 429
  // would report a healthy application as down.
  @SkipThrottle()
  @Get()
  check(): Promise<HealthStatus> {
    return this.healthService.check();
  }
}
