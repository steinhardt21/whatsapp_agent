import { config } from '../../config.js';

/**
 * Send typing indicator to show bot is processing
 */
export const sendTypingIndicator = async (to: string, messageId: string): Promise<boolean> => {
  try {
    console.log(`Sending typing indicator to ${to} for message ${messageId}`);
    
    // Send typing indicator using WhatsApp Business API
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
