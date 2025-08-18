// Application configuration - You need to set these environment variables
export const config = {
  // Your WhatsApp phone number Id (sender)
  WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID || '',
  
  // System user access token
  CLOUD_API_ACCESS_TOKEN: process.env.CLOUD_API_ACCESS_TOKEN || '',
  
  // Cloud API version number
  CLOUD_API_VERSION: process.env.CLOUD_API_VERSION || 'v16.0',
  
  // Webhook endpoint path
  WEBHOOK_ENDPOINT: process.env.WEBHOOK_ENDPOINT || 'webhook',
  
  // Verification token for webhook security
  WEBHOOK_VERIFICATION_TOKEN: process.env.WEBHOOK_VERIFICATION_TOKEN || 'your_secret_verification_token_123',
  
  // Server port
  LISTENER_PORT: parseInt(process.env.LISTENER_PORT || '3000', 10),
  
  // Anthropic API key for AI features
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  
  // PostgreSQL database configuration
  DATABASE_URL: process.env.DATABASE_URL || '',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || 'whatsapp_agent',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || ''
};
