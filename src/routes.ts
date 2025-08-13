import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config.js';
import type { WhatsAppWebhookBody } from './types.js';
import { verifyWebhook, processWebhookMessage } from './modules/whatsapp.js';



/**
 * HANDLERS
 */
// Basic hello handler
const helloHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  return reply.send({ message: 'Hello!' });
};

// WhatsApp webhook verification handler (GET request)
const webhookVerificationHandler = async (
  request: FastifyRequest<{ Querystring: { 'hub.mode'?: string, 'hub.verify_token'?: string, 'hub.challenge'?: string } }>, 
  reply: FastifyReply
) => {
  const mode = request.query['hub.mode'] || '';
  const token = request.query['hub.verify_token'] || '';
  const challenge = request.query['hub.challenge'] || '';

  const result = verifyWebhook(mode, token, challenge);
  return reply.status(result.statusCode).send(result.response);
};

// WhatsApp webhook message handler (POST request)
const webhookMessageHandler = async (
  request: FastifyRequest<{ Body: WhatsAppWebhookBody }>, 
  reply: FastifyReply
) => {
  const result = await processWebhookMessage(request.body);
  return reply.status(result.statusCode).send(result.response);
};




/**
 * ROUTES
 */
export const registerRoutes = (fastify: FastifyInstance) => {
  // Basic endpoints
  fastify.get('/hello', helloHandler);
  
  // WhatsApp webhook endpoints
  fastify.get(`/${config.WEBHOOK_ENDPOINT}`, webhookVerificationHandler);
  fastify.post(`/${config.WEBHOOK_ENDPOINT}`, webhookMessageHandler);
  
  return fastify;
};
