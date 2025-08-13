import { IncomingMessage, MessageBatch } from './types.js';
import { orchestratorConfig } from './config.js';
import { redisOrchestratorState } from './redis-state.js';
import { processBatch } from './processor.js';
import { SessionManager, getSessionConfig } from '../session/index.js';
import { sendMessage } from '../whatsapp/messaging.js';

// Initialize session manager
const sessionManager = new SessionManager(getSessionConfig());

/**
 * Main entry point for incoming messages with Redis coordination
 */
export const handleIncomingMessage = async (
  messageId: string,
  phoneNumber: string,
  userMessage: string,
  whatsappPhoneId?: string
): Promise<void> => {
  console.log(`📨 Redis entry agent received message from ${phoneNumber}: "${userMessage}"`);

  try {
    // Handle RESET command immediately, bypassing batching
    if (userMessage.trim().toUpperCase() === 'RESET') {
      console.log(`🔄 RESET command received from ${phoneNumber} - processing immediately`);
      
      await sessionManager.clearConversationHistory(phoneNumber);
      await sessionManager.deleteSession(phoneNumber);
      await sendMessage(phoneNumber, 'Reset completato. Conversazione cancellata. Ricominciamo da capo! 🔄');
      
      console.log(`✅ Reset completed for ${phoneNumber}`);
      return;
    }

    // Create incoming message object
    const incomingMessage: IncomingMessage = {
      id: messageId,
      from: phoneNumber,
      content: userMessage,
      timestamp: new Date(),
      whatsappPhoneId
    };

    // Add message to batch in Redis
    await redisOrchestratorState.addMessageToBatch(phoneNumber, incomingMessage);
    
    // Check if someone else is already processing this user
    const isAlreadyProcessing = await redisOrchestratorState.isProcessing(phoneNumber);
    
    if (isAlreadyProcessing) {
      console.log(`⚠️  User ${phoneNumber} is already being processed by another instance - message added to batch`);
      return; // Message is added to batch, let the current processor handle it
    }

    // Try to acquire processing lock
    const lockAcquired = await redisOrchestratorState.acquireProcessingLock(phoneNumber, 30000);
    
    if (!lockAcquired) {
      console.log(`🔒 Could not acquire lock for ${phoneNumber} - another instance is processing`);
      return; // Another instance will handle the batched messages
    }

    // Check batch size - process immediately if max size reached
    const batchSize = await redisOrchestratorState.getBatchSize(phoneNumber);
    
    if (batchSize >= orchestratorConfig.maxBatchSize) {
      console.log(`🚀 Max batch size (${orchestratorConfig.maxBatchSize}) reached for ${phoneNumber} - processing immediately`);
      await processUserBatch(phoneNumber);
    } else {
      console.log(`⏱️  Scheduling batch processing for ${phoneNumber} in ${orchestratorConfig.batchTimeoutMs}ms (batch size: ${batchSize})`);
      
      // Schedule processing after delay
      setTimeout(async () => {
        try {
          await processUserBatch(phoneNumber);
        } catch (error) {
          console.error(`❌ Error in scheduled batch processing for ${phoneNumber}:`, error);
          await redisOrchestratorState.releaseProcessingLock(phoneNumber);
        }
      }, orchestratorConfig.batchTimeoutMs);
    }

  } catch (error) {
    console.error(`❌ Error in Redis entry agent for ${phoneNumber}:`, error);
    await redisOrchestratorState.releaseProcessingLock(phoneNumber);
  }
};

/**
 * Process the accumulated batch for a user
 */
const processUserBatch = async (phoneNumber: string): Promise<void> => {
  let lockHeld = false;
  
  try {
    // Double-check we still have the lock (in case of timing issues)
    const stillProcessing = await redisOrchestratorState.isProcessing(phoneNumber);
    if (!stillProcessing) {
      console.log(`⚠️  Lock expired for ${phoneNumber} - skipping processing`);
      return;
    }
    
    lockHeld = true;

    // Get all messages in the batch
    const messages = await redisOrchestratorState.getBatch(phoneNumber);
    
    if (messages.length === 0) {
      console.log(`📭 No messages in batch for ${phoneNumber}`);
      return;
    }

    console.log(`📦 Processing Redis batch for ${phoneNumber}: ${messages.length} messages`);
    console.log(`📝 Messages: ${messages.map(m => `"${m.content}"`).join(', ')}`);

    // Create message batch
    const batch: MessageBatch = {
      phoneNumber,
      messages,

      firstMessageAt: messages[0].timestamp,
      lastMessageAt: messages[messages.length - 1].timestamp,
      whatsappPhoneId: messages[0].whatsappPhoneId
    };

    // Clear the batch before processing (prevent double processing)
    await redisOrchestratorState.clearBatch(phoneNumber);

    // Process the batch
    await processBatch(batch);
    
    console.log(`✅ Redis batch processed successfully for ${phoneNumber}`);

  } catch (error) {
    console.error(`❌ Error processing Redis batch for ${phoneNumber}:`, error);
    
    // Send error message to user
    try {
      await sendMessage(phoneNumber, '❌ Sorry, I encountered an error processing your message. Please try again.');
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  } finally {
    // Always release the lock
    if (lockHeld) {
      await redisOrchestratorState.releaseProcessingLock(phoneNumber);
    }
  }
};

/**
 * Get processing status for a phone number
 */
export const getProcessingStatus = async (phoneNumber: string) => {
  const isProcessing = await redisOrchestratorState.isProcessing(phoneNumber);
  const batchSize = await redisOrchestratorState.getBatchSize(phoneNumber);
  
  return {
    isProcessing,
    pendingMessages: batchSize,
    timestamp: new Date()
  };
};

/**
 * Get orchestrator statistics
 */
export const getBatchStats = async () => {
  return await redisOrchestratorState.getStats();
};
