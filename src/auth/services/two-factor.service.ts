
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { User } from '../entities/user.entity';
import { CryptoService } from './crypto.service';

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private cryptoService: CryptoService,
  ) {}

  /**
   * Generate 2FA secret and QR code
   */
  async generateSecret(
    userId: string,
  ): Promise<{ secret: string; qrCode: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const secret = speakeasy.generateSecret({
      name: `OrderService (${user.email})`,
      issuer: 'OrderService',
      length: 32,
    });

    // Encrypt secret before storing
    const encryptedSecret = this.cryptoService.encrypt(
      secret.base32,
      process.env.ENCRYPTION_KEY,
    );

    user.twoFactorSecret = encryptedSecret;
    await this.userRepository.save(user);

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode,
    };
  }

  /**
   * Verify 2FA token
   */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('2FA not enabled');
    }

    // Decrypt secret
    const secret = this.cryptoService.decrypt(
      user.twoFactorSecret,
      process.env.ENCRYPTION_KEY,
    );

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps tolerance
    });

    return verified;
  }

  /**
   * Enable 2FA
   */
  async enableTwoFactor(userId: string, token: string): Promise<string[]> {
    const isValid = await this.verifyToken(userId, token);

    if (!isValid) {
      throw new BadRequestException('Invalid 2FA token');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    
    // Generate recovery codes
    const recoveryCodes = this.generateRecoveryCodes();
    
    user.twoFactorEnabled = true;
    user.twoFactorRecoveryCodes = recoveryCodes.map((code) =>
      this.cryptoService.hash(code),
    );
    
    await this.userRepository.save(user);

    return recoveryCodes;
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactor(userId: string, token: string): Promise<void> {
    const isValid = await this.verifyToken(userId, token);

    if (!isValid) {
      throw new BadRequestException('Invalid 2FA token');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    
    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorRecoveryCodes = [];
    
    await this.userRepository.save(user);
  }

  /**
   * Verify recovery code
   */
  async verifyRecoveryCode(
    userId: string,
    recoveryCode: string,
  ): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.twoFactorRecoveryCodes) {
      return false;
    }

    const hashedCode = this.cryptoService.hash(recoveryCode);
    const index = user.twoFactorRecoveryCodes.indexOf(hashedCode);

    if (index === -1) {
      return false;
    }

    // Remove used recovery code
    user.twoFactorRecoveryCodes.splice(index, 1);
    await this.userRepository.save(user);

    return true;
  }

  /**
   * Generate recovery codes
   */
  private generateRecoveryCodes(count: number = 10): string[] {
    const codes: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const code = this.cryptoService.generateSecureRandom(8);
      codes.push(code);
    }

    return codes;
  }
}