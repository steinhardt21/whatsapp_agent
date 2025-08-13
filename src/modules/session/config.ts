import { SessionConfig } from '../../types.js';

/**
 * Get session configuration (reads environment variables dynamically)
 */
export function getSessionConfig(): SessionConfig {
  return {
    // Session timeout: 1 hour
    defaultTimeoutMs: 60 * 60 * 1000,
    
    // Keep last 100 messages per conversation  
    maxConversationHistory: 100,
    
    // Cleanup expired sessions every 10 minutes
    cleanupIntervalMs: 10 * 60 * 1000,
    
    // Redis configuration
    redisUrl: process.env.REDIS_URL,
    redisOptions: {
      username: process.env.REDIS_USERNAME || 'default',
      password: process.env.REDIS_PASSWORD,
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
      }
    }
  };
}

/**
 * Session configuration (for backward compatibility)
 */
export const sessionConfig: SessionConfig = getSessionConfig();
