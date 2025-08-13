import WhatsApp from 'whatsapp';
import { config } from '../config.js';
import type { WhatsAppWebhookBody } from '../types.js';
import { processUserMessage } from './ai.js';

// Types for return values
type WebhookResult = { success: boolean; response: string; statusCode: number };

// Singleton WhatsApp instance
let whatsappInstance: WhatsApp | null = null;

/**
 * Get or create WhatsApp instance
 */
const getWhatsAppInstance = (): WhatsApp => {
  if (!whatsappInstance) {
    // Check if we have the required environment variables
    if (!config.WA_PHONE_NUMBER_ID || !config.CLOUD_API_ACCESS_TOKEN) {
      console.error('Missing WhatsApp configuration:');
      console.error('WA_PHONE_NUMBER_ID:', config.WA_PHONE_NUMBER_ID ? 'Set' : 'Missing');
      console.error('CLOUD_API_ACCESS_TOKEN:', config.CLOUD_API_ACCESS_TOKEN ? 'Set' : 'Missing');
      throw new Error('Missing WhatsApp configuration. Please check your .env file.');
    }
    
    console.log('Creating WhatsApp instance...');
    console.log('Phone Number ID:', config.WA_PHONE_NUMBER_ID);
    console.log('Access Token (first 20 chars):', config.CLOUD_API_ACCESS_TOKEN.substring(0, 20) + '...');
    
    whatsappInstance = new WhatsApp();
  }
  return whatsappInstance;
};

/**
 * Verify WhatsApp webhook request
 */
export const verifyWebhook = (mode: string, token: string, challenge: string): WebhookResult => {
  console.log('Webhook verification request received');
  console.log('Mode:', mode);
  console.log('Token:', token);
  console.log('Challenge:', challenge);

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === config.WEBHOOK_VERIFICATION_TOKEN) {
      console.log('Webhook verified successfully!');
      return { success: true, response: challenge, statusCode: 200 };
    } else {
      console.log('Webhook verification failed - invalid token');
      return { success: false, response: 'Forbidden', statusCode: 403 };
    }
  }
  
  console.log('Webhook verification failed - missing parameters');
  return { success: false, response: 'Bad Request', statusCode: 400 };
};

/**
 * Handle individual incoming message
 */
const handleIncomingMessage = async (message: any): Promise<void> => {
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
const processMessages = async (messages: any[]): Promise<void> => {
  for (const message of messages) {
    await handleIncomingMessage(message);
  }
};

/**
 * Process incoming webhook messages
 */
export const processWebhookMessage = async (body: WhatsAppWebhookBody): Promise<WebhookResult> => {
  console.log('Incoming webhook message:');
  console.log(JSON.stringify(body, null, 2));

  // Check if this is a WhatsApp status notification
  if (!body.object) {
    return { success: false, response: 'Not Found', statusCode: 404 };
  }

  if (body.entry && 
      body.entry[0].changes && 
      body.entry[0].changes[0] && 
      body.entry[0].changes[0].field === 'messages') {
    
    const change = body.entry[0].changes[0];
    const value = change.value;
    
          // Process incoming messages only
      if (value.messages && value.messages.length > 0) {
        await processMessages(value.messages);
      }
      
      // Ignore status updates to remove "seeing" logs
  }
  
  return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
};

/**
 * Send typing indicator to show bot is processing
 */
export const sendTypingIndicator = async (to: string, messageId: string): Promise<boolean> => {
  try {
    console.log(`Sending typing indicator to ${to} for message ${messageId}`);
    
    const response = await fetch(`https://graph.facebook.com/${config.CLOUD_API_VERSION}/${config.WA_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.CLOUD_API_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: {
          type: 'text'
        }
      })
    });

    if (response.ok) {
      console.log('Typing indicator sent successfully');
      return true;
    } else {
      const errorData = await response.text();
      console.error('Failed to send typing indicator:', response.statusText, errorData);
      return false;
    }
  } catch (error) {
    console.error('Error sending typing indicator:', error);
    return false;
  }
};





/**
 * Send a text message
 */
export const sendMessage = async (to: string, message: string): Promise<boolean> => {
  try {
    console.log(`Attempting to send message "${message}" to ${to}`);
    
    const wa = getWhatsAppInstance();
    const sentMessage = wa.messages.text({ body: message }, parseInt(to, 10));
    
    await sentMessage.then((res: any) => {
      console.log('Message sent successfully:', res.rawResponse());
    });
    
    return true;
  } catch (error) {
    console.error('Error sending message:', error);
    console.error('Make sure your .env file contains:');
    console.error('- WA_PHONE_NUMBER_ID');
    console.error('- CLOUD_API_ACCESS_TOKEN');
    console.error('- CLOUD_API_VERSION');
    return false;
  }
};

/**
 * Create auto-reply message text
 */
const createAutoReplyText = (originalMessage: string): string => 
  `You said: ${originalMessage}`;

/**
 * Send an auto-reply to a message
 */
export const sendAutoReply = async (to: string, originalMessage: string): Promise<boolean> => {
  const replyMessage = createAutoReplyText(originalMessage);
  return await sendMessage(to, replyMessage);
};

/**
 * Test WhatsApp configuration
 */
export const testConfiguration = (): boolean => {
  try {
    console.log('Testing WhatsApp configuration...');
    const wa = getWhatsAppInstance();
    console.log('✅ WhatsApp configuration is valid');
    return true;
  } catch (error) {
    console.error('❌ WhatsApp configuration error:', error);
    return false;
  }
};
