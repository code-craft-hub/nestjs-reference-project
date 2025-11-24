// test/order.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Queue } from 'bull';
// import { OrderService } from '../src/order/order.service';
// import { Order, OrderItem, OrderStatus } from '../src/order/entities/order.entity';
// import { EventPublisherService } from '../src/order/event-publisher.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OrderService } from './order.service';
import {  Order, OrderItem, OrderStatus } from './entities/order.entity';
import { EventPublisherService } from './event-publisher.service';

describe('OrderService', () => {
  let service: OrderService;
  let orderRepository: any;
  let cacheManager: any;
  let eventPublisher: any;
  let orderQueue: any;

  const mockOrder: Order = {
    id: 'order-123',
    userId: 'user-123',
    totalAmount: 1999.98,
    status: OrderStatus.PENDING,
    items: [],
    shippingAddress: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA',
    },
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    cancelledAt: new Date(),
    cancelReason: "",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: getRepositoryToken(Order),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OrderItem),
          useValue: {},
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            store: {
              keys: jest.fn().mockResolvedValue([]),
            },
          },
        },
        {
          provide: EventPublisherService,
          useValue: {
            publishOrderCreated: jest.fn(),
            publishOrderStatusChanged: jest.fn(),
          },
        },
        {
          provide: 'BullQueue_order-processing',
          useValue: {
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepository = module.get(getRepositoryToken(Order));
    cacheManager = module.get(CACHE_MANAGER);
    eventPublisher = module.get(EventPublisherService);
    orderQueue = module.get('BullQueue_order-processing');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOrder', () => {
    it('should create an order successfully', async () => {
      const createOrderDto = {
        userId: 'user-123',
        items: [
          {
            productId: 'prod-1',
            productName: 'Laptop',
            quantity: 1,
            unitPrice: 999.99,
          },
        ],
        shippingAddress: mockOrder.shippingAddress,
      };

      orderRepository.create.mockReturnValue(mockOrder);
      orderRepository.save.mockResolvedValue(mockOrder);

      const result = await service.createOrder(createOrderDto);

      expect(result).toEqual(mockOrder);
      expect(orderRepository.save).toHaveBeenCalled();
      expect(eventPublisher.publishOrderCreated).toHaveBeenCalledWith(mockOrder);
      expect(orderQueue.add).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return an order from cache', async () => {
      cacheManager.get.mockResolvedValue(mockOrder);

      const result = await service.findOne('order-123');

      expect(result).toEqual(mockOrder);
      expect(cacheManager.get).toHaveBeenCalledWith('order:order-123');
      expect(orderRepository.findOne).not.toHaveBeenCalled();
    });

    it('should fetch order from database and cache it', async () => {
      cacheManager.get.mockResolvedValue(null);
      orderRepository.findOne.mockResolvedValue(mockOrder);

      const result = await service.findOne('order-123');

      expect(result).toEqual(mockOrder);
      expect(orderRepository.findOne).toHaveBeenCalled();
      expect(cacheManager.set).toHaveBeenCalled();
    });

    it('should throw NotFoundException if order not found', async () => {
      cacheManager.get.mockResolvedValue(null);
      orderRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update order status successfully', async () => {
      const updatedOrder = { ...mockOrder, status: OrderStatus.CONFIRMED };
      
      jest.spyOn(service, 'findOne').mockResolvedValue(mockOrder);
      orderRepository.save.mockResolvedValue(updatedOrder);

      const result = await service.updateStatus('order-123', {
        status: OrderStatus.CONFIRMED,
      });

      expect(result.status).toBe(OrderStatus.CONFIRMED);
      expect(eventPublisher.publishOrderStatusChanged).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.DELIVERED,
      });

      await expect(
        service.updateStatus('order-123', {
          status: OrderStatus.PROCESSING,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
