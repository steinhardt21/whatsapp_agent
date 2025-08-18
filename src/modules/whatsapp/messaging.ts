import { getWhatsAppInstance } from './client.js';

/**
 * Send a text message
 */
export const sendMessage = async (to: string, message: string): Promise<boolean> => {
  try {
    
    const wa = getWhatsAppInstance();
    const sentMessage = wa.messages.text({ body: message }, parseInt(to, 10));
    
    
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
export const createAutoReplyText = (originalMessage: string): string => 
  `You said: ${originalMessage}`;

/**
 * Send an auto-reply to a message
 */
export const sendAutoReply = async (to: string, originalMessage: string): Promise<boolean> => {
  const replyMessage = createAutoReplyText(originalMessage);
  return await sendMessage(to, replyMessage);
};

/**
 * Send a WhatsApp template message
 * @param to - Phone number to send to
 * @param templateName - Name of the approved template
 * @param templateData - Data to populate template variables
 */
export const sendTemplateMessage = async (
  to: string, 
  templateName: string, 
  templateData?: Record<string, any>
): Promise<boolean> => {
  try {
    console.log(`📧 Attempting to send template "${templateName}" to ${to}`);
    console.log('📧 Template data:', templateData);
    
    const wa = getWhatsAppInstance();
    
    // Create template message object following the exact API format
    const templateMessage: any = {
      name: templateName,
      language: {
        policy: 'deterministic',
        code: 'it' // Standard Italian code
      }
      // Note: Interactive templates with buttons don't need components array
      // unless they have variable text parameters
    };
    
    // Only add components if template has text variables (your template appears to have static text)
    // Interactive button templates typically don't need parameter components
    if (templateData && Object.keys(templateData).length > 0) {
      templateMessage.components = [{
        type: 'body',
        parameters: Object.values(templateData).map(value => ({
          type: 'text',
          text: String(value)
        }))
      }];
    }
    
    console.log('📧 Final template message object:', JSON.stringify(templateMessage, null, 2));
    
    // Send template message
    const sentMessage = await wa.messages.template(templateMessage, parseInt(to, 10));
    
    console.log(`✅ Template message "${templateName}" sent successfully to ${to}`);
    console.log('📧 Server response:', sentMessage);
    return true;
  } catch (error: any) {
    console.error(`❌ Error sending template message "${templateName}":`, error);
    
    // Extract specific error details from WhatsApp API response
    if (error?.respStatusCode) {
      console.error(`📧 Status Code: ${error.respStatusCode}`);
    }
    if (error?.respHeaders?.['www-authenticate']) {
      console.error(`📧 Auth Error: ${error.respHeaders['www-authenticate']}`);
    }
    
    console.error('📧 Possible solutions:');
    console.error('  1. Check if template exists in WhatsApp Business Manager');
    console.error('  2. Verify template is APPROVED (not pending/rejected)');
    console.error('  3. Confirm template language code (it vs it_IT)');
    console.error('  4. Check if template has required parameters');
    
    return false;
  }
};

/**
 * Send the "domanda_intenzione_candidato" template message
 * @param to - Phone number to send to
 * @param candidateName - Name of the candidate (optional, template appears to have static text)
 */
export const sendIntentionQuestionTemplate = async (
  to: string, 
  candidateName?: string
): Promise<boolean> => {
  // Your template appears to have static text, so no parameters needed
  // If your template actually has {{name}} variables, uncomment the line below:
  // return await sendTemplateMessage(to, 'domanda_intenzione_candidato', { name: candidateName || 'Cliente' });
  
  return await sendTemplateMessage(to, 'domanda_intenzione_candidato');
};
