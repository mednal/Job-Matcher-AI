import { SetMetadata } from '@nestjs/common';

// Metadata key read by JwtAuthGuard (modules/auth) to opt a route out of the
// global authentication requirement. Lives in common/ because it is consumed by
// every module, not just auth — e.g. HealthController.
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
