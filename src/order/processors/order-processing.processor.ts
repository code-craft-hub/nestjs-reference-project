import {
  Process,
  Processor,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { OrderService } from '../order.service';
import { OrderStatus } from '../entities/order.entity';

/**
 * BullMQ Processor for asynchronous order processing
 * Handles background tasks like order validation, inventory checks, and notifications
 */
@Processor('order-processing')
export class OrderProcessingProcessor {
  private readonly logger = new Logger(OrderProcessingProcessor.name);

  constructor(private readonly orderService: OrderService) {}

  /**
   * Process order - Main job handler
   */
  @Process('process-order')
  async handleOrderProcessing(job: Job<{ orderId: string; userId: string }>) {
    this.logger.log(`Processing order job: ${job.id}`);
    const { orderId, userId } = job.data;

    try {
      await job.progress(20);
      await this.validateOrder(orderId);
      this.logger.log(`Order ${orderId} validated`);

      await job.progress(40);
      const inventoryAvailable = await this.checkInventory(orderId);

      if (!inventoryAvailable) {
        throw new Error('Insufficient inventory');
      }

      await job.progress(60);
      await this.reserveInventory(orderId);
      this.logger.log(`Inventory reserved for order ${orderId}`);

      await job.progress(80);
      await this.initiatePayment(orderId);

      await job.progress(100);
      await this.orderService.updateStatus(orderId, {
        status: OrderStatus.CONFIRMED,
      });

      this.logger.log(`Order ${orderId} processed successfully`);

      return {
        success: true,
        orderId,
        message: 'Order processed successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to process order ${orderId}:`, error);

      // Update order status to failed
      await this.orderService.updateStatus(orderId, {
        status: OrderStatus.CANCELLED,
        cancelReason: error.message,
      });

      throw error;
    }
  }

  /**
   * Send order notification
   */
  @Process('send-notification')
  async handleNotification(
    job: Job<{ orderId: string; type: string; userId: string }>,
  ) {
    this.logger.log(`Sending notification for order: ${job.data.orderId}`);
    const { orderId, type, userId } = job.data;

    try {
      // Simulate sending email/SMS notification
      await this.sendEmail(userId, type, orderId);
      await this.sendSMS(userId, type, orderId);

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send notification:`, error);
      throw error;
    }
  }

  /**
   * Generate invoice
   */
  @Process('generate-invoice')
  async handleInvoiceGeneration(job: Job<{ orderId: string }>) {
    this.logger.log(`Generating invoice for order: ${job.data.orderId}`);
    const { orderId } = job.data;

    try {
      const order = await this.orderService.findOne(orderId);

      // Simulate invoice generation
      const invoice = await this.generateInvoicePDF(order);

      this.logger.log(`Invoice generated for order ${orderId}`);

      return {
        success: true,
        invoiceUrl: invoice.url,
      };
    } catch (error) {
      this.logger.error(`Failed to generate invoice:`, error);
      throw error;
    }
  }

  /**
   * Queue lifecycle hooks
   */
  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`Job ${job.id} is now active`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(
      `Job ${job.id} completed with result: ${JSON.stringify(result)}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed with error: ${error.message}`);
  }

  /**
   * Private helper methods
   */
  private async validateOrder(orderId: string): Promise<void> {
    // Simulate validation logic
    await this.delay(500);
    const order = await this.orderService.findOne(orderId);

    if (!order.items || order.items.length === 0) {
      throw new Error('Order has no items');
    }
  }

  private async checkInventory(orderId: string): Promise<boolean> {
    // Simulate inventory check API call
    await this.delay(800);
    this.logger.debug(`Checking inventory for order ${orderId}`);

    // In real scenario, call inventory service
    return true;
  }

  private async reserveInventory(orderId: string): Promise<void> {
    // Simulate inventory reservation
    await this.delay(600);
    this.logger.debug(`Reserving inventory for order ${orderId}`);
  }

  private async initiatePayment(orderId: string): Promise<void> {
    // Simulate payment gateway integration
    await this.delay(1000);
    this.logger.debug(`Initiating payment for order ${orderId}`);
  }

  private async sendEmail(
    userId: string,
    type: string,
    orderId: string,
  ): Promise<void> {
    await this.delay(300);
    this.logger.debug(`Email sent to user ${userId} for order ${orderId}`);
  }

  private async sendSMS(
    userId: string,
    type: string,
    orderId: string,
  ): Promise<void> {
    await this.delay(200);
    this.logger.debug(`SMS sent to user ${userId} for order ${orderId}`);
  }

  private async generateInvoicePDF(order: any): Promise<{ url: string }> {
    await this.delay(1500);
    return {
      url: `https://storage.example.com/invoices/${order.id}.pdf`,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
