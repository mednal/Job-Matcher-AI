import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHasherService } from './password-hasher.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UsersModule } from '../users/users.module';
import { RootConfig } from '../../common/config/configuration';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<RootConfig, true>) => ({
        secret: configService.get('auth.jwtSecret', { infer: true }),
        signOptions: {
          expiresIn: configService.get('auth.accessTtl', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasherService,
    RefreshTokenService,
    // Global: every route requires a valid access token unless it carries
    // @Public() (docs/ARCHITECTURE.md §9). Registered here, next to the JwtModule
    // it depends on, rather than in AppModule.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Order matters and is not cosmetic: global guards run in the order they are
    // registered, and RolesGuard reads the `request.user` that JwtAuthGuard
    // attaches. It must stay below JwtAuthGuard. It is a no-op on any route
    // without @Roles() (docs/ARCHITECTURE.md §9).
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
