# WhatsApp AI Bot

A sophisticated WhatsApp bot built with Fastify, TypeScript, and AI integration using Anthropic Claude. Features intelligent conversation handling, typing indicators, and modular architecture.

## 🚀 Features

- ✅ **TypeScript with ES modules** - Type-safe development
- ✅ **WhatsApp Business API integration** - Full webhook support
- ✅ **AI-powered conversations** - Intelligent responses via Anthropic Claude
- ✅ **Typing indicators** - Natural conversation experience
- ✅ **Message read receipts** - Professional interaction
- ✅ **Modular architecture** - Clean, maintainable code
- ✅ **Functional programming** - Pure functions and composition
- ✅ **Conversation memory** - Context-aware responses per user
- ✅ **Error handling** - Robust fallback mechanisms

## 📋 Prerequisites

1. **Node.js** version 16 or later
2. **WhatsApp Business Account** with Cloud API access
3. **Anthropic API Key** for AI features
4. **Public HTTPS URL** (use ngrok for development)

## 🛠 Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```bash
# WhatsApp Business API Configuration
WA_PHONE_NUMBER_ID=your_phone_number_id_here
CLOUD_API_ACCESS_TOKEN=your_access_token_here
CLOUD_API_VERSION=v16.0

# Webhook Configuration
WEBHOOK_ENDPOINT=webhook
WEBHOOK_VERIFICATION_TOKEN=your_secret_verification_token_123

# Server Configuration
LISTENER_PORT=3000

# AI Configuration
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

### 3. Get API Credentials

#### WhatsApp Business API:
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or use existing one
3. Add WhatsApp Business API product
4. Get your credentials:
   - **Phone Number ID**: WhatsApp > Getting started > Phone number ID
   - **Access Token**: WhatsApp > Getting started > Access token

#### Anthropic API:
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create account and get API key
3. Add to `.env` file

### 4. Run the Server

**Development mode:**
```bash
pnpm dev
```

**Production mode:**
```bash
pnpm build
pnpm start
```

### 5. Expose Server Publicly

Use ngrok for development:

```bash
# Install ngrok
npm install -g ngrok

# Expose your server
ngrok http 3000
```

You'll get a URL like: `https://abc123.ngrok.io`

### 6. Configure Webhook

1. Go to your WhatsApp app dashboard
2. Navigate to WhatsApp > Configuration > Webhooks
3. Add webhook URL: `https://your-ngrok-url.ngrok.io/webhook`
4. Set verify token: Use the same token from your `.env` file
5. Subscribe to `messages` field

## 🤖 AI Bot Behavior

The bot provides intelligent responses with:

- **Contextual conversations** - Remembers previous messages
- **Italian responses** - Naturally responds in Italian
- **Typing indicators** - Shows "typing..." effect
- **Read receipts** - Marks messages as read immediately
- **Error graceful fallback** - Works even if AI is unavailable

### Example Conversation:

```
User: "Ciao, come stai?"
Bot: [typing...]
Bot: "Ciao! Sto bene, grazie per aver chiesto! Come posso aiutarti oggi?"

User: "Che tempo farà domani?"
Bot: [typing...]
Bot: "Mi dispiace, ma non ho accesso a informazioni meteo in tempo reale. Ti consiglio di controllare un'app meteo affidabile!"
```

## 🛠 API Endpoints

### Basic Endpoints
- `GET /hello` - Health check endpoint

### WhatsApp Webhook Endpoints
- `GET /webhook` - Webhook verification (used by WhatsApp)
- `POST /webhook` - Receives WhatsApp messages and processes with AI

## 🏗 Project Architecture

```
src/
├── index.ts                 # Main server entry point
├── routes.ts                # Route definitions
├── config.ts                # Configuration management
├── types.ts                 # TypeScript type definitions
└── modules/
    ├── ai.ts                # AI processing and conversation management
    └── whatsapp/
        ├── index.ts         # Barrel exports
        ├── client.ts        # WhatsApp client management
        ├── messaging.ts     # Message sending functions
        ├── status.ts        # Typing indicators and status
        ├── handlers.ts      # Message processing logic
        └── webhook.ts       # Webhook verification and routing
```

### 📦 Modular Design Benefits:

- **Separation of concerns** - Each module has a specific responsibility
- **Easy testing** - Individual modules can be tested independently
- **Maintainability** - Clear organization makes code easy to find and modify
- **Scalability** - Easy to add new features without affecting existing code
- **Reusability** - Functions can be imported and used across the application

## ⚙️ Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `WA_PHONE_NUMBER_ID` | WhatsApp Business phone number ID | ✅ | `123456789012345` |
| `CLOUD_API_ACCESS_TOKEN` | WhatsApp Cloud API access token | ✅ | `EAABs...` |
| `CLOUD_API_VERSION` | WhatsApp API version | ✅ | `v16.0` |
| `WEBHOOK_ENDPOINT` | Webhook path | ✅ | `webhook` |
| `WEBHOOK_VERIFICATION_TOKEN` | Webhook security token | ✅ | `my_secret_token` |
| `LISTENER_PORT` | Server port | ❌ | `3000` |
| `ANTHROPIC_API_KEY` | Anthropic AI API key | ❌* | `sk-ant-...` |

*Required for AI features. Bot will work with fallback responses if not provided.

## 🧪 Testing

### Test Webhook Verification:
```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=your_verification_token&hub.challenge=test123"
```

### Test Bot Response:
Send a message to your WhatsApp Business number and observe:
1. Message marked as read (blue checkmarks)
2. Typing indicator appears
3. AI-generated response received

## 🐛 Troubleshooting

### Common Issues:

1. **Webhook verification fails**
   - Check verification token matches exactly
   - Ensure webhook URL is accessible via HTTPS

2. **No AI responses**
   - Verify `ANTHROPIC_API_KEY` is set correctly
   - Check console for AI configuration test results

3. **Messages not received**
   - Confirm webhook is subscribed to `messages` field
   - Check ngrok tunnel is active and URL is correct

4. **Typing indicator not working**
   - Ensure message_id is being passed correctly
   - Check WhatsApp API response for errors

### Debug Mode:
The server provides detailed logging for troubleshooting:
- Webhook payload logging
- AI processing steps
- Message sending confirmations
- Error details and stack traces

## 🚀 Next Steps

### Potential Enhancements:
- **Database integration** - Store conversation history permanently
- **Media message support** - Handle images, documents, voice messages
- **Multi-language support** - Detect and respond in user's language
- **Analytics dashboard** - Track conversations and bot performance
- **Custom tools** - Add function calling for weather, news, etc.
- **Admin interface** - Manage bot responses and configurations
- **Rate limiting** - Prevent spam and manage API costs

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
