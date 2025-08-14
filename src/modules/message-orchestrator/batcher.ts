import { IncomingMessage, MessageBatch, ProcessingState, OrchestratorConfig } from './types.js';
import { orchestratorConfig } from './config.js';

// Global state for message batching (using Map for functional approach)
const processingStates = new Map<string, ProcessingState>();

/**
 * Create a new processing state for a phone number
 */
const createProcessingState = (phoneNumber: string): ProcessingState => ({
  phoneNumber,
  isProcessing: false,
  pendingMessages: [],
  lastMessageAt: new Date(),
  shouldRestart: false,
  processingGeneration: 1
});

/**
 * Get processing state for a phone number
 */
export const getProcessingState = (phoneNumber: string): ProcessingState => {
  if (!processingStates.has(phoneNumber)) {
    processingStates.set(phoneNumber, createProcessingState(phoneNumber));
  }
  return processingStates.get(phoneNumber)!;
};

/**
 * Update processing state
 */
export const updateProcessingState = (phoneNumber: string, updates: Partial<ProcessingState>): void => {
  const current = getProcessingState(phoneNumber);
  const updated = { ...current, ...updates };
  processingStates.set(phoneNumber, updated);
};

/**
 * Clear timeout for a phone number
 */
export const clearProcessingTimeout = (phoneNumber: string): void => {
  const state = getProcessingState(phoneNumber);
  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
    updateProcessingState(phoneNumber, { timeoutId: undefined });
  }
};

/**
 * Create a message batch from pending messages
 */
export const createMessageBatch = (phoneNumber: string): MessageBatch | null => {
  const state = getProcessingState(phoneNumber);
  
  if (state.pendingMessages.length === 0) {
    return null;
  }

  const messages = [...state.pendingMessages];
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  return {
    phoneNumber,
    messages,
    firstMessageAt: firstMessage.timestamp,
    lastMessageAt: lastMessage.timestamp,
    whatsappPhoneId: firstMessage.whatsappPhoneId
  };
};

/**
 * Clear pending messages for a phone number
 */
export const clearPendingMessages = (phoneNumber: string): void => {
  updateProcessingState(phoneNumber, { 
    pendingMessages: [],
    isProcessing: false 
  });
};

/**
 * Add message to pending batch
 */
export const addToPendingBatch = (message: IncomingMessage): void => {
  const state = getProcessingState(message.from);
  const updatedMessages = [...state.pendingMessages, message];
  
  updateProcessingState(message.from, {
    pendingMessages: updatedMessages,
    lastMessageAt: message.timestamp
  });
};

/**
 * Check if should process batch immediately (max size reached)
 */
export const shouldProcessImmediately = (phoneNumber: string): boolean => {
  const state = getProcessingState(phoneNumber);
  return state.pendingMessages.length >= orchestratorConfig.maxBatchSize;
};

/**
 * Signal current processing to restart with new messages
 */
export const signalRestart = (phoneNumber: string): void => {
  const state = getProcessingState(phoneNumber);
  if (state.isProcessing) {
    updateProcessingState(phoneNumber, { shouldRestart: true });
    
    // Abort current processing if possible
    if (state.processingAbortController) {
      state.processingAbortController.abort();
    }
    
    console.log(`🔄 Signaled restart for ${phoneNumber} due to new message`);
  }
};

/**
 * Set processing abort controller
 */
export const setAbortController = (phoneNumber: string, controller: AbortController): void => {
  updateProcessingState(phoneNumber, { processingAbortController: controller });
};

/**
 * Check if processing should restart
 */
export const shouldRestartProcessing = (phoneNumber: string): boolean => {
  const state = getProcessingState(phoneNumber);
  return state.shouldRestart;
};

/**
 * Reset restart flag
 */
export const resetRestartFlag = (phoneNumber: string): void => {
  updateProcessingState(phoneNumber, { 
    shouldRestart: false, 
    processingAbortController: undefined 
  });
};

/**
 * Get batch statistics for monitoring
 */
export const getBatchStats = () => ({
  activeUsers: processingStates.size,
  processingUsers: Array.from(processingStates.values()).filter(s => s.isProcessing).length,
  totalPendingMessages: Array.from(processingStates.values())
    .reduce((sum, state) => sum + state.pendingMessages.length, 0)
});
