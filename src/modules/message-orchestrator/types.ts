export interface IncomingMessage {
  id: string;
  from: string;
  content: string;
  timestamp: Date;
  whatsappPhoneId?: string;
}

export interface MessageBatch {
  phoneNumber: string;
  messages: IncomingMessage[];
  firstMessageAt: Date;
  lastMessageAt: Date;
  whatsappPhoneId?: string;
}

export interface ProcessingState {
  phoneNumber: string;
  isProcessing: boolean;
  timeoutId?: NodeJS.Timeout;
  pendingMessages: IncomingMessage[];
  lastMessageAt: Date;
  processingAbortController?: AbortController;
  shouldRestart: boolean;
}

export interface OrchestratorConfig {
  batchTimeoutMs: number; // Time to wait for more messages
  maxBatchSize: number;   // Maximum messages in a batch
  processingTimeoutMs: number; // Max time for processing
}
