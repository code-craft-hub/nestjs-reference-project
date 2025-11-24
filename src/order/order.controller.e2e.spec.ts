import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import { OrderStatus } from './entities/order.entity';

describe('OrderController (e2e)', () => {
  let app: INestApplication;

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

  describe('/api/v1/orders (POST)', () => {
    it('should create a new order', () => {
      return request(app.getHttpServer())
        .post('/api/v1/orders')
        .send({
          userId: 'user-123',
          items: [
            {
              productId: 'prod-1',
              productName: 'Laptop',
              quantity: 1,
              unitPrice: 999.99,
            },
          ],
          shippingAddress: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'USA',
          },
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data.status).toBe(OrderStatus.PENDING);
        });
    });

    it('should return 400 for invalid input', () => {
      return request(app.getHttpServer())
        .post('/api/v1/orders')
        .send({
          userId: 'user-123',
          // Missing required fields
        })
        .expect(400);
    });
  });

  describe('/api/v1/orders/:id (GET)', () => {
    it('should return 404 for non-existent order', () => {
      return request(app.getHttpServer())
        .get('/api/v1/orders/invalid-id')
        .expect(404);
    });
  });

  describe('/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
        });
    });
  });
});