import { sendMessage } from './messaging.js';
import { sendTypingIndicator } from './status.js';
import { SessionManager, sessionConfig } from '../session/index.js';
import { processUserMessage } from '../ai.js';
// Initialize session manager
const sessionManager = new SessionManager(sessionConfig);
/**
 * Handle individual incoming message
 */
export const handleIncomingMessage = async (message, whatsappPhoneId) => {
    const phoneNumber = message.from;
    const messageId = message.id;
    console.log(`New message from ${phoneNumber}:`);
    console.log(`Message ID: ${messageId}`);
    console.log(`Type: ${message.type}`);
    try {
        // Get or create session for this user with WhatsApp IDs
        const session = await sessionManager.getOrCreateSession(phoneNumber, undefined, // displayName - could be extracted from WhatsApp profile later
        message.from, // use phone number as whatsappId for now
        whatsappPhoneId);
        if (message.type === 'text' && message.text) {
            const userMessage = message.text.body;
            console.log(`Text: ${userMessage}`);
            // Check for RESET command
            if (userMessage.trim().toUpperCase() === 'RESET') {
                console.log(`🔄 RESET command received from ${phoneNumber}`);
                // Clear all conversation data for this user
                await sessionManager.clearConversationHistory(phoneNumber);
                await sessionManager.deleteSession(phoneNumber);
                // Send confirmation
                await sendMessage(phoneNumber, 'Reset completato. Conversazione cancellata. Ricominciamo da capo! 🔄');
                console.log(`✅ Reset completed for ${phoneNumber}`);
                return;
            }
            // Check if this is the first message BEFORE adding the current message
            const isFirstMessage = session.state.messageCount === 0;
            // Get conversation history for context BEFORE adding current message
            const conversationHistory = await sessionManager.getConversationHistory(phoneNumber, 15);
            console.log(`Retrieved ${conversationHistory.length} previous messages for context`);
            console.log(`Is first message: ${isFirstMessage}`);
            // Send typing indicator
            await sendTypingIndicator(phoneNumber, messageId);
            // Update conversation state
            await sessionManager.updateConversationState(phoneNumber, {
                awaitingResponse: true,
                currentTopic: 'general_chat'
            });
            // Process the message with AI using session memory
            const response = await processUserMessage(phoneNumber, userMessage, conversationHistory, isFirstMessage);
            // Add BOTH user message AND assistant response to conversation history
            await sessionManager.addMessage(phoneNumber, 'user', userMessage, messageId);
            await sessionManager.addMessage(phoneNumber, 'assistant', response);
            // Update conversation state
            await sessionManager.updateConversationState(phoneNumber, {
                awaitingResponse: false
            });
            // Send response
            await sendMessage(phoneNumber, response);
            console.log(`Conversation updated for ${phoneNumber}. Total messages: ${session.state.messageCount + 1}`);
        }
    }
    catch (error) {
        console.error(`Error handling message from ${phoneNumber}:`, error);
        // Send error message to user
        await sendMessage(phoneNumber, '❌ Sorry, I encountered an error processing your message. Please try again.');
        // Update conversation state to not awaiting response
        await sessionManager.updateConversationState(phoneNumber, {
            awaitingResponse: false
        });
    }
};
/**
 * Process all incoming messages in an array
 */
export const processMessages = async (messages, whatsappPhoneId) => {
    for (const message of messages) {
        await handleIncomingMessage(message, whatsappPhoneId);
    }
};
/**
 * Get the session manager instance
 */
export const getSessionManager = () => {
    return sessionManager;
};
//# sourceMappingURL=handlers.js.map