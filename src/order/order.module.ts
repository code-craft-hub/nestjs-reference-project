import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Order, OrderItem } from './entities/order.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { OrderGrpcController } from './order-grpc.controller';
import { EventPublisherService } from './event-publisher.service';
import { EventConsumerService } from './event-consumer.service';
import { OrderProcessingProcessor } from './processors/order-processing.processor';

@Module({
  imports: [
    // TypeORM Entities
    TypeOrmModule.forFeature([Order, OrderItem]),

    // Kafka Client
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const clientId = config.get<string>('kafka.clientId') ?? 'order-service';
          const broker = config.get<string>('kafka.broker') ?? 'localhost:9092';
          return {
            transport: Transport.KAFKA,
            options: {
              client: {
                clientId,
                brokers: [broker],
              },
              consumer: {
                groupId: 'order-consumer-group',
              },
            },
          };
        },
      },
    ]),

    // RabbitMQ Client
    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get('rabbitmq.url')],
            queue: 'order_queue',
            queueOptions: {
              durable: true,
            },
          },
        }),
      },
    ]),

    // BullMQ Queues
    BullModule.registerQueue({
      name: 'order-processing',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  controllers: [
    OrderController,
    OrderGrpcController,
  ],
  providers: [
    OrderService,
    EventPublisherService,
    EventConsumerService,
    OrderProcessingProcessor,
  ],
  exports: [OrderService],
})
export class OrderModule {}