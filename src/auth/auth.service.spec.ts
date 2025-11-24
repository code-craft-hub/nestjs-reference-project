import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { 
  UnauthorizedException, 
  ConflictException,
  BadRequestException 
} from '@nestjs/common';
import { AuthService } from '../../src/auth/services/auth.service';
import { User, RefreshToken, UserStatus } from '../../src/auth/entities';
import { CryptoService } from '../../src/auth/services/crypto.service';
import { SessionService } from '../../src/auth/services/session.service';
import { RolesService } from '../../src/auth/services/roles.service';

describe('AuthService - Unit Tests', () => {
  let service: AuthService;
  let userRepository: any;
  let refreshTokenRepository: any;
  let jwtService: any;
  let cryptoService: any;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    password: '$2b$12$hashedpassword',
    status: UserStatus.ACTIVE,
    emailVerified: true,
    roles: [{ name: 'user', permissions: [] } as any],
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('jwt-token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'jwt.secret': 'test-secret',
                'jwt.expiresIn': '15m',
              };
              return config[key];
            }),
          },
        },
        {
          provide: CryptoService,
          useValue: {
            generateToken: jest.fn().mockReturnValue('random-token'),
            hashPassword: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            createSession: jest.fn(),
          },
        },
        {
          provide: RolesService,
          useValue: {
            findByName: jest.fn().mockResolvedValue({ name: 'user' }),
          },
        },
        {
          provide: REQUEST,
          useValue: {
            headers: {},
            socket: { remoteAddress: '127.0.0.1' },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    refreshTokenRepository = module.get(getRepositoryToken(RefreshToken));
    jwtService = module.get<JwtService>(JwtService);
    cryptoService = module.get<CryptoService>(CryptoService);
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      refreshTokenRepository.create.mockReturnValue({});
      refreshTokenRepository.save.mockResolvedValue({
        token: 'refresh-token',
      });

      const result = await service.register({
        email: 'test@example.com',
        username: 'testuser',
        password: 'Test@1234',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if user exists', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          username: 'testuser',
          password: 'Test@1234',
          firstName: 'Test',
          lastName: 'User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for weak password', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.register({
          email: 'test@example.com',
          username: 'testuser',
          password: 'weak',
          firstName: 'Test',
          lastName: 'User',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const bcrypt = require('bcrypt');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      userRepository.findOne.mockResolvedValue(mockUser);
      refreshTokenRepository.create.mockReturnValue({});
      refreshTokenRepository.save.mockResolvedValue({
        token: 'refresh-token',
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'Test@1234',
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const bcrypt = require('bcrypt');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should lock account after max failed attempts', async () => {
      const bcrypt = require('bcrypt');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      const userWithFailedAttempts = {
        ...mockUser,
        failedLoginAttempts: 4,
      };

      userRepository.findOne.mockResolvedValue(userWithFailedAttempts);
      userRepository.save.mockResolvedValue({
        ...userWithFailedAttempts,
        failedLoginAttempts: 5,
        lockedUntil: expect.any(Date),
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      );
    });
  });

  describe('validateUser', () => {
    it('should return user for valid userId', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.validateUser('user-123');

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });

      await expect(service.validateUser('user-123')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

// test/auth/auth.integration.spec.ts - Integration Tests
// test/auth/auth.e2e.spec.ts - E2E Tests