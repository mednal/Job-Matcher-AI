export interface AppConfig {
  nodeEnv: string;
  port: number;
  // A list: a browser sends one Origin per request and the server must be able
  // to allow more than one (the dev server does not always land on 4200).
  corsOrigin: string[];
}

export interface DatabaseConfig {
  url: string;
}

export interface AuthConfig {
  jwtSecret: string;
  accessTtl: string;
  refreshTtl: string;
}

// docs/ARCHITECTURE.md §7.3.2 requires a truthful User-Agent carrying a contact
// address. It is configuration, not a constant, because the right address differs
// per deployment and a source must be able to reach whoever is running this.
export interface SourcesConfig {
  userAgentContact: string;
}

// docs/ARCHITECTURE.md §9 requires a global rate limit with a stricter one on
// `/auth/*`. The numbers are configuration rather than constants because the
// right limit differs per deployment (M13.1 sets them for production), and
// `enabled` exists so an environment that already rate-limits at the edge — or
// an automated test suite that would trip the limit by design — can turn the
// in-process limiter off without removing it from the code.
export interface ThrottleConfig {
  enabled: boolean;
  ttlSeconds: number;
  limit: number;
  authLimit: number;
}

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  sources: SourcesConfig;
  throttle: ThrottleConfig;
}

// CORS_ORIGIN is a comma-separated list of origins, e.g.
// "http://localhost:4200,http://localhost:52562".
// Joi has already coerced and defaulted these, but this factory reads
// process.env directly, so it repeats the default rather than assuming it.
const parseBoolean = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value.trim().toLowerCase() === 'true';

const parseOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

export default (): RootConfig => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigin: parseOrigins(
      process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    ),
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  sources: {
    // Defaults to this repository, which is a real and reachable contact route.
    // A deployment fetching from a live source should point this at an address a
    // human actually reads.
    userAgentContact:
      process.env.SOURCE_USER_AGENT_CONTACT ??
      'https://github.com/mednal/Job-Matcher-AI',
  },
  throttle: {
    enabled: parseBoolean(process.env.THROTTLE_ENABLED, true),
    ttlSeconds: parseInt(process.env.THROTTLE_TTL_SECONDS ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
    authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '10', 10),
  },
});
