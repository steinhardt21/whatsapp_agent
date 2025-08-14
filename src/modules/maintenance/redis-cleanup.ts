/**
 * Redis Maintenance and Cleanup Module
 * 
 * Handles periodic cleanup of expired user profiles and conversation history
 * to maintain Redis performance and storage efficiency.
 */

import { getUserProfileManager } from '../user-profile/index.js';
import { getRedisClient } from '../session/redis-client.js';

export class RedisMaintenanceManager {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Start automatic maintenance with configurable interval
   */
  startMaintenance(intervalHours: number = 24): void {
    if (this.isRunning) {
      console.log('⚠️  Redis maintenance already running');
      return;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000; // Convert hours to milliseconds
    
    this.intervalId = setInterval(async () => {
      await this.runMaintenance();
    }, intervalMs);

    this.isRunning = true;
    console.log(`🧹 Redis maintenance started - running every ${intervalHours} hours`);

    // Run initial maintenance
    setTimeout(() => this.runMaintenance(), 5000); // 5 seconds after start
  }

  /**
   * Stop automatic maintenance
   */
  stopMaintenance(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 Redis maintenance stopped');
  }

  /**
   * Run maintenance tasks manually
   */
  async runMaintenance(): Promise<MaintenanceReport> {
    console.log('🧹 Starting Redis maintenance...');
    const startTime = Date.now();

    const report: MaintenanceReport = {
      timestamp: new Date(),
      expiredProfilesRemoved: 0,
      totalProfiles: 0,
      redisMemoryBefore: 0,
      redisMemoryAfter: 0,
      maintenanceDuration: 0,
      errors: []
    };

    try {
      // Get Redis memory usage before cleanup
      report.redisMemoryBefore = await this.getRedisMemoryUsage();

      // Clean up expired user profiles
      const profileManager = getUserProfileManager();
      report.expiredProfilesRemoved = await profileManager.cleanupExpiredProfiles();

      // Get total remaining profiles
      const allProfiles = await profileManager.getAllProfiles();
      report.totalProfiles = allProfiles.length;

      // Additional Redis cleanup (remove any orphaned keys)
      await this.cleanupOrphanedKeys();

      // Get Redis memory usage after cleanup
      report.redisMemoryAfter = await this.getRedisMemoryUsage();

      // Calculate duration
      report.maintenanceDuration = Date.now() - startTime;

      console.log('✅ Redis maintenance completed:', {
        expiredProfilesRemoved: report.expiredProfilesRemoved,
        totalProfilesRemaining: report.totalProfiles,
        memoryFreed: `${((report.redisMemoryBefore - report.redisMemoryAfter) / 1024 / 1024).toFixed(2)}MB`,
        duration: `${report.maintenanceDuration}ms`
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      report.errors.push(errorMessage);
      console.error('❌ Redis maintenance error:', error);
    }

    return report;
  }

  /**
   * Get Redis memory usage statistics
   */
  private async getRedisMemoryUsage(): Promise<number> {
    try {
      const redisClient = await getRedisClient();
      if (!redisClient) return 0;

      const info = await redisClient.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      return memoryMatch ? parseInt(memoryMatch[1]) : 0;
    } catch (error) {
      console.error('Failed to get Redis memory usage:', error);
      return 0;
    }
  }

  /**
   * Clean up any orphaned Redis keys
   */
  private async cleanupOrphanedKeys(): Promise<void> {
    try {
      const redisClient = await getRedisClient();
      if (!redisClient) return;

      // Get all keys and check for patterns that might be orphaned
      const allKeys = await redisClient.keys('*');
      let orphanedCount = 0;

      for (const key of allKeys) {
        try {
          // Check TTL - if key has no expiration but should have one
          const ttl = await redisClient.ttl(key);
          
          // If key is a user profile without TTL, it might be orphaned
          if (key.startsWith('user_profile:') && ttl === -1) {
            const data = await redisClient.get(key);
            if (data) {
              const profile = JSON.parse(data);
              if (profile.expiresAt && new Date(profile.expiresAt) < new Date()) {
                await redisClient.del(key);
                orphanedCount++;
                console.log(`🗑️  Removed orphaned profile key: ${key}`);
              }
            }
          }
        } catch (error) {
          console.error(`Error processing key ${key}:`, error);
        }
      }

      if (orphanedCount > 0) {
        console.log(`🧹 Cleaned up ${orphanedCount} orphaned keys`);
      }
    } catch (error) {
      console.error('Failed to cleanup orphaned keys:', error);
    }
  }

  /**
   * Get maintenance status
   */
  getStatus(): MaintenanceStatus {
    return {
      isRunning: this.isRunning,
      nextRun: this.intervalId ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null // Approximate next run
    };
  }

  /**
   * Force cleanup of all expired data immediately
   */
  async forceCleanup(): Promise<MaintenanceReport> {
    console.log('🚨 Force cleanup initiated...');
    return this.runMaintenance();
  }
}

export interface MaintenanceReport {
  timestamp: Date;
  expiredProfilesRemoved: number;
  totalProfiles: number;
  redisMemoryBefore: number;
  redisMemoryAfter: number;
  maintenanceDuration: number;
  errors: string[];
}

export interface MaintenanceStatus {
  isRunning: boolean;
  nextRun: Date | null;
}

// Global singleton instance
let maintenanceManagerInstance: RedisMaintenanceManager | null = null;

export function getMaintenanceManager(): RedisMaintenanceManager {
  if (!maintenanceManagerInstance) {
    maintenanceManagerInstance = new RedisMaintenanceManager();
  }
  return maintenanceManagerInstance;
}
