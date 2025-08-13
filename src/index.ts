import 'dotenv/config';
import Fastify from 'fastify';
import { registerRoutes } from './routes.js';
import { config } from './config.js';
import { testConfiguration } from './modules/whatsapp/index.js';
import { testAIConfiguration } from './modules/ai.js';

// Start server function
const startServer = async () => {
  try {
    const fastify = Fastify({ 
      logger: true,
      // Enable body parsing for webhooks
      bodyLimit: 1048576 // 1MB
    });
    
    // Register routes
    registerRoutes(fastify);
    
    const port = config.LISTENER_PORT;
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    fastify.log.info(`🚀 Server listening on http://${host}:${port}`);
    fastify.log.info('📱 WhatsApp Webhook Server Ready!');
    fastify.log.info('Available routes:');
    fastify.log.info('  GET  /hello');
    fastify.log.info(`  GET  /${config.WEBHOOK_ENDPOINT} (webhook verification)`);
    fastify.log.info(`  POST /${config.WEBHOOK_ENDPOINT} (receive messages)`);
    fastify.log.info('');
    fastify.log.info('📋 Setup Instructions:');
    fastify.log.info('1. Set your environment variables for WhatsApp configuration');
    fastify.log.info('2. Use ngrok or similar tool to expose this server publicly');
    fastify.log.info('3. Configure your webhook URL in WhatsApp Business API');
    fastify.log.info(`4. Use verification token: ${config.WEBHOOK_VERIFICATION_TOKEN}`);
    fastify.log.info('');
    
    // Test configurations
    testConfiguration();
    await testAIConfiguration();
    
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
