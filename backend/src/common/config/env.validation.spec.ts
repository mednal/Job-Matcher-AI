import { envValidationSchema } from './env.validation';
import configuration from './configuration';

describe('CORS_ORIGIN configuration', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
  };
  const cases: [string, boolean][] = [
    ['http://localhost:4200', true],
    ['http://localhost:4200,http://localhost:52562', true],
    [' http://localhost:4200 , http://localhost:52562 ', true],
    ['not a url', false],
    ['', false],
  ];
  it.each(cases)('%s', (value, valid) => {
    const { error } = envValidationSchema.validate({
      ...base,
      CORS_ORIGIN: value,
    });
    expect(error === undefined).toBe(valid);
  });

  it('parses into a trimmed list', () => {
    process.env.CORS_ORIGIN = 'http://localhost:4200, http://localhost:52562';
    expect(configuration().app.corsOrigin).toEqual([
      'http://localhost:4200',
      'http://localhost:52562',
    ]);
  });
});
