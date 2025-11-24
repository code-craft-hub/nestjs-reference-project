import { Injectable, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';

@Injectable()
export class EventConsumerService {
  private readonly logger = new Logger(EventConsumerService.name);

  /**
   * Handle payment processed event from Kafka
   */
  @EventPattern('payment.processed')
  async handlePaymentProcessed(
    @Payload() data: any,
    @Ctx() context: KafkaContext,
  ) {
    const { orderId, status, transactionId } = data;
    
    this.logger.log(
      `Received payment processed event for order: ${orderId}, status: ${status}`,
    );

    // Business logic to handle payment confirmation
    // Update order status, send confirmation email, etc.
    
    const originalMessage = context.getMessage();
    const partition = context.getPartition();
    const offset = originalMessage.offset;
    
    this.logger.debug(`Kafka offset: ${offset}, partition: ${partition}`);
  }

  /**
   * Handle inventory reserved event
   */
  @EventPattern('inventory.reserved')
  async handleInventoryReserved(@Payload() data: any) {
    const { orderId, products } = data;
    
    this.logger.log(`Inventory reserved for order: ${orderId}`);
    // Update order processing status
  }

  /**
   * Handle shipping update from RabbitMQ
   */
  @EventPattern('shipping_update')
  async handleShippingUpdate(@Payload() data: any) {
    const { orderId, trackingNumber, carrier } = data;
    
    this.logger.log(
      `Shipping update received for order: ${orderId}, tracking: ${trackingNumber}`,
    );
    // Update order with tracking information
  }
}