/**
 * In-memory session store implementation for development
 */
export class InMemorySessionStore {
    sessions = new Map();
    config;
    cleanupInterval;
    constructor(config) {
        this.config = config;
        this.startCleanupTimer();
    }
    async get(phoneNumber) {
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
    async set(phoneNumber, session) {
        this.sessions.set(phoneNumber, { ...session });
    }
    async delete(phoneNumber) {
        this.sessions.delete(phoneNumber);
    }
    async exists(phoneNumber) {
        const session = await this.get(phoneNumber);
        return session !== null;
    }
    async cleanup() {
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
    async getAllActivePhoneNumbers() {
        const activeNumbers = [];
        const now = new Date();
        for (const [phoneNumber, session] of this.sessions.entries()) {
            if (now <= session.expiresAt) {
                activeNumbers.push(phoneNumber);
            }
        }
        return activeNumbers;
    }
    async updateLastActive(phoneNumber) {
        const session = this.sessions.get(phoneNumber);
        if (session) {
            const now = new Date();
            session.lastActiveAt = now;
            session.expiresAt = new Date(now.getTime() + this.config.defaultTimeoutMs);
            session.state.lastInteraction = now;
        }
    }
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => this.cleanup(), this.config.cleanupIntervalMs);
    }
    /**
     * Stop the cleanup timer
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}
/**
 * Redis session store implementation for production
 * Note: Requires redis client to be passed in or configured
 */
export class RedisSessionStore {
    redisClient; // Would be Redis client instance
    config;
    cleanupInterval;
    constructor(config, redisClient) {
        this.config = config;
        this.redisClient = redisClient;
        if (!redisClient) {
            throw new Error('Redis client is required for RedisSessionStore');
        }
        this.startCleanupTimer();
    }
    getSessionKey(phoneNumber) {
        return `session:${phoneNumber}`;
    }
    async get(phoneNumber) {
        try {
            const sessionData = await this.redisClient.get(this.getSessionKey(phoneNumber));
            if (!sessionData) {
                return null;
            }
            const session = JSON.parse(sessionData, (key, value) => {
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
        }
        catch (error) {
            console.error(`Error getting session for ${phoneNumber}:`, error);
            return null;
        }
    }
    async set(phoneNumber, session) {
        try {
            const sessionData = JSON.stringify(session);
            const ttlSeconds = Math.ceil(this.config.defaultTimeoutMs / 1000);
            await this.redisClient.setEx(this.getSessionKey(phoneNumber), ttlSeconds, sessionData);
        }
        catch (error) {
            console.error(`Error setting session for ${phoneNumber}:`, error);
            throw error;
        }
    }
    async delete(phoneNumber) {
        try {
            await this.redisClient.del(this.getSessionKey(phoneNumber));
        }
        catch (error) {
            console.error(`Error deleting session for ${phoneNumber}:`, error);
        }
    }
    async exists(phoneNumber) {
        try {
            const exists = await this.redisClient.exists(this.getSessionKey(phoneNumber));
            return exists === 1;
        }
        catch (error) {
            console.error(`Error checking session existence for ${phoneNumber}:`, error);
            return false;
        }
    }
    async cleanup() {
        // Redis handles TTL-based expiration automatically
        // This method can be used for additional cleanup logic if needed
        console.log('Redis session cleanup - TTL handles automatic expiration');
        return 0;
    }
    async getAllActivePhoneNumbers() {
        try {
            const keys = await this.redisClient.keys('session:*');
            return keys.map((key) => key.replace('session:', ''));
        }
        catch (error) {
            console.error('Error getting active phone numbers:', error);
            return [];
        }
    }
    async updateLastActive(phoneNumber) {
        const session = await this.get(phoneNumber);
        if (session) {
            const now = new Date();
            session.lastActiveAt = now;
            session.expiresAt = new Date(now.getTime() + this.config.defaultTimeoutMs);
            session.state.lastInteraction = now;
            await this.set(phoneNumber, session);
        }
    }
    startCleanupTimer() {
        // Redis handles TTL-based expiration automatically
        this.cleanupInterval = setInterval(() => {
            console.log('Redis session cleanup - TTL handles automatic expiration');
        }, this.config.cleanupIntervalMs);
    }
    /**
     * Stop the cleanup timer
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}
//# sourceMappingURL=store.js.map