import { sendMessage } from './messaging.js';
import { handleIncomingMessage as orchestratorHandleMessage, getProcessingStatus, getBatchStats } from '../message-orchestrator/index.js';
/**
 * Handle individual incoming message via orchestrator
 */
export const handleIncomingMessage = async (message, whatsappPhoneId) => {
    const phoneNumber = message.from;
    const messageId = message.id;
    console.log(`📞 WhatsApp handler received message from ${phoneNumber}:`);
    console.log(`Message ID: ${messageId}`);
    console.log(`Type: ${message.type}`);
    try {
        if (message.type === 'text' && message.text) {
            const userMessage = message.text.body;
            console.log(`Text: "${userMessage}"`);
            // Submit to orchestrator without waiting (fire and forget for batching)
            // The orchestrator will handle the timing and batching logic
            orchestratorHandleMessage(messageId, phoneNumber, userMessage, whatsappPhoneId)
                .catch(error => {
                console.error(`❌ Error in orchestrator for ${phoneNumber}:`, error);
                // Send error message if orchestrator fails
                sendMessage(phoneNumber, '❌ Sorry, I encountered an error processing your message. Please try again.')
                    .catch(sendError => console.error('Failed to send error message:', sendError));
            });
        }
    }
    catch (error) {
        console.error(`❌ Error in WhatsApp handler for ${phoneNumber}:`, error);
        // Send error message directly
        await sendMessage(phoneNumber, '❌ Sorry, I encountered an error processing your message. Please try again.');
    }
};
/**
 * Process all incoming messages in an array - fire and forget for batching
 */
export const processMessages = async (messages, whatsappPhoneId) => {
    // Process all messages in parallel to allow proper batching
    // Don't await individual messages to allow the orchestrator to batch them
    const promises = messages.map(message => handleIncomingMessage(message, whatsappPhoneId).catch(error => {
        console.error(`❌ Error processing message ${message.id}:`, error);
    }));
    // Wait for all messages to be submitted to orchestrator (not processed)
    await Promise.all(promises);
};
/**
 * Get orchestrator statistics
 */
export const getOrchestratorStats = () => {
    return getBatchStats();
};
/**
 * Get processing status for a phone number
 */
export const getUserProcessingStatus = (phoneNumber) => {
    return getProcessingStatus(phoneNumber);
};
//# sourceMappingURL=handlers.js.map