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
    
    // Process message with AI agent
    console.log(`Processing message with AI agent for ${message.from}`);
    const aiResponse = await processUserMessage(message.from, message.text.body);
    
    // Send AI-generated response
    console.log(`Sending AI response to ${message.from}: "${aiResponse}"`);
    await sendMessage(message.from, aiResponse);
  }
};

/**
 * Handle message status updates
 */
const handleMessageStatus = (status: any): void => {
  console.log(`Message status update:`);
  console.log(`Message ID: ${status.id}`);
  console.log(`Status: ${status.status}`);
  console.log(`Recipient: ${status.recipient_id}`);
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
 * Process all status updates in an array
 */
const processStatuses = (statuses: any[]): void => {
  statuses.forEach(handleMessageStatus);
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
    
    // Process incoming messages
    if (value.messages && value.messages.length > 0) {
      await processMessages(value.messages);
    }
    
    // Process message status updates
    if (value.statuses && value.statuses.length > 0) {
      processStatuses(value.statuses);
    }
  }
  
  return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
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
