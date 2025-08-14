import { getRedisClient } from '../session/redis-client.js';
import { IncomingMessage } from './types.js';

// Global storage for abort controllers (in-memory)
declare global {
  var abortControllers: Map<string, AbortController> | undefined;
}

/**
 * Redis-based orchestrator state management for cross-instance coordination
 */
export class RedisOrchestratorState {
  private redisClient: any;
  private keyPrefix = 'orchestrator:';

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    this.redisClient = await getRedisClient();
    if (!this.redisClient) {
      console.warn('Redis not available, orchestrator state will use in-memory fallback');
    }
  }

  /**
   * Get the Redis key for a phone number's orchestrator state
   */
  private getStateKey(phoneNumber: string): string {
    return `${this.keyPrefix}state:${phoneNumber}`;
  }

  /**
   * Get the Redis key for a phone number's message batch
   */
  private getBatchKey(phoneNumber: string): string {
    return `${this.keyPrefix}batch:${phoneNumber}`;
  }

  /**
   * Get the Redis key for a phone number's processing lock
   */
  private getLockKey(phoneNumber: string): string {
    return `${this.keyPrefix}lock:${phoneNumber}`;
  }

  /**
   * Get the Redis key for a phone number's processing generation
   */
  private getGenerationKey(phoneNumber: string): string {
    return `${this.keyPrefix}generation:${phoneNumber}`;
  }

  /**
   * Acquire processing lock for a phone number
   */
  async acquireProcessingLock(phoneNumber: string, timeoutMs: number = 30000): Promise<boolean> {
    if (!this.redisClient) return true; // Fallback to allowing processing

    try {
      const lockKey = this.getLockKey(phoneNumber);
      const lockValue = `${Date.now()}_${Math.random()}`;
      const ttlSeconds = Math.ceil(timeoutMs / 1000);

      // Use SET with NX (only if not exists) and EX (expiration)
      const result = await this.redisClient.set(lockKey, lockValue, {
        NX: true, // Only set if key doesn't exist
        EX: ttlSeconds // Expire after ttlSeconds
      });

      const acquired = result === 'OK';
      if (acquired) {
        console.log(`🔒 Acquired processing lock for ${phoneNumber}`);
      } else {
        console.log(`⏳ Processing lock already held for ${phoneNumber}`);
      }

      return acquired;
    } catch (error) {
      console.error('Error acquiring processing lock:', error);
      return true; // Fallback to allowing processing
    }
  }

  /**
   * Release processing lock for a phone number
   */
  async releaseProcessingLock(phoneNumber: string): Promise<void> {
    if (!this.redisClient) return;

    try {
      const lockKey = this.getLockKey(phoneNumber);
      await this.redisClient.del(lockKey);
      console.log(`🔓 Released processing lock for ${phoneNumber}`);
    } catch (error) {
      console.error('Error releasing processing lock:', error);
    }
  }

  /**
   * Check if a phone number is currently being processed
   */
  async isProcessing(phoneNumber: string): Promise<boolean> {
    if (!this.redisClient) return false;

    try {
      const lockKey = this.getLockKey(phoneNumber);
      const exists = await this.redisClient.exists(lockKey);
      return exists === 1;
    } catch (error) {
      console.error('Error checking processing status:', error);
      return false;
    }
  }

  /**
   * Add a message to the batch for a phone number
   */
  async addMessageToBatch(phoneNumber: string, message: IncomingMessage): Promise<void> {
    if (!this.redisClient) return;

    try {
      const batchKey = this.getBatchKey(phoneNumber);
      const messageData = JSON.stringify(message);
      
      // Add to list with expiration
      await this.redisClient.multi()
        .rPush(batchKey, messageData)
        .expire(batchKey, 300) // 5 minutes expiration
        .exec();

      console.log(`📝 Added message to Redis batch for ${phoneNumber}: "${message.content}"`);
    } catch (error) {
      console.error('Error adding message to batch:', error);
    }
  }

  /**
   * Get all messages in the batch for a phone number
   */
  async getBatch(phoneNumber: string): Promise<IncomingMessage[]> {
    if (!this.redisClient) return [];

    try {
      const batchKey = this.getBatchKey(phoneNumber);
      const messages = await this.redisClient.lRange(batchKey, 0, -1);
      
      return messages.map((msg: string) => JSON.parse(msg));
    } catch (error) {
      console.error('Error getting batch:', error);
      return [];
    }
  }

  /**
   * Clear the batch for a phone number
   */
  async clearBatch(phoneNumber: string): Promise<void> {
    if (!this.redisClient) return;

    try {
      const batchKey = this.getBatchKey(phoneNumber);
      await this.redisClient.del(batchKey);
      console.log(`🧹 Cleared Redis batch for ${phoneNumber}`);
    } catch (error) {
      console.error('Error clearing batch:', error);
    }
  }

  /**
   * Get batch size for a phone number
   */
  async getBatchSize(phoneNumber: string): Promise<number> {
    if (!this.redisClient) return 0;

    try {
      const batchKey = this.getBatchKey(phoneNumber);
      return await this.redisClient.lLen(batchKey);
    } catch (error) {
      console.error('Error getting batch size:', error);
      return 0;
    }
  }

  /**
   * Set processing timeout for a phone number
   */
  async setProcessingTimeout(phoneNumber: string, timeoutMs: number): Promise<void> {
    if (!this.redisClient) return;

    try {
      const timeoutKey = `${this.keyPrefix}timeout:${phoneNumber}`;
      const expiresAt = Date.now() + timeoutMs;
      
      await this.redisClient.setEx(timeoutKey, Math.ceil(timeoutMs / 1000), expiresAt.toString());
      console.log(`⏰ Set processing timeout for ${phoneNumber} in ${timeoutMs}ms`);
    } catch (error) {
      console.error('Error setting processing timeout:', error);
    }
  }

  /**
   * Check if processing timeout has expired for a phone number
   */
  async hasProcessingTimeoutExpired(phoneNumber: string): Promise<boolean> {
    if (!this.redisClient) return true;

    try {
      const timeoutKey = `${this.keyPrefix}timeout:${phoneNumber}`;
      const expiresAtStr = await this.redisClient.get(timeoutKey);
      
      if (!expiresAtStr) return true;
      
      const expiresAt = parseInt(expiresAtStr, 10);
      return Date.now() >= expiresAt;
    } catch (error) {
      console.error('Error checking processing timeout:', error);
      return true;
    }
  }

  /**
   * Increment processing generation for a phone number (signals interruption needed)
   */
  async incrementProcessingGeneration(phoneNumber: string): Promise<number> {
    if (!this.redisClient) return 1;

    try {
      const generationKey = this.getGenerationKey(phoneNumber);
      const newGeneration = await this.redisClient.incr(generationKey);
      
      // Set expiration to cleanup old generations
      await this.redisClient.expire(generationKey, 600); // 10 minutes
      
      console.log(`🔄 Incremented processing generation for ${phoneNumber} to ${newGeneration}`);
      return newGeneration;
    } catch (error) {
      console.error('Error incrementing processing generation:', error);
      return 1;
    }
  }

  /**
   * Get current processing generation for a phone number
   */
  async getProcessingGeneration(phoneNumber: string): Promise<number> {
    if (!this.redisClient) return 1;

    try {
      const generationKey = this.getGenerationKey(phoneNumber);
      const generation = await this.redisClient.get(generationKey);
      return generation ? parseInt(generation, 10) : 1;
    } catch (error) {
      console.error('Error getting processing generation:', error);
      return 1;
    }
  }

  /**
   * Store abort controller reference for a processing generation
   */
  async setAbortController(phoneNumber: string, generation: number, abortController: AbortController): Promise<void> {
    // Store in-memory since AbortController can't be serialized to Redis
    // In a distributed setup, you'd use a different mechanism
    const key = `${phoneNumber}:${generation}`;
    if (!global.abortControllers) {
      global.abortControllers = new Map();
    }
    global.abortControllers.set(key, abortController);
    
    console.log(`📝 Stored abort controller for ${phoneNumber} generation ${generation}`);
  }

  /**
   * Get and remove abort controller for a processing generation
   */
  async getAbortController(phoneNumber: string, generation: number): Promise<AbortController | null> {
    const key = `${phoneNumber}:${generation}`;
    if (!global.abortControllers) {
      return null;
    }
    
    const controller = global.abortControllers.get(key);
    if (controller) {
      global.abortControllers.delete(key);
      console.log(`🗑️  Retrieved abort controller for ${phoneNumber} generation ${generation}`);
    }
    
    return controller || null;
  }

  /**
   * Abort current processing for a phone number
   */
  async abortCurrentProcessing(phoneNumber: string): Promise<boolean> {
    try {
      const currentGeneration = await this.getProcessingGeneration(phoneNumber);
      const abortController = await this.getAbortController(phoneNumber, currentGeneration);
      
      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
        console.log(`⏹️  Aborted processing for ${phoneNumber} generation ${currentGeneration}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error aborting current processing:', error);
      return false;
    }
  }

  /**
   * Get orchestrator statistics
   */
  async getStats(): Promise<{ activeUsers: number; totalBatches: number; processingUsers: number }> {
    if (!this.redisClient) {
      return { activeUsers: 0, totalBatches: 0, processingUsers: 0 };
    }

    try {
      // Get all batch keys
      const batchKeys = await this.redisClient.keys(`${this.keyPrefix}batch:*`);
      
      // Get all lock keys (processing users)
      const lockKeys = await this.redisClient.keys(`${this.keyPrefix}lock:*`);
      
      return {
        activeUsers: batchKeys.length,
        totalBatches: batchKeys.length,
        processingUsers: lockKeys.length
      };
    } catch (error) {
      console.error('Error getting orchestrator stats:', error);
      return { activeUsers: 0, totalBatches: 0, processingUsers: 0 };
    }
  }
}

// Export singleton instance
export const redisOrchestratorState = new RedisOrchestratorState();
