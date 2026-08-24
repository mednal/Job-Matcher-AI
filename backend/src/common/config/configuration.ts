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

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  sources: SourcesConfig;
}

// CORS_ORIGIN is a comma-separated list of origins, e.g.
// "http://localhost:4200,http://localhost:52562".
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
});
