# WhatsApp Agent with Session Management

A lightweight WhatsApp bot with persistent conversation sessions.

## Features

- **AI Assistant**: Mazzantini&Associati virtual assistant with professional Italian responses
- **Session Management**: Persistent conversation history per phone number with Redis Cloud
- **WhatsApp Integration**: Native WhatsApp messaging with typing indicators
- **Service Detection**: Automatically detects business inquiries and offers appointments
- **Memory**: Remembers conversation context and user interactions
- **Reset Command**: Type "RESET" to clear all conversation data for testing

## Quick Start

### Installation

```bash
npm install
```

### Environment Variables

```bash
# Required for WhatsApp
WEBHOOK_VERIFICATION_TOKEN=your_verification_token
WHATSAPP_ACCESS_TOKEN=your_access_token

# Required for AI features
ANTHROPIC_API_KEY=your_anthropic_api_key

# Redis is configured in code with your Redis Cloud credentials
# The system will automatically use Redis if available, otherwise falls back to in-memory storage
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## How It Works

1. **Webhook Setup**: Receives WhatsApp messages via webhook
2. **Session Creation**: Creates persistent sessions per phone number in Redis Cloud
3. **AI Processing**: Processes messages with Mazzantini&Associati assistant personality
4. **Service Detection**: Identifies business inquiries and proposes appointments
5. **Memory Integration**: Uses conversation history for context-aware responses
6. **Auto Cleanup**: Sessions expire after 1 hour of inactivity

## Session Structure

Each user session includes:
- Phone number and WhatsApp IDs
- Conversation history with timestamps
- Current conversation state and context
- Automatic expiration handling

## Storage

- **Automatic**: Redis Cloud for persistent storage, falls back to in-memory if Redis unavailable
- **Production Ready**: Redis with TTL-based expiration and automatic cleanup
- **Development Friendly**: Seamless fallback to in-memory storage for local development

## API Endpoints

- `GET /hello` - Health check
- `GET /webhook` - WhatsApp webhook verification
- `POST /webhook` - WhatsApp message processing

## Testing Commands

- **RESET** - Send exactly "RESET" (case insensitive) to clear all conversation data for that user

## File Structure

```
src/
├── modules/
│   ├── session/          # Session management
│   └── whatsapp/         # WhatsApp integration
├── types.ts              # TypeScript definitions
├── config.ts             # Configuration
├── routes.ts             # API routes
└── index.ts              # Main server
```