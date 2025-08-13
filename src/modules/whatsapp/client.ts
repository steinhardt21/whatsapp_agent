import WhatsApp from 'whatsapp';
import { config } from '../../config.js';

// Singleton WhatsApp instance
let whatsappInstance: WhatsApp | null = null;

/**
 * Get or create WhatsApp instance
 */
export const getWhatsAppInstance = (): WhatsApp => {
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
