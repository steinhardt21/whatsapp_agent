# WhatsApp Agent with Session Management

A lightweight WhatsApp bot with persistent conversation sessions.

## Features

- **Smart Message Batching**: Combines rapid consecutive messages into coherent requests
- **AI Assistant**: Mazzantini&Associati virtual assistant with professional Italian responses
- **Session Management**: Persistent conversation history per phone number with Redis Cloud
- **WhatsApp Integration**: Native WhatsApp messaging with typing indicators
- **Service Detection**: Automatically detects business inquiries and offers appointments
- **Memory**: Remembers conversation context and user interactions
- **🕒 Time-Aware Agent**: Knows current time and day in Rome timezone for contextual responses
- **Reset Command**: Type "RESET" to clear all conversation data for testing

## Quick Start

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```bash
# Required for WhatsApp
WEBHOOK_VERIFICATION_TOKEN=your_verification_token
WHATSAPP_ACCESS_TOKEN=your_access_token
WA_PHONE_NUMBER_ID=your_phone_number_id
CLOUD_API_ACCESS_TOKEN=your_cloud_api_access_token

# Required for AI features
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional for Redis (if not set, uses in-memory storage)
REDIS_HOST=redis-12992.c98.us-east-1-4.ec2.redns.redis-cloud.com
REDIS_PORT=12992
REDIS_USERNAME=default
REDIS_PASSWORD=xQgISGWEP5BENFKUGfRd4L5swupjG9nW

# Server Configuration (optional)
LISTENER_PORT=3000
CLOUD_API_VERSION=v16.0
WEBHOOK_ENDPOINT=webhook
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
2. **Message Orchestration**: Entry agent batches rapid consecutive messages (2-second window)
3. **Smart Processing**: Combines multiple messages into coherent requests before AI processing
4. **Session Management**: Creates persistent sessions per phone number in Redis Cloud
5. **AI Processing**: Processes combined messages with Mazzantini&Associati assistant personality
6. **Service Detection**: Identifies business inquiries and proposes appointments
7. **Memory Integration**: Uses conversation history for context-aware responses
8. **Auto Cleanup**: Sessions expire after 1 hour of inactivity

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

## Message Orchestration

### Smart Batching
- **2-second window**: Waits for additional messages before processing
- **Max 5 messages**: Processes immediately when batch reaches 5 messages
- **Intelligent combination**: Merges messages like "hello" + "i want to know" + "your services" → "hello i want to know your services"
- **Interruption handling**: If new messages arrive during processing, stops current processing and restarts with all messages combined

### Example Scenarios:

#### Scenario 1: Basic Batching
```
User sends rapidly:
- "hello" 
- "i want to know"
- "the services of the company"

Agent receives:
- "hello i want to know the services of the company" (processed as one request)
```

#### Scenario 2: Interruption Handling (The Edge Case)
```
User sends:
- "ciao" (starts processing)
- "mi chiamo Alex" (interrupts processing)

What happens:
1. First message starts processing
2. Second message arrives and signals interruption
3. Processing stops and restarts with both messages
4. Agent receives: "ciao mi chiamo Alex" (combined, single response)
```

## Testing Commands

- **RESET** - Send exactly "RESET" (case insensitive) to clear all conversation data for that user

## File Structure

```
src/
├── modules/
│   ├── message-orchestrator/  # Smart message batching
│   ├── session/              # Session management
│   ├── whatsapp/             # WhatsApp integration
│   └── ai.ts                 # AI processing
├── types.ts                  # TypeScript definitions
├── config.ts                 # Configuration
├── routes.ts                 # API routes
└── index.ts                  # Main server
```