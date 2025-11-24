
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CryptoService } from './crypto.service';

export interface Session {
  userId: string;
  ip: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
}

@Injectable()
export class SessionService {
  private readonly SESSION_PREFIX = 'session:';
  private readonly USER_SESSIONS_PREFIX = 'user-sessions:';
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private cryptoService: CryptoService,
  ) {}

  /**
   * Create new session
   */
  async createSession(
    userId: string,
    ip: string,
    userAgent?: string,
  ): Promise<string> {
    const sessionId = this.cryptoService.generateToken();
    const now = new Date();

    const session: Session = {
      userId,
      ip,
      userAgent,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.SESSION_TIMEOUT),
      lastActivity: now,
    };

    // Store session
    await this.cacheManager.set(
      `${this.SESSION_PREFIX}${sessionId}`,
      session,
      this.SESSION_TIMEOUT / 1000,
    );

    // Add to user sessions list
    const userSessions = await this.getUserSessions(userId);
    userSessions.push(sessionId);
    await this.cacheManager.set(
      `${this.USER_SESSIONS_PREFIX}${userId}`,
      userSessions,
      this.SESSION_TIMEOUT / 1000,
    );

    return sessionId;
  }

  /**
   * Get session
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return this.cacheManager.get<Session>(
      `${this.SESSION_PREFIX}${sessionId}`,
    );
  }

  /**
   * Update session activity
   */
  async updateActivity(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (session) {
      session.lastActivity = new Date();
      await this.cacheManager.set(
        `${this.SESSION_PREFIX}${sessionId}`,
        session,
        this.SESSION_TIMEOUT / 1000,
      );
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (session) {
      await this.cacheManager.del(`${this.SESSION_PREFIX}${sessionId}`);
      
      // Remove from user sessions
      const userSessions = await this.getUserSessions(session.userId);
      const index = userSessions.indexOf(sessionId);
      
      if (index > -1) {
        userSessions.splice(index, 1);
        await this.cacheManager.set(
          `${this.USER_SESSIONS_PREFIX}${session.userId}`,
          userSessions,
        );
      }
    }
  }

  /**
   * Get all user sessions
   */
  async getUserSessions(userId: string): Promise<string[]> {
    const sessions = await this.cacheManager.get<string[]>(
      `${this.USER_SESSIONS_PREFIX}${userId}`,
    );
    return sessions || [];
  }

  /**
   * Delete all user sessions
   */
  async deleteAllUserSessions(userId: string): Promise<void> {
    const sessionIds = await this.getUserSessions(userId);
    
    await Promise.all(
      sessionIds.map((id) =>
        this.cacheManager.del(`${this.SESSION_PREFIX}${id}`),
      ),
    );

    await this.cacheManager.del(`${this.USER_SESSIONS_PREFIX}${userId}`);
  }

  /**
   * Clean expired sessions
   */
  async cleanExpiredSessions(): Promise<void> {
    // This would typically be done by Redis TTL automatically
    // Implement custom cleanup if needed
  }
}