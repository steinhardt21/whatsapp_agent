import { sendMessage } from './messaging.js';
import { sendTypingIndicator } from './status.js';

/**
 * Handle individual incoming message
 */
export const handleIncomingMessage = async (message: any): Promise<void> => {
  console.log(`New message from ${message.from}:`);
  console.log(`Message ID: ${message.id}`);
  console.log(`Type: ${message.type}`);
  
  if (message.type === 'text' && message.text) {
    console.log(`Text: ${message.text.body}`);
    
    // Send typing indicator with message ID
    await sendTypingIndicator(message.from, message.id);
    
    // For now, just test the typing effect
    console.log(`Typing indicator sent to ${message.from}. Testing complete!`);
    
    // Optional: Send a simple confirmation after a few seconds
    setTimeout(async () => {
      await sendMessage(message.from, `✅ Typing test completato! Hai scritto: "${message.text.body}"`);
    }, 3000); // Wait 3 seconds to see the typing effect
  }
};

/**
 * Process all incoming messages in an array
 */
export const processMessages = async (messages: any[]): Promise<void> => {
  for (const message of messages) {
    await handleIncomingMessage(message);
  }
};
