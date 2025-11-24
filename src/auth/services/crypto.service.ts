import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly saltLength = 64;
  private readonly tagLength = 16;
  private readonly pbkdf2Iterations = 100000;

  /**
   * Generate secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate cryptographically secure random string
   */
  generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  encrypt(text: string, masterKey: string): string {
    const salt = crypto.randomBytes(this.saltLength);
    const key = crypto.pbkdf2Sync(
      masterKey,
      salt,
      this.pbkdf2Iterations,
      this.keyLength,
      'sha512',
    );
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')])
      .toString('base64');
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  decrypt(encryptedData: string, masterKey: string): string {
    const buffer = Buffer.from(encryptedData, 'base64');

    const salt = buffer.subarray(0, this.saltLength);
    const iv = buffer.subarray(this.saltLength, this.saltLength + this.ivLength);
    const tag = buffer.subarray(
      this.saltLength + this.ivLength,
      this.saltLength + this.ivLength + this.tagLength,
    );
    const encrypted = buffer.subarray(
      this.saltLength + this.ivLength + this.tagLength,
    );

    const key = crypto.pbkdf2Sync(
      masterKey,
      salt,
      this.pbkdf2Iterations,
      this.keyLength,
      'sha512',
    );

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Hash data using SHA-256
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Hash data using SHA-512
   */
  hashSHA512(data: string): string {
    return crypto.createHash('sha512').update(data).digest('hex');
  }

  /**
   * Generate HMAC
   */
  generateHMAC(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify HMAC
   */
  verifyHMAC(data: string, secret: string, hash: string): boolean {
    const computedHash = this.generateHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(computedHash),
      Buffer.from(hash),
    );
  }

  /**
   * Generate password hash with bcrypt
   */
  async hashPassword(password: string, rounds: number = 12): Promise<string> {
    return bcrypt.hash(password, rounds);
  }

  /**
   * Verify password with bcrypt
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

