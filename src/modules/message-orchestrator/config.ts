import { OrchestratorConfig } from './types.js';

/**
 * Message orchestrator configuration
 */
export const orchestratorConfig: OrchestratorConfig = {
  // Wait 2 seconds for more messages before processing
  batchTimeoutMs: 2000,
  
  // Maximum 5 messages in a batch
  maxBatchSize: 5,
  
  // Maximum 30 seconds for processing a batch
  processingTimeoutMs: 30000
};
