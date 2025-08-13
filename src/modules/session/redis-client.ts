import { createClient } from 'redis';
import { sessionConfig } from './config.js';

let redisClient: any = null;

/**
 * Create and connect to Redis client
 */
export async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  // Use Redis if configured, otherwise return null for in-memory storage
  if (!sessionConfig.redisUrl && !sessionConfig.redisOptions) {
    return null;
  }

  try {
    redisClient = createClient(sessionConfig.redisOptions);
    
    redisClient.on('error', (err: Error) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis Cloud');
    });

    redisClient.on('ready', () => {
      console.log('Redis client ready');
    });

    await redisClient.connect();
    
    // Test connection
    await redisClient.set('session_test', 'connected');
    const testResult = await redisClient.get('session_test');
    console.log('Redis connection test:', testResult);
    
    return redisClient;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    console.log('Falling back to in-memory storage');
    return null;
  }
}

/**
 * Close Redis connection
 */
export async function closeRedisClient() {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis connection closed');
  }
}
