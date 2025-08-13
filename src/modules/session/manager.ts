import { 
  UserSession, 
  SessionStore, 
  SessionConfig, 
  ConversationMessage, 
  ConversationState 
} from '../../types.js';
import { InMemorySessionStore, RedisSessionStore } from './store.js';
import { getRedisClient } from './redis-client.js';

export class SessionManager {
  private store: SessionStore;
  private config: SessionConfig;
  private initialized: boolean = false;

  constructor(config: SessionConfig) {
    this.config = config;
    // Start with in-memory store, will upgrade to Redis if available
    this.store = new InMemorySessionStore(config);
    this.initializeStore();
  }

  private async initializeStore() {
    try {
      const redisClient = await getRedisClient();
      
      if (redisClient) {
        // Upgrade to Redis store
        this.store = new RedisSessionStore(this.config, redisClient);
        console.log('SessionManager upgraded to Redis store');
      } else {
        console.log('SessionManager using in-memory store');
      }
    } catch (error) {
      console.error('Failed to initialize Redis, using in-memory store:', error);
    }
    this.initialized = true;
  }

  private async ensureInitialized() {
    while (!this.initialized) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Get or create a session for a phone number
   */
  async getOrCreateSession(
    phoneNumber: string, 
    displayName?: string, 
    whatsappId?: string, 
    whatsappPhoneId?: string
  ): Promise<UserSession> {
    await this.ensureInitialized();
    let session = await this.store.get(phoneNumber);
    
    if (!session) {
      session = this.createNewSession(phoneNumber, displayName, whatsappId, whatsappPhoneId);
      await this.store.set(phoneNumber, session);
      console.log(`Created new session for ${phoneNumber}`);
    } else {
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
  async addMessage(
    phoneNumber: string, 
    role: 'user' | 'assistant', 
    content: string, 
    messageId?: string
  ): Promise<void> {
    const session = await this.getOrCreateSession(phoneNumber);
    
    const message: ConversationMessage = {
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
  }



  /**
   * Update conversation state
   */
  async updateConversationState(
    phoneNumber: string, 
    stateUpdate: Partial<ConversationState>
  ): Promise<void> {
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
  async getConversationHistory(phoneNumber: string, limit?: number): Promise<ConversationMessage[]> {
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
  async getConversationState(phoneNumber: string): Promise<ConversationState | null> {
    const session = await this.store.get(phoneNumber);
    return session?.state || null;
  }



  /**
   * Set conversation context
   */
  async setContext(phoneNumber: string, key: string, value: any): Promise<void> {
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
  async getContext(phoneNumber: string, key?: string): Promise<any> {
    const session = await this.store.get(phoneNumber);
    if (!session?.state.context) {
      return key ? undefined : {};
    }
    
    return key ? session.state.context[key] : session.state.context;
  }

  /**
   * Clear conversation history for a user
   */
  async clearConversationHistory(phoneNumber: string): Promise<void> {
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
  async deleteSession(phoneNumber: string): Promise<void> {
    await this.store.delete(phoneNumber);
    console.log(`Deleted session for ${phoneNumber}`);
  }

  /**
   * Manually trigger session cleanup
   */
  async cleanup(): Promise<number> {
    return await this.store.cleanup();
  }

  /**
   * Create a new session object
   */
  private createNewSession(
    phoneNumber: string, 
    displayName?: string, 
    whatsappId?: string, 
    whatsappPhoneId?: string
  ): UserSession {
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
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gracefully shutdown the session manager
   */
  async destroy(): Promise<void> {
    if (this.store instanceof InMemorySessionStore || this.store instanceof RedisSessionStore) {
      this.store.destroy();
    }
    console.log('SessionManager destroyed');
  }
}
