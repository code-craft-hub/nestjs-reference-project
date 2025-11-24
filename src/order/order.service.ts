import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Order, OrderStatus, OrderItem } from './entities/order.entity';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { EventPublisherService } from './event-publisher.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    private eventPublisher: EventPublisherService,
    @InjectQueue('order-processing')
    private orderQueue: Queue,
  ) {}

  /**
   * Create a new order with validation and event publishing
   */
  async createOrder(createOrderDto: CreateOrderDto): Promise<Order> {
    this.logger.log(`Creating order for user: ${createOrderDto.userId}`);

    // Calculate total amount
    const totalAmount = createOrderDto.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    // Create order entity
    const order = this.orderRepository.create({
      userId: createOrderDto.userId,
      totalAmount,
      status: OrderStatus.PENDING,
      shippingAddress: createOrderDto.shippingAddress,
      items: createOrderDto.items.map((item) => ({
        ...item,
        totalPrice: item.unitPrice * item.quantity,
      })),
    });

    // Save to database
    const savedOrder = await this.orderRepository.save(order);
    this.logger.log(`Order created with ID: ${savedOrder.id}`);

    // Publish event to Kafka
    await this.eventPublisher.publishOrderCreated(savedOrder);

    // Add to processing queue (BullMQ)
    await this.orderQueue.add('process-order', {
      orderId: savedOrder.id,
      userId: savedOrder.userId,
    });

    // Invalidate cache
    await this.invalidateUserOrdersCache(savedOrder.userId);

    return savedOrder;
  }

  /**
   * Find order by ID with caching
   */
  async findOne(id: string): Promise<Order> {
    const cacheKey = `order:${id}`;
    
    // Check cache first
    const cached = await this.cacheManager.get<Order>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for order: ${id}`);
      return cached;
    }

    // Fetch from database
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    // Store in cache
    await this.cacheManager.set(cacheKey, order, 300);
    
    return order;
  }

  /**
   * Find all orders for a user with pagination
   */
  async findByUser(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ orders: Order[]; total: number }> {
    const cacheKey = `user-orders:${userId}:${page}:${limit}`;
    
    const cached = await this.cacheManager.get<{ orders: Order[]; total: number }>(cacheKey);
    if (cached) {
      return cached;
    }

    const [orders, total] = await this.orderRepository.findAndCount({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const result = { orders, total };
    await this.cacheManager.set(cacheKey, result, 300);

    return result;
  }

  /**
   * Update order status with validation
   */
  async updateStatus(
    id: string,
    updateDto: UpdateOrderStatusDto,
  ): Promise<Order> {
    const order = await this.findOne(id);

    // Validate status transition
    this.validateStatusTransition(order.status, updateDto.status);

    order.status = updateDto.status;
    
    if (updateDto.status === OrderStatus.CANCELLED) {
      order.cancelledAt = new Date();
      order.cancelReason = updateDto.cancelReason ?? '';
    }

    const updatedOrder = await this.orderRepository.save(order);

    // Publish status change event
    await this.eventPublisher.publishOrderStatusChanged(updatedOrder);

    // Invalidate caches
    await this.cacheManager.del(`order:${id}`);
    await this.invalidateUserOrdersCache(order.userId);

    return updatedOrder;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(id: string, reason: string): Promise<Order> {
    return this.updateStatus(id, {
      status: OrderStatus.CANCELLED,
      cancelReason: reason,
    });
  }

  /**
   * Get order statistics
   */
  async getOrderStats(userId?: string): Promise<any> {
    const queryBuilder = this.orderRepository.createQueryBuilder('order');
    
    if (userId) {
      queryBuilder.where('order.userId = :userId', { userId });
    }

    const stats = await queryBuilder
      .select('order.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(order.totalAmount)', 'totalAmount')
      .groupBy('order.status')
      .getRawMany();

    return stats;
  }

  /**
   * Validate status transitions
   */
  private validateStatusTransition(
    currentStatus: OrderStatus,
    newStatus: OrderStatus,
  ): void {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  /**
   * Invalidate user orders cache
   */
  private async invalidateUserOrdersCache(userId: string): Promise<void> {
    // cache-manager's stored methods (like keys) are not exposed on the Cache type,
    // so cast to any to access store-specific APIs safely at runtime.
    const store: any = (this.cacheManager as any).store;
    const keys: string[] = typeof store?.keys === 'function' ? await store.keys(`user-orders:${userId}:*`) : [];
    if (keys.length === 0) {
      return;
    }
    await Promise.all(keys.map((key) => this.cacheManager.del(key)));
  }
}