// src/auth/auth.module.ts
import { Module, DynamicModule } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { User, RefreshToken, Role, Permission } from './entities';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { 
  JwtStrategy, 
  LocalStrategy, 
  GoogleStrategy, 
  MicrosoftStrategy,
  RefreshTokenStrategy 
} from './strategies';
import { 
  JwtAuthGuard, 
  LocalAuthGuard, 
  RolesGuard, 
  PermissionsGuard,
  ThrottlerBehindProxyGuard 
} from './guards';
import { RolesService } from './services/roles.service';
import { PermissionsService } from './services/permissions.service';
import { SessionService } from './services/session.service';
import { TwoFactorService } from './services/two-factor.service';
import { CryptoService } from './services/crypto.service';

/**
 * Dynamic Auth Module with customizable options
 * Implements Advanced NestJS patterns
 */
export interface AuthModuleOptions {
  useOAuth?: boolean;
  use2FA?: boolean;
  useRefreshTokenRotation?: boolean;
  sessionTimeout?: number;
}

@Module({})
export class AuthModule {
  /**
   * Dynamic module registration with async providers
   */
  static forRootAsync(options?: AuthModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        ConfigModule,
        PassportModule.register({ 
          defaultStrategy: 'jwt',
          session: false 
        }),
        
        // JWT Module with async configuration
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: async (config: ConfigService) => ({
            secret: config.get('jwt.secret'),
            signOptions: {
              expiresIn: config.get('jwt.expiresIn'),
              issuer: config.get('jwt.issuer'),
              audience: config.get('jwt.audience'),
            },
          }),
        }),

        // TypeORM entities
        TypeOrmModule.forFeature([User, RefreshToken, Role, Permission]),

        // Rate limiting
        ThrottlerModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            ttl: config.get('throttle.ttl'),
            limit: config.get('throttle.limit'),
          }),
        }),
      ],
      controllers: [AuthController],
      providers: [
        // Core services
        AuthService,
        RolesService,
        PermissionsService,
        SessionService,
        CryptoService,
        
        // Strategies
        JwtStrategy,
        LocalStrategy,
        RefreshTokenStrategy,
        
        // Conditional OAuth strategies
        ...(options?.useOAuth ? [GoogleStrategy, MicrosoftStrategy] : []),
        
        // 2FA service
        ...(options?.use2FA ? [TwoFactorService] : []),
        
        // Guards
        JwtAuthGuard,
        LocalAuthGuard,
        RolesGuard,
        PermissionsGuard,
        ThrottlerBehindProxyGuard,
        
        // Custom provider for auth options
        {
          provide: 'AUTH_OPTIONS',
          useValue: options || {},
        },
      ],
      exports: [
        AuthService,
        RolesService,
        PermissionsService,
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
      ],
    };
  }
}
