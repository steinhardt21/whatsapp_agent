// Main orchestrator exports - Redis-based coordination
export { handleIncomingMessage, getProcessingStatus, getBatchStats } from './redis-entry-agent.js';
export { processBatch, combineMessages, getSessionManagerInstance } from './processor.js';
export { orchestratorConfig } from './config.js';

// Re-export types
export type {
  IncomingMessage,
  MessageBatch,
  ProcessingState,
  OrchestratorConfig
} from './types.js';
