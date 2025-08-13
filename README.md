# WhatsApp Webhook Server

A Fastify backend with TypeScript and ES modules that receives WhatsApp messages via webhooks.

## Features

- ✅ TypeScript with ES modules
- ✅ WhatsApp Business API webhook integration
- ✅ Message receiving and processing
- ✅ Webhook verification
- ✅ Auto-reply functionality (optional)

## Prerequisites

1. Node.js version 16 or later
2. WhatsApp Business Account with Cloud API access
3. A publicly accessible HTTPS URL (use ngrok for development)

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory with these variables:

```bash
# Your WhatsApp phone number Id (sender)
WA_PHONE_NUMBER_ID=your_phone_number_id_here

# System user access token
CLOUD_API_ACCESS_TOKEN=your_access_token_here

# Cloud API version number
CLOUD_API_VERSION=v16.0

# Webhook endpoint path
WEBHOOK_ENDPOINT=webhook

# Verification token for webhook security
WEBHOOK_VERIFICATION_TOKEN=your_secret_verification_token_123

# Server port
LISTENER_PORT=3000
```

### 3. Get WhatsApp Business API Credentials

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or use existing one
3. Add WhatsApp Business API product
4. Get your:
   - **Phone Number ID**: Found in WhatsApp > Getting started > Phone number ID
   - **Access Token**: Found in WhatsApp > Getting started > Temporary access token
   - Set **API Version**: Use latest (e.g., v16.0)

### 4. Run the Server

Development mode:
```bash
pnpm dev
```

Production mode:
```bash
pnpm build
pnpm start
```

### 5. Expose Server Publicly (for development)

Use ngrok to create a public HTTPS URL:

```bash
# Install ngrok if you haven't already
npm install -g ngrok

# Expose your local server
ngrok http 3000
```

You'll get a URL like `https://abc123.ngrok.io`

### 6. Configure Webhook in WhatsApp Business API

1. Go to your app dashboard
2. Navigate to WhatsApp > Configuration
3. Add webhook URL: `https://your-ngrok-url.ngrok.io/webhook`
4. Set verify token: Use the same token from your `.env` file
5. Subscribe to `messages` field

## API Endpoints

### Basic Endpoints
- `GET /hello` - Returns a simple hello message

### WhatsApp Webhook Endpoints
- `GET /webhook` - Webhook verification (used by WhatsApp)
- `POST /webhook` - Receives WhatsApp messages and status updates

## Message Processing

The webhook automatically:

1. **Receives Messages**: Logs all incoming text messages
2. **Processes Status Updates**: Tracks message delivery status
3. **Provides Auto-Reply**: Uncomment the auto-reply code in routes.ts

### Example Message Processing

When someone sends a message to your WhatsApp number, you'll see console output like:

```
New message from 1234567890:
Message ID: wamid.abc123...
Type: text
Text: Hello from WhatsApp!
```

### Enable Auto-Reply

To enable automatic replies, uncomment this line in `src/routes.ts`:

```typescript
// await sendReply(message.from, `You said: ${message.text.body}`);
```

## Testing

### Test Webhook Verification

```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=your_secret_verification_token_123&hub.challenge=test123"
```

Should return: `test123`

### Send Test Message

Use the WhatsApp Business API to send a message, or send a message from your phone to the WhatsApp Business number.

## Project Structure

```
src/
├── index.ts      # Main server file
├── routes.ts     # Webhook handlers and message processing
├── config.ts     # Configuration management
└── types.ts      # Type definitions
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `WA_PHONE_NUMBER_ID` | Your WhatsApp Business phone number ID | `123456789012345` |
| `CLOUD_API_ACCESS_TOKEN` | Access token for WhatsApp Cloud API | `EAABs...` |
| `CLOUD_API_VERSION` | WhatsApp Cloud API version | `v16.0` |
| `WEBHOOK_ENDPOINT` | Webhook path | `webhook` |
| `WEBHOOK_VERIFICATION_TOKEN` | Secret token for webhook verification | `my_secret_token_123` |
| `LISTENER_PORT` | Server port | `3000` |

## Troubleshooting

1. **Webhook verification fails**: Check that your verification token matches
2. **Messages not received**: Ensure webhook is properly configured and server is accessible via HTTPS
3. **Authentication errors**: Verify your access token and phone number ID are correct

## Next Steps

- Add database storage for messages
- Implement message threading and conversation tracking
- Add support for media messages (images, documents, etc.)
- Create a web dashboard for message management
