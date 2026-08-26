import { NestFactory } from '@nestjs/core';
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { RootConfig } from './common/config/configuration';
import { API_PREFIX } from './common/http/api-prefix';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // docs/ARCHITECTURE.md §12: structured JSON logging, one object per line, so
    // a collector can index `requestId` instead of grepping a sentence. The same
    // format in development as in production — the format you debug against is
    // the format you ship. The global exception filter and RequestIdMiddleware
    // log objects, which this renders as fields.
    logger: new ConsoleLogger({ json: true, colors: false }),
  });
  const configService = app.get(ConfigService<RootConfig, true>);

  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: configService.get('app.corsOrigin', { infer: true }),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get('app.port', { infer: true });
  await app.listen(port);
}
void bootstrap();
