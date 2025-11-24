import { Injectable, Logger } from '@nestjs/common';
import { ClientKafka, ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { Order } from './entities/order.entity';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    @Inject('KAFKA_SERVICE')
    private kafkaClient: ClientKafka,
    @Inject('RABBITMQ_SERVICE')
    private rabbitMqClient: ClientProxy,
  ) {}

  async onModuleInit() {
    // Subscribe to response topics if needed
    ['order.created.reply', 'order.status.changed.reply'].forEach((topic) => {
      this.kafkaClient.subscribeToResponseOf(topic);
    });
    await this.kafkaClient.connect();
  }

  async onModuleDestroy() {
    await this.kafkaClient.close();
    await this.rabbitMqClient.close();
  }

  /**
   * Publish order created event to Kafka
   */
  async publishOrderCreated(order: Order): Promise<void> {
    try {
      const event = {
        eventType: 'ORDER_CREATED',
        timestamp: new Date().toISOString(),
        data: {
          orderId: order.id,
          userId: order.userId,
          totalAmount: order.totalAmount,
          status: order.status,
          itemCount: order.items.length,
        },
      };

      this.kafkaClient.emit('order.created', event);
      this.logger.log(`Published ORDER_CREATED event for order: ${order.id}`);
      
      // Also send to RabbitMQ for other consumers
      await this.rabbitMqClient.emit('order_created', event).toPromise();
    } catch (error) {
      this.logger.error('Failed to publish order created event', error);
      throw error;
    }
  }

  /**
   * Publish order status changed event
   */
  async publishOrderStatusChanged(order: Order): Promise<void> {
    try {
      const event = {
        eventType: 'ORDER_STATUS_CHANGED',
        timestamp: new Date().toISOString(),
        data: {
          orderId: order.id,
          userId: order.userId,
          newStatus: order.status,
          totalAmount: order.totalAmount,
        },
      };

      this.kafkaClient.emit('order.status.changed', event);
      this.logger.log(
        `Published ORDER_STATUS_CHANGED event for order: ${order.id} - Status: ${order.status}`,
      );

      // Send notification via RabbitMQ
      if (order.status === 'shipped' || order.status === 'delivered') {
        await this.rabbitMqClient.emit('order_notification', {
          type: 'STATUS_UPDATE',
          orderId: order.id,
          userId: order.userId,
          status: order.status,
        }).toPromise();
      }
    } catch (error) {
      this.logger.error('Failed to publish status changed event', error);
      throw error;
    }
  }

  /**
   * Publish order cancelled event
   */
  async publishOrderCancelled(order: Order): Promise<void> {
    try {
      const event = {
        eventType: 'ORDER_CANCELLED',
        timestamp: new Date().toISOString(),
        data: {
          orderId: order.id,
          userId: order.userId,
          cancelReason: order.cancelReason,
          totalAmount: order.totalAmount,
        },
      };

      this.kafkaClient.emit('order.cancelled', event);
      await this.rabbitMqClient.emit('order_cancelled', event).toPromise();
      
      this.logger.log(`Published ORDER_CANCELLED event for order: ${order.id}`);
    } catch (error) {
      this.logger.error('Failed to publish order cancelled event', error);
    }
  }
}

