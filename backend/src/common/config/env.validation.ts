import * as Joi from 'joi';

const commaSeparatedOrigins = Joi.string().custom((value: string, helpers) => {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (origins.length === 0) {
    return helpers.error('any.invalid');
  }
  const allValid = origins.every(
    (origin) => Joi.string().uri().validate(origin).error === undefined,
  );
  return allValid ? value : helpers.error('any.invalid');
}, 'comma-separated origin list');

// Only variables actually read by the application today (see configuration.ts).
// Extend this schema in lockstep with configuration.ts as new features need
// new env vars (INGESTION_*, ...) — see docs/ARCHITECTURE.md §12.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  // Comma-separated list of allowed browser origins. The dev server does not
  // always land on 4200, so more than one has to be allowed without a code change.
  CORS_ORIGIN: commaSeparatedOrigins.default('http://localhost:4200'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  // Required, no default: the app must refuse to boot rather than sign tokens
  // with a weak fallback secret.
  JWT_SECRET: Joi.string().min(32).required(),
  // jsonwebtoken/@nestjs/jwt duration strings, e.g. "15m", "30d".
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  // Goes into the User-Agent every source request sends (§7.3.2). A URL or a
  // mailto: address — both are contactable; an opaque string is not.
  SOURCE_USER_AGENT_CONTACT: Joi.string()
    .uri({ scheme: ['https', 'mailto'] })
    .default('https://github.com/mednal/Job-Matcher-AI'),
  // Rate limiting (§9). Defaults must match configuration.ts, which reads
  // process.env itself. `false` turns the in-process limiter off — for an
  // environment that limits at the edge, and for the e2e suite, which sends far
  // more requests from one address in a minute than any real client would.
  THROTTLE_ENABLED: Joi.boolean().default(true),
  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
  // Stricter, because /auth/* is where credentials are guessed.
  THROTTLE_AUTH_LIMIT: Joi.number().integer().min(1).default(10),
});
