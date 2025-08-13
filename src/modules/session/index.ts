// Session manager exports
export { SessionManager } from './manager.js';
export { InMemorySessionStore, RedisSessionStore } from './store.js';
export { sessionConfig, getSessionConfig } from './config.js';
export { getRedisClient, closeRedisClient } from './redis-client.js';

// Re-export types for convenience
export type {
  UserSession,
  SessionStore,
  SessionConfig,
  ConversationMessage,
  ConversationState
} from '../../types.js';
