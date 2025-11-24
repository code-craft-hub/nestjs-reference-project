import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { OrderService } from './order.service';

/**
 * GRPC Controller for Order Management
 * Implements gRPC methods for high-performance inter-service communication
 */
@Controller()
export class OrderGrpcController {
  private readonly logger = new Logger(OrderGrpcController.name);

  constructor(private readonly orderService: OrderService) {}

  @GrpcMethod('OrderService', 'CreateOrder')
  async createOrder(data: any) {
    this.logger.log(`GRPC: Creating order for user ${data.userId}`);
    
    const order = await this.orderService.createOrder({
      userId: data.userId,
      items: data.items,
      shippingAddress: data.shippingAddress,
    });

    return {
      orderId: order.id,
      status: order.status,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt.toISOString(),
    };
  }

  @GrpcMethod('OrderService', 'GetOrder')
  async getOrder(data: { id: string }) {
    this.logger.log(`GRPC: Fetching order ${data.id}`);
    
    const order = await this.orderService.findOne(data.id);

    return {
      id: order.id,
      userId: order.userId,
      status: order.status,
      totalAmount: order.totalAmount,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt.toISOString(),
    };
  }

  @GrpcMethod('OrderService', 'UpdateOrderStatus')
  async updateOrderStatus(data: { id: string; status: string }) {
    this.logger.log(`GRPC: Updating order ${data.id} status to ${data.status}`);
    
    const order = await this.orderService.updateStatus(data.id, {
      status: data.status as any,
    });

    return {
      success: true,
      orderId: order.id,
      status: order.status,
    };
  }
}