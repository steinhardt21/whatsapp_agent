import { MessageBatch } from './types.js';
import { SessionManager, getSessionConfig } from '../session/index.js';
import { processUserMessage } from '../ai.js';
import { sendMessage } from '../whatsapp/messaging.js';
import { sendTypingIndicator } from '../whatsapp/status.js';
import { redisOrchestratorState } from './redis-state.js';

// Initialize session manager
const sessionManager = new SessionManager(getSessionConfig());

/**
 * Combine multiple messages into a single coherent text
 */
export const combineMessages = (messages: string[]): string => {
  if (messages.length === 1) {
    return messages[0];
  }
  
  // Join messages with a space, handling punctuation
  return messages
    .map(msg => msg.trim())
    .filter(msg => msg.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ') // Remove extra spaces
    .trim();
};

/**
 * Process a batch of messages as a single conversation turn
 */
export const processBatch = async (batch: MessageBatch, abortSignal?: AbortSignal): Promise<void> => {
  const { phoneNumber, messages } = batch;
  
  try {
    console.log(`🔄 Processing batch for ${phoneNumber} with ${messages.length} messages`);
    
    // Combine all message contents
    const messageContents = messages.map(m => m.content);
    const combinedMessage = combineMessages(messageContents);
    
    console.log(`📝 Combined message: "${combinedMessage}"`);
    
    // Get session and conversation history
    const session = await sessionManager.getOrCreateSession(
      phoneNumber,
      undefined,
      phoneNumber,
      batch.whatsappPhoneId
    );
    
    const isFirstMessage = session.state.messageCount === 0;
    const conversationHistory = await sessionManager.getConversationHistory(phoneNumber, 15);
    
    // Check for abort before proceeding
    if (abortSignal?.aborted) {
      const error = new Error('Processing aborted');
      error.name = 'AbortError';
      throw error;
    }
    
    // Send typing indicator (using the last message ID)
    const lastMessage = messages[messages.length - 1];
    await sendTypingIndicator(phoneNumber, lastMessage.id);
    
    // Check for abort before AI processing
    if (abortSignal?.aborted) {
      const error = new Error('Processing aborted');
      error.name = 'AbortError';
      throw error;
    }
    
    // Update conversation state
    await sessionManager.updateConversationState(phoneNumber, {
      awaitingResponse: true,
      currentTopic: 'batched_conversation'
    });
    
    // Process with AI
    const response = await processUserMessage(
      phoneNumber,
      combinedMessage,
      conversationHistory,
      isFirstMessage,
      abortSignal
    );
    
    // Check for abort before finalizing
    if (abortSignal?.aborted) {
      const error = new Error('Processing aborted');
      error.name = 'AbortError';
      throw error;
    }
    
    // Add to session history (combined message + response)
    await sessionManager.addMessage(phoneNumber, 'user', combinedMessage, lastMessage.id);
    await sessionManager.addMessage(phoneNumber, 'assistant', response);
    
    // Update conversation state
    await sessionManager.updateConversationState(phoneNumber, {
      awaitingResponse: false
    });
    
    // Final check: verify no new messages arrived before sending response
    await checkForNewMessagesBeforeSending(phoneNumber, batch, response);
    
    console.log(`✅ Batch processed successfully for ${phoneNumber}`);
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      // Re-throw abort errors to be handled by the restart logic
      console.log(`🔄 Abort error in processBatch for ${phoneNumber}: ${error.message}`);
      throw error;
    }
    
    console.error(`❌ Error processing batch for ${phoneNumber}:`, error);
    
    // Send error message
    await sendMessage(phoneNumber, '❌ Sorry, I encountered an error processing your messages. Please try again.');
    
    // Update conversation state
    await sessionManager.updateConversationState(phoneNumber, {
      awaitingResponse: false
    });
  }
};

/**
 * Check for new messages before sending response - restart processing if needed
 */
const checkForNewMessagesBeforeSending = async (
  phoneNumber: string,
  originalBatch: MessageBatch,
  response: string
): Promise<void> => {
  try {
    console.log(`🔍 Final check for new messages before sending response to ${phoneNumber}`);
    
    // Check if there are any new messages in the batch
    const currentMessages = await redisOrchestratorState.getBatch(phoneNumber);
    
    if (currentMessages.length > 0) {
      console.log(`🚨 Found ${currentMessages.length} new messages before sending - triggering restart`);
      
      // New messages found! We need to restart processing
      // Increment generation to signal restart needed
      const newGeneration = await redisOrchestratorState.incrementProcessingGeneration(phoneNumber);
      
      console.log(`🔄 Restart triggered for ${phoneNumber} due to last-minute messages (generation ${newGeneration})`);
      
      // Throw abort error to trigger restart in the main processing loop
      const error = new Error('New messages found before sending - restarting processing');
      error.name = 'AbortError';
      throw error;
    }
    
    // No new messages - safe to send the response
    console.log(`✅ No new messages found - sending response to ${phoneNumber}`);
    await sendMessage(phoneNumber, response);
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      // Re-throw abort errors to trigger restart
      throw error;
    } else {
      // For other errors, still try to send the original response
      console.error(`⚠️  Error in final message check for ${phoneNumber}:`, error);
      console.log(`📤 Sending original response despite check error`);
      await sendMessage(phoneNumber, response);
    }
  }
};

/**
 * Get session manager instance for external access
 */
export const getSessionManagerInstance = (): SessionManager => sessionManager;
