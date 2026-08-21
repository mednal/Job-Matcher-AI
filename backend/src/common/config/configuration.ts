export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigin: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
}

export default (): RootConfig => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
});
