import * as Joi from 'joi';

// Only variables actually read by the application today (see configuration.ts).
// Extend this schema in lockstep with configuration.ts as new features need
// new env vars (DATABASE_URL, JWT_*, ...) — see docs/ARCHITECTURE.md §12.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
});
