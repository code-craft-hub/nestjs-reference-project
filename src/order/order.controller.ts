import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { OrderService } from './order.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { CacheInterceptor } from '@nestjs/cache-manager';

/**
 * REST API Controller for Order Management
 * Implements RESTful endpoints for e-commerce order operations
 */
@ApiTags('orders')
@Controller('api/v1/orders')
@UseInterceptors(CacheInterceptor)
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly orderService: OrderService) {}

  /**
   * Create a new order
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({
    status: 201,
    description: 'Order created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  async createOrder(@Body() createOrderDto: CreateOrderDto) {
    this.logger.log(`REST: Creating order for user ${createOrderDto.userId}`);
    
    const order = await this.orderService.createOrder(createOrderDto);
    
    return {
      success: true,
      data: order,
      message: 'Order created successfully',
    };
  }

  /**
   * Get order by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async getOrder(@Param('id') id: string) {
    this.logger.log(`REST: Fetching order ${id}`);
    
    const order = await this.orderService.findOne(id);
    
    return {
      success: true,
      data: order,
    };
  }

  /**
   * Get orders by user ID with pagination
   */
  @Get('user/:userId')
  @ApiOperation({ summary: 'Get orders by user ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
  })
  async getUserOrders(
    @Param('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    this.logger.log(`REST: Fetching orders for user ${userId}`);
    
    const result = await this.orderService.findByUser(userId, page, limit);
    
    return {
      success: true,
      data: result.orders,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  }

  /**
   * Update order status
   */
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid status transition',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateOrderStatusDto,
  ) {
    this.logger.log(`REST: Updating order ${id} status to ${updateDto.status}`);
    
    const order = await this.orderService.updateStatus(id, updateDto);
    
    return {
      success: true,
      data: order,
      message: 'Order status updated successfully',
    };
  }

  /**
   * Cancel an order
   */
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an order' })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully',
  })
  async cancelOrder(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    this.logger.log(`REST: Cancelling order ${id}`);
    
    const order = await this.orderService.cancelOrder(id, reason);
    
    return {
      success: true,
      data: order,
      message: 'Order cancelled successfully',
    };
  }

  /**
   * Get order statistics
   */
  @Get('stats/summary')
  @ApiOperation({ summary: 'Get order statistics' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getOrderStats(@Query('userId') userId?: string) {
    this.logger.log(`REST: Fetching order stats`);
    
    const stats = await this.orderService.getOrderStats(userId);
    
    return {
      success: true,
      data: stats,
    };
  }
}

