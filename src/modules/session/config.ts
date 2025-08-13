import { SessionConfig } from '../../types.js';

/**
 * Session configuration
 */
export const sessionConfig: SessionConfig = {
  // Session timeout: 1 hour
  defaultTimeoutMs: 60 * 60 * 1000,
  
  // Keep last 100 messages per conversation  
  maxConversationHistory: 100,
  
  // Cleanup expired sessions every 10 minutes
  cleanupIntervalMs: 10 * 60 * 1000,
  
  // Redis configuration
  redisUrl: process.env.REDIS_URL,
  redisOptions: {
    username: 'default',
    password: 'xQgISGWEP5BENFKUGfRd4L5swupjG9nW',
    socket: {
      host: 'redis-12992.c98.us-east-1-4.ec2.redns.redis-cloud.com',
      port: 12992
    }
  }
};
