import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { RootConfig } from './common/config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<RootConfig, true>);

  app.setGlobalPrefix('api/v1');
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
