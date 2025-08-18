/**
 * Chat message utilities for extracting and formatting conversation history
 */

import { ChatHistoryData } from './types.js';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  messageId?: number;
}

export interface LLMConversationContext {
  messages: ConversationMessage[];
  totalMessages: number;
  lastUserMessage?: string;
  lastAssistantMessage?: string;
}

/**
 * Extract conversation messages from chat history for LLM context
 */
export function extractConversationMessages(chatHistory: ChatHistoryData[]): ConversationMessage[] {
  return chatHistory.map(chat => {
    const message = chat.message;
    
    // Determine the role based on message type
    let role: 'user' | 'assistant';
    let content: string;
    
    if (message.type === 'human') {
      role = 'user';
      content = message.content || '';
    } else if (message.type === 'ai') {
      role = 'assistant';
      
      // Extract the actual message from the AI response
      if (typeof message.content === 'string') {
        try {
          const parsed = JSON.parse(message.content);
          content = parsed.output?.messageForUser || message.content;
        } catch {
          content = message.content;
        }
      } else {
        content = message.content || '';
      }
    } else {
      // Default to assistant for unknown types
      role = 'assistant';
      content = message.content || '';
    }
    
    return {
      role,
      content,
      messageId: chat.id,
      // You could add timestamp extraction here if available in your data
    };
  }).filter(msg => msg.content.trim() !== ''); // Filter out empty messages
}

/**
 * Format conversation for LLM context with metadata
 */
export function buildLLMConversationContext(chatHistory: ChatHistoryData[]): LLMConversationContext {
  const messages = extractConversationMessages(chatHistory);
  
  // Find the last messages by type
  const lastUserMessage = messages
    .filter(msg => msg.role === 'user')
    .pop()?.content;
    
  const lastAssistantMessage = messages
    .filter(msg => msg.role === 'assistant')
    .pop()?.content;
  
  return {
    messages,
    totalMessages: messages.length,
    lastUserMessage,
    lastAssistantMessage
  };
}

/**
 * Format conversation as a simple text string for LLM prompt
 */
export function formatConversationForLLM(chatHistory: ChatHistoryData[], maxMessages: number = 9): string {
  const messages = extractConversationMessages(chatHistory);
  
  // Get the last N messages
  const recentMessages = messages.slice(-maxMessages);
  
  return recentMessages
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');
}

/**
 * Get conversation summary for context
 */
export function getConversationSummary(chatHistory: ChatHistoryData[]): {
  userMessageCount: number;
  assistantMessageCount: number;
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
  conversationLength: number;
} {
  const messages = extractConversationMessages(chatHistory);
  
  const userMessages = messages.filter(msg => msg.role === 'user');
  const assistantMessages = messages.filter(msg => msg.role === 'assistant');
  
  return {
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    lastUserMessage: userMessages[userMessages.length - 1]?.content || null,
    lastAssistantMessage: assistantMessages[assistantMessages.length - 1]?.content || null,
    conversationLength: messages.length
  };
}

/**
 * Extract only user messages (for understanding user intent/history)
 */
export function extractUserMessages(chatHistory: ChatHistoryData[]): string[] {
  return extractConversationMessages(chatHistory)
    .filter(msg => msg.role === 'user')
    .map(msg => msg.content);
}

/**
 * Extract conversation with intent information (if available)
 */
export function extractConversationWithIntent(chatHistory: ChatHistoryData[]): Array<{
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  hasIntentIdentified?: boolean;
}> {
  return chatHistory.map(chat => {
    const message = chat.message;
    let role: 'user' | 'assistant';
    let content: string;
    let intent: string | undefined;
    let hasIntentIdentified: boolean | undefined;
    
    if (message.type === 'human') {
      role = 'user';
      content = message.content || '';
    } else if (message.type === 'ai') {
      role = 'assistant';
      
      if (typeof message.content === 'string') {
        try {
          const parsed = JSON.parse(message.content);
          content = parsed.output?.messageForUser || message.content;
          intent = parsed.output?.typeOfIntent;
          hasIntentIdentified = parsed.output?.hasBeenIntentIdentified;
        } catch {
          content = message.content;
        }
      } else {
        content = message.content || '';
      }
    } else {
      role = 'assistant';
      content = message.content || '';
    }
    
    return {
      role,
      content,
      ...(intent && { intent }),
      ...(hasIntentIdentified !== undefined && { hasIntentIdentified })
    };
  }).filter(msg => msg.content.trim() !== '');
}
