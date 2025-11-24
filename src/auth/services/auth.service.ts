import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Inject,
  Scope,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, RefreshToken, UserStatus } from '../entities';
import { CryptoService } from './crypto.service';
import { SessionService } from './session.service';
import { RolesService } from './roles.service';
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dto';

/**
 * Enterprise-grade authentication service
 * Implements:
 * - JWT authentication
 * - Refresh token rotation
 * - Account locking
 * - Password policies
 * - Email verification
 * - Password reset
 * - OAuth integration points
 */
@Injectable({ scope: Scope.REQUEST })
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_TIME = 30 * 60 * 1000; // 30 minutes

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private cryptoService: CryptoService,
    private sessionService: SessionService,
    private rolesService: RolesService,
    @Inject(REQUEST) private request: Request,
  ) {}

  /**
   * Register new user
   */
  async register(registerDto: RegisterDto): Promise<{ user: User; tokens: any }> {
    this.logger.log(`Registration attempt for email: ${registerDto.email}`);

    // Check if user exists
    const existingUser = await this.userRepository.findOne({
      where: [
        { email: registerDto.email },
        { username: registerDto.username },
      ],
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    // Validate password strength
    this.validatePasswordStrength(registerDto.password);

    // Hash password
    const hashedPassword = await this.hashPassword(registerDto.password);

    // Generate email verification token
    const emailVerificationToken = this.cryptoService.generateToken();

    // Get default role
    const defaultRole = await this.rolesService.findByName('user');

    // Create user
    const user = this.userRepository.create({
      ...registerDto,
      password: hashedPassword,
      emailVerificationToken,
      roles: [defaultRole],
    });

    const savedUser = await this.userRepository.save(user);

    // Generate tokens
    const tokens = await this.generateTokens(savedUser);

    // Send verification email (async)
    this.sendVerificationEmail(savedUser.email, emailVerificationToken);

    this.logger.log(`User registered successfully: ${savedUser.id}`);

    return { user: savedUser, tokens };
  }

  /**
   * Login with email and password
   */
  async login(loginDto: LoginDto): Promise<{ user: User; tokens: any }> {
    const { email, password } = loginDto;
    this.logger.log(`Login attempt for email: ${email}`);

    // Find user
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked
    if (user.isLocked()) {
      throw new UnauthorizedException(
        `Account is locked until ${user.lockedUntil}`,
      );
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(password, user.password);

    if (!isPasswordValid) {
      await this.handleFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account status
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Reset failed attempts
    await this.resetFailedAttempts(user);

    // Update last login
    await this.updateLastLogin(user);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Create session
    await this.sessionService.createSession(user.id, this.getIpAddress());

    this.logger.log(`User logged in successfully: ${user.id}`);

    return { user, tokens };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    this.logger.log('Refresh token request');

    // Find refresh token
    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken },
      relations: ['user'],
    });

    if (!tokenRecord || !tokenRecord.isActive()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new tokens
    const newAccessToken = await this.generateAccessToken(tokenRecord.user);

    // Rotate refresh token
    const newRefreshToken = await this.rotateRefreshToken(tokenRecord);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    this.logger.log('Logout request');

    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken },
    });

    if (tokenRecord) {
      tokenRecord.revoked = true;
      tokenRecord.revokedAt = new Date();
      tokenRecord.revokedByIp = this.getIpAddress();
      await this.refreshTokenRepository.save(tokenRecord);
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(token: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    await this.userRepository.save(user);

    this.logger.log(`Email verified for user: ${user.id}`);
  }

  /**
   * Forgot password
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      // Don't reveal if user exists
      return;
    }

    const resetToken = this.cryptoService.generateToken();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = resetExpires;
    await this.userRepository.save(user);

    // Send reset email
    this.sendPasswordResetEmail(user.email, resetToken);

    this.logger.log(`Password reset requested for user: ${user.id}`);
  }

  /**
   * Reset password
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { passwordResetToken: dto.token },
    });

    if (!user || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    this.validatePasswordStrength(dto.newPassword);

    user.password = await this.hashPassword(dto.newPassword);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await this.userRepository.save(user);

    // Revoke all refresh tokens
    await this.revokeAllUserTokens(user.id);

    this.logger.log(`Password reset successfully for user: ${user.id}`);
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException();
    }

    const isValid = await this.verifyPassword(dto.currentPassword, user.password);

    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    this.validatePasswordStrength(dto.newPassword);

    user.password = await this.hashPassword(dto.newPassword);
    await this.userRepository.save(user);

    this.logger.log(`Password changed for user: ${user.id}`);
  }

  /**
   * Validate user by ID
   */
  async validateUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    return user;
  }

  /**
   * Private helper methods
   */
  private async generateTokens(user: User): Promise<any> {
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.createRefreshToken(user);

    return {
      accessToken,
      refreshToken: refreshToken.token,
      expiresIn: this.configService.get('jwt.expiresIn'),
      tokenType: 'Bearer',
    };
  }

  private async generateAccessToken(user: User): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      roles: user.roles.map((r) => r.name),
      permissions: user.roles.flatMap((r) =>
        r.permissions.map((p) => p.name),
      ),
    };

    return this.jwtService.signAsync(payload);
  }

  private async createRefreshToken(user: User): Promise<RefreshToken> {
    const token = this.cryptoService.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const refreshToken = this.refreshTokenRepository.create({
      token,
      user,
      expiresAt,
      createdByIp: this.getIpAddress(),
    });

    return this.refreshTokenRepository.save(refreshToken);
  }

  private async rotateRefreshToken(
    oldToken: RefreshToken,
  ): Promise<string> {
    const newToken = await this.createRefreshToken(oldToken.user);

    oldToken.revoked = true;
    oldToken.revokedAt = new Date();
    oldToken.replacedByToken = newToken.token;
    await this.refreshTokenRepository.save(oldToken);

    return newToken.token;
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async verifyPassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  private validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }

    if (!/(?=.*[a-z])/.test(password)) {
      throw new BadRequestException(
        'Password must contain at least one lowercase letter',
      );
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      throw new BadRequestException(
        'Password must contain at least one uppercase letter',
      );
    }

    if (!/(?=.*\d)/.test(password)) {
      throw new BadRequestException(
        'Password must contain at least one number',
      );
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      throw new BadRequestException(
        'Password must contain at least one special character',
      );
    }
  }

  private async handleFailedLogin(user: User): Promise<void> {
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= this.MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + this.LOCK_TIME);
      this.logger.warn(`Account locked for user: ${user.id}`);
    }

    await this.userRepository.save(user);
  }

  private async resetFailedAttempts(user: User): Promise<void> {
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await this.userRepository.save(user);
    }
  }

  private async updateLastLogin(user: User): Promise<void> {
    user.lastLoginAt = new Date();
    user.lastLoginIp = this.getIpAddress();
    await this.userRepository.save(user);
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { user: { id: userId }, revoked: false },
      { revoked: true, revokedAt: new Date() },
    );
  }

  private getIpAddress(): string {
    return (
      (this.request.headers['x-forwarded-for'] as string) ||
      this.request.socket.remoteAddress ||
      'unknown'
    );
  }

  private async sendVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    // Implement email sending logic
    this.logger.log(`Verification email sent to: ${email}`);
  }

  private async sendPasswordResetEmail(
    email: string,
    token: string,
  ): Promise<void> {
    // Implement email sending logic
    this.logger.log(`Password reset email sent to: ${email}`);
  }
}