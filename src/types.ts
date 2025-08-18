export interface ServerConfig {
  port: number;
  host: string;
  logger: boolean;
}

// Session management types
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  messageId?: string; // WhatsApp message ID
}



export interface ConversationState {
  currentTopic?: string;
  context?: Record<string, any>;
  awaitingResponse?: boolean;
  lastInteraction: Date;
  messageCount: number;
}

export interface UserSession {
  phoneNumber: string;
  whatsappId?: string; // WhatsApp user ID
  whatsappPhoneId?: string; // WhatsApp phone number ID from metadata
  displayName?: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  conversationHistory: ConversationMessage[];
  state: ConversationState;
  metadata?: Record<string, any>;
}

export interface SessionConfig {
  defaultTimeoutMs: number;
  maxConversationHistory: number;
  cleanupIntervalMs: number;
  redisUrl?: string;
  redisOptions?: Record<string, any>;
}

export interface SessionStore {
  get(phoneNumber: string): Promise<UserSession | null>;
  set(phoneNumber: string, session: UserSession): Promise<void>;
  delete(phoneNumber: string): Promise<void>;
  exists(phoneNumber: string): Promise<boolean>;
  cleanup(): Promise<number>; // Returns number of cleaned up sessions
  getAllActivePhoneNumbers(): Promise<string[]>;
  updateLastActive(phoneNumber: string): Promise<void>;
}

// WhatsApp webhook types
export interface WhatsAppWebhookBody {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: {
            body: string;
          };
          button?: {
            payload: string;
            text: string;
          };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}
