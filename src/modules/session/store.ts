import { 
  UserSession, 
  SessionStore, 
  SessionConfig, 
  ConversationMessage, 
  ConversationState 
} from '../../types.js';

/**
 * In-memory session store implementation for development
 */
export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, UserSession>();
  private config: SessionConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: SessionConfig) {
    this.config = config;
    this.startCleanupTimer();
  }

  async get(phoneNumber: string): Promise<UserSession | null> {
    const session = this.sessions.get(phoneNumber);
    
    if (!session) {
      return null;
    }

    // Check if session has expired
    if (new Date() > session.expiresAt) {
      await this.delete(phoneNumber);
      return null;
    }

    return session;
  }

  async set(phoneNumber: string, session: UserSession): Promise<void> {
    this.sessions.set(phoneNumber, { ...session });
  }

  async delete(phoneNumber: string): Promise<void> {
    this.sessions.delete(phoneNumber);
  }

  async exists(phoneNumber: string): Promise<boolean> {
    const session = await this.get(phoneNumber);
    return session !== null;
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [phoneNumber, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(phoneNumber);
        cleanedCount++;
      }
    }

    console.log(`Session cleanup completed. Removed ${cleanedCount} expired sessions.`);
    return cleanedCount;
  }

  async getAllActivePhoneNumbers(): Promise<string[]> {
    const activeNumbers: string[] = [];
    const now = new Date();

    for (const [phoneNumber, session] of this.sessions.entries()) {
      if (now <= session.expiresAt) {
        activeNumbers.push(phoneNumber);
      }
    }

    return activeNumbers;
  }

  async updateLastActive(phoneNumber: string): Promise<void> {
    const session = this.sessions.get(phoneNumber);
    if (session) {
      const now = new Date();
      session.lastActiveAt = now;
      session.expiresAt = new Date(now.getTime() + this.config.defaultTimeoutMs);
      session.state.lastInteraction = now;
    }
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      this.config.cleanupIntervalMs
    );
  }

  /**
   * Stop the cleanup timer
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Redis session store implementation for production
 * Note: Requires redis client to be passed in or configured
 */
export class RedisSessionStore implements SessionStore {
  private redisClient: any; // Would be Redis client instance
  private config: SessionConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: SessionConfig, redisClient?: any) {
    this.config = config;
    this.redisClient = redisClient;
    
    if (!redisClient) {
      throw new Error('Redis client is required for RedisSessionStore');
    }

    this.startCleanupTimer();
  }

  private getSessionKey(phoneNumber: string): string {
    return `session:${phoneNumber}`;
  }

  async get(phoneNumber: string): Promise<UserSession | null> {
    try {
      const sessionData = await this.redisClient.get(this.getSessionKey(phoneNumber));
      
      if (!sessionData) {
        return null;
      }

      const session: UserSession = JSON.parse(sessionData, (key, value) => {
        // Convert date strings back to Date objects
        if (key.includes('At') || key === 'timestamp' || key === 'lastInteraction') {
          return new Date(value);
        }
        return value;
      });

      // Check if session has expired
      if (new Date() > session.expiresAt) {
        await this.delete(phoneNumber);
        return null;
      }

      return session;
    } catch (error) {
      console.error(`Error getting session for ${phoneNumber}:`, error);
      return null;
    }
  }

  async set(phoneNumber: string, session: UserSession): Promise<void> {
    try {
      const sessionData = JSON.stringify(session);
      const ttlSeconds = Math.ceil(this.config.defaultTimeoutMs / 1000);
      
      await this.redisClient.setEx(
        this.getSessionKey(phoneNumber),
        ttlSeconds,
        sessionData
      );
    } catch (error) {
      console.error(`Error setting session for ${phoneNumber}:`, error);
      throw error;
    }
  }

  async delete(phoneNumber: string): Promise<void> {
    try {
      await this.redisClient.del(this.getSessionKey(phoneNumber));
    } catch (error) {
      console.error(`Error deleting session for ${phoneNumber}:`, error);
    }
  }

  async exists(phoneNumber: string): Promise<boolean> {
    try {
      const exists = await this.redisClient.exists(this.getSessionKey(phoneNumber));
      return exists === 1;
    } catch (error) {
      console.error(`Error checking session existence for ${phoneNumber}:`, error);
      return false;
    }
  }

  async cleanup(): Promise<number> {
    // Redis handles TTL-based expiration automatically
    // This method can be used for additional cleanup logic if needed
    console.log('Redis session cleanup - TTL handles automatic expiration');
    return 0;
  }

  async getAllActivePhoneNumbers(): Promise<string[]> {
    try {
      const keys = await this.redisClient.keys('session:*');
      return keys.map((key: string) => key.replace('session:', ''));
    } catch (error) {
      console.error('Error getting active phone numbers:', error);
      return [];
    }
  }

  async updateLastActive(phoneNumber: string): Promise<void> {
    const session = await this.get(phoneNumber);
    if (session) {
      const now = new Date();
      session.lastActiveAt = now;
      session.expiresAt = new Date(now.getTime() + this.config.defaultTimeoutMs);
      session.state.lastInteraction = now;
      await this.set(phoneNumber, session);
    }
  }

  private startCleanupTimer(): void {
    // Redis handles TTL-based expiration automatically
    this.cleanupInterval = setInterval(() => {
      console.log('Redis session cleanup - TTL handles automatic expiration');
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Stop the cleanup timer
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
