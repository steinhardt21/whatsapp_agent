import { getWhatsAppInstance } from './client.js';
/**
 * Send a text message
 */
export const sendMessage = async (to, message) => {
    try {
        console.log(`Attempting to send message "${message}" to ${to}`);
        const wa = getWhatsAppInstance();
        const sentMessage = wa.messages.text({ body: message }, parseInt(to, 10));
        await sentMessage.then((res) => {
            console.log('Message sent successfully:', res.rawResponse());
        });
        return true;
    }
    catch (error) {
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
export const createAutoReplyText = (originalMessage) => `You said: ${originalMessage}`;
/**
 * Send an auto-reply to a message
 */
export const sendAutoReply = async (to, originalMessage) => {
    const replyMessage = createAutoReplyText(originalMessage);
    return await sendMessage(to, replyMessage);
};
//# sourceMappingURL=messaging.js.map