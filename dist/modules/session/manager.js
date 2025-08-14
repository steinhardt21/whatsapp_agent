import { InMemorySessionStore, RedisSessionStore } from './store.js';
import { getRedisClient } from './redis-client.js';
import { getUserProfileManager } from '../user-profile/index.js';
export class SessionManager {
    store;
    config;
    initialized = false;
    constructor(config) {
        this.config = config;
        // Start with in-memory store, will upgrade to Redis if available
        this.store = new InMemorySessionStore(config);
        this.initializeStore();
    }
    async initializeStore() {
        try {
            const redisClient = await getRedisClient();
            if (redisClient) {
                // Upgrade to Redis store
                this.store = new RedisSessionStore(this.config, redisClient);
                console.log('SessionManager upgraded to Redis store');
            }
            else {
                console.log('SessionManager using in-memory store');
            }
        }
        catch (error) {
            console.error('Failed to initialize Redis, using in-memory store:', error);
        }
        this.initialized = true;
    }
    async ensureInitialized() {
        while (!this.initialized) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    /**
     * Get or create a session for a phone number
     */
    async getOrCreateSession(phoneNumber, displayName, whatsappId, whatsappPhoneId) {
        await this.ensureInitialized();
        let session = await this.store.get(phoneNumber);
        if (!session) {
            session = this.createNewSession(phoneNumber, displayName, whatsappId, whatsappPhoneId);
            await this.store.set(phoneNumber, session);
            console.log(`Created new session for ${phoneNumber}`);
        }
        else {
            // Update WhatsApp IDs if provided and not already set
            let updated = false;
            if (whatsappId && !session.whatsappId) {
                session.whatsappId = whatsappId;
                updated = true;
            }
            if (whatsappPhoneId && !session.whatsappPhoneId) {
                session.whatsappPhoneId = whatsappPhoneId;
                updated = true;
            }
            if (displayName && !session.displayName) {
                session.displayName = displayName;
                updated = true;
            }
            // Update last active time
            await this.store.updateLastActive(phoneNumber);
            // Save if we updated any fields
            if (updated) {
                await this.store.set(phoneNumber, session);
            }
        }
        return session;
    }
    /**
     * Add a message to the conversation history
     */
    async addMessage(phoneNumber, role, content, messageId) {
        const session = await this.getOrCreateSession(phoneNumber);
        const message = {
            id: this.generateMessageId(),
            role,
            content,
            timestamp: new Date(),
            messageId
        };
        session.conversationHistory.push(message);
        session.state.messageCount++;
        session.state.lastInteraction = new Date();
        // Trim conversation history if it exceeds the limit
        if (session.conversationHistory.length > this.config.maxConversationHistory) {
            const excess = session.conversationHistory.length - this.config.maxConversationHistory;
            session.conversationHistory.splice(0, excess);
            console.log(`Trimmed ${excess} old messages from conversation history for ${phoneNumber}`);
        }
        await this.store.set(phoneNumber, session);
        // Also save to user profile for persistent storage (49 messages max, 1 week TTL)
        try {
            const profileManager = getUserProfileManager();
            await profileManager.addConversationMessage(phoneNumber, role, content, messageId);
        }
        catch (error) {
            console.error('Failed to save message to user profile:', error);
        }
    }
    /**
     * Update conversation state
     */
    async updateConversationState(phoneNumber, stateUpdate) {
        const session = await this.getOrCreateSession(phoneNumber);
        session.state = {
            ...session.state,
            ...stateUpdate,
            lastInteraction: new Date()
        };
        await this.store.set(phoneNumber, session);
    }
    /**
     * Get conversation history for a phone number
     */
    async getConversationHistory(phoneNumber, limit) {
        const session = await this.store.get(phoneNumber);
        if (!session) {
            return [];
        }
        const history = session.conversationHistory;
        return limit ? history.slice(-limit) : history;
    }
    /**
     * Get conversation state
     */
    async getConversationState(phoneNumber) {
        const session = await this.store.get(phoneNumber);
        return session?.state || null;
    }
    /**
     * Set conversation context
     */
    async setContext(phoneNumber, key, value) {
        const session = await this.getOrCreateSession(phoneNumber);
        if (!session.state.context) {
            session.state.context = {};
        }
        session.state.context[key] = value;
        await this.store.set(phoneNumber, session);
    }
    /**
     * Get conversation context
     */
    async getContext(phoneNumber, key) {
        const session = await this.store.get(phoneNumber);
        if (!session?.state.context) {
            return key ? undefined : {};
        }
        return key ? session.state.context[key] : session.state.context;
    }
    /**
     * Remove the last message of a specific role from conversation history
     */
    async removeLastMessage(phoneNumber, role) {
        const session = await this.store.get(phoneNumber);
        if (!session || session.conversationHistory.length === 0) {
            return false;
        }
        // Find the last message with the specified role
        for (let i = session.conversationHistory.length - 1; i >= 0; i--) {
            if (session.conversationHistory[i].role === role) {
                session.conversationHistory.splice(i, 1);
                session.state.messageCount = Math.max(0, session.state.messageCount - 1);
                await this.store.set(phoneNumber, session);
                console.log(`Removed last ${role} message from conversation history for ${phoneNumber}`);
                return true;
            }
        }
        return false; // No message with specified role found
    }
    /**
     * Clear conversation history for a user
     */
    async clearConversationHistory(phoneNumber) {
        const session = await this.store.get(phoneNumber);
        if (session) {
            session.conversationHistory = [];
            session.state.messageCount = 0;
            await this.store.set(phoneNumber, session);
        }
    }
    /**
     * Delete a session completely
     */
    async deleteSession(phoneNumber) {
        await this.store.delete(phoneNumber);
        console.log(`Deleted session for ${phoneNumber}`);
    }
    /**
     * Manually trigger session cleanup
     */
    async cleanup() {
        return await this.store.cleanup();
    }
    /**
     * Create a new session object
     */
    createNewSession(phoneNumber, displayName, whatsappId, whatsappPhoneId) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.config.defaultTimeoutMs);
        return {
            phoneNumber,
            whatsappId,
            whatsappPhoneId,
            displayName,
            createdAt: now,
            lastActiveAt: now,
            expiresAt,
            conversationHistory: [],
            state: {
                lastInteraction: now,
                messageCount: 0,
                awaitingResponse: false
            },
            metadata: {}
        };
    }
    /**
     * Generate a unique message ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Gracefully shutdown the session manager
     */
    async destroy() {
        if (this.store instanceof InMemorySessionStore || this.store instanceof RedisSessionStore) {
            this.store.destroy();
        }
        console.log('SessionManager destroyed');
    }
}
//# sourceMappingURL=manager.js.map