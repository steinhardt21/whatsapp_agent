import { config } from './config.js';
import { verifyWebhook, processWebhookMessage } from './modules/whatsapp/index.js';
/**
 * HANDLERS
 */
// Basic hello handler
const helloHandler = async (request, reply) => {
    return reply.send({ message: 'Hello!' });
};
// WhatsApp webhook verification handler (GET request)
const webhookVerificationHandler = async (request, reply) => {
    const mode = request.query['hub.mode'] || '';
    const token = request.query['hub.verify_token'] || '';
    const challenge = request.query['hub.challenge'] || '';
    const result = verifyWebhook(mode, token, challenge);
    return reply.status(result.statusCode).send(result.response);
};
// WhatsApp webhook message handler (POST request)
const webhookMessageHandler = async (request, reply) => {
    const result = await processWebhookMessage(request.body);
    return reply.status(result.statusCode).send(result.response);
};
/**
 * ROUTES
 */
export const registerRoutes = (fastify) => {
    // Basic endpoints
    fastify.get('/hello', helloHandler);
    // WhatsApp webhook endpoints
    fastify.get(`/${config.WEBHOOK_ENDPOINT}`, webhookVerificationHandler);
    fastify.post(`/${config.WEBHOOK_ENDPOINT}`, webhookMessageHandler);
    return fastify;
};
//# sourceMappingURL=routes.js.map