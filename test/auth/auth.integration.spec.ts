
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../../src/auth/auth.module';
import { User } from '../../src/auth/entities/user.entity';

describe('AuthModule - Integration Tests', () => {
  let app: INestApplication;
  let authService: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5433,
          username: 'test',
          password: 'test',
          database: 'test_db',
          entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
          synchronize: true,
          dropSchema: true,
        }),
        AuthModule.forRootAsync({}),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get('AuthService');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('User Registration Flow', () => {
    it('should complete full registration workflow', async () => {
      const registerDto = {
        email: 'integration@test.com',
        username: 'integrationuser',
        password: 'Test@1234',
        firstName: 'Integration',
        lastName: 'Test',
      };

      const { user, tokens } = await authService.register(registerDto);

      expect(user).toBeDefined();
      expect(user.email).toBe(registerDto.email);
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
    });
  });

  describe('Authentication Flow', () => {
    it('should authenticate user and generate tokens', async () => {
      const loginDto = {
        email: 'integration@test.com',
        password: 'Test@1234',
      };

      const { user, tokens } = await authService.login(loginDto);

      expect(user).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
    });
  });
});
