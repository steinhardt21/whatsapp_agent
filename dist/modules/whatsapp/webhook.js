import { config } from '../../config.js';
import { processMessages } from './handlers.js';
/**
 * Verify WhatsApp webhook request
 */
export const verifyWebhook = (mode, token, challenge) => {
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
        }
        else {
            console.log('Webhook verification failed - invalid token');
            return { success: false, response: 'Forbidden', statusCode: 403 };
        }
    }
    console.log('Webhook verification failed - missing parameters');
    return { success: false, response: 'Bad Request', statusCode: 400 };
};
/**
 * Process incoming webhook messages
 */
export const processWebhookMessage = async (body) => {
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
            const whatsappPhoneId = value.metadata?.phone_number_id;
            await processMessages(value.messages, whatsappPhoneId);
        }
        // Ignore status updates to remove "seeing" logs
    }
    return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
};
//# sourceMappingURL=webhook.js.map