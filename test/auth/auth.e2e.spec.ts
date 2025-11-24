
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Authentication E2E Tests', () => {
  let app: INestApplication;
  let authToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e@test.com',
          username: 'e2euser',
          password: 'Test@1234',
          firstName: 'E2E',
          lastName: 'Test',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.user).toHaveProperty('id');
          expect(res.body.data.tokens).toHaveProperty('accessToken');
          authToken = res.body.data.tokens.accessToken;
          refreshToken = res.body.data.tokens.refreshToken;
        });
    });

    it('should return 409 for duplicate email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e@test.com',
          username: 'anotheruser',
          password: 'Test@1234',
          firstName: 'E2E',
          lastName: 'Test',
        })
        .expect(409);
    });

    it('should return 400 for invalid input', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'weak',
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'e2e@test.com',
          password: 'Test@1234',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.tokens).toHaveProperty('accessToken');
        });
    });

    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'e2e@test.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    it('should get user profile with valid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('email', 'e2e@test.com');
        });
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh access token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('accessToken');
        });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = Array(15).fill(null);

      for (const _ of requests.slice(0, 10)) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: 'test@test.com',
            password: 'password',
          })
          .expect((res) => {
            expect([200, 401]).toContain(res.status);
          });
      }

      // 11th request should be rate limited
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@test.com',
          password: 'password',
        })
        .expect(429);
    });
  });
});