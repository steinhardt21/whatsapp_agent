import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { config } from '../config.js';

// Message history storage (in a real app, use a database)
const conversationHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

/**
 * Get conversation history for a user
 */
const getConversationHistory = (userId: string) => {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  return conversationHistory.get(userId)!;
};

/**
 * Add message to conversation history
 */
const addToHistory = (userId: string, role: 'user' | 'assistant', content: string) => {
  const history = getConversationHistory(userId);
  history.push({ role, content });
  
  // Keep only last 10 messages to avoid token limits
  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }
};

/**
 * Process user message with AI agent
 */
export const processUserMessage = async (userId: string, userMessage: string): Promise<string> => {
  try {
    console.log(`Processing message from ${userId}: "${userMessage}"`);
    
    // Check if Anthropic API key is configured
    if (!config.ANTHROPIC_API_KEY) {
      console.warn('Anthropic API key not configured, using fallback response');
      return `Hai scritto: "${userMessage}". Mi dispiace, ma l'AI non è configurata al momento.`;
    }

    // Add user message to history
    addToHistory(userId, 'user', userMessage);
    
    // Get conversation history
    const history = getConversationHistory(userId);
    
    // Generate AI response
    const { text } = await generateText({
      model: anthropic('claude-3-5-sonnet-20240620'),
      system: `Sei un assistente virtuale italiano amichevole e utile. 
      Rispondi sempre in italiano in modo naturale e conversazionale.
      Cerca di essere conciso ma informativo nelle tue risposte.
      Se l'utente fa domande personali, rispondi in modo educato ma mantieni un tono professionale.`,
      messages: history.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    });

    // Add AI response to history
    addToHistory(userId, 'assistant', text);
    
    console.log(`AI response for ${userId}: "${text}"`);
    return text;
    
  } catch (error) {
    console.error('Error processing message with AI:', error);
    
    // Fallback response in case of error
    return `Ciao! Ho ricevuto il tuo messaggio: "${userMessage}". Al momento non riesco a elaborare una risposta completa, ma sono qui per aiutarti!`;
  }
};

/**
 * Clear conversation history for a user
 */
export const clearUserHistory = (userId: string): void => {
  conversationHistory.delete(userId);
  console.log(`Cleared conversation history for user ${userId}`);
};

/**
 * Get conversation statistics
 */
export const getConversationStats = () => {
  const totalUsers = conversationHistory.size;
  const totalMessages = Array.from(conversationHistory.values())
    .reduce((total, history) => total + history.length, 0);
  
  return {
    totalUsers,
    totalMessages,
    averageMessagesPerUser: totalUsers > 0 ? Math.round(totalMessages / totalUsers) : 0
  };
};

/**
 * Test AI configuration
 */
export const testAIConfiguration = async (): Promise<boolean> => {
  try {
    if (!config.ANTHROPIC_API_KEY) {
      console.warn('⚠️  Anthropic API key not configured - AI features will use fallback responses');
      return false;
    }
    
    console.log('Testing AI configuration...');
    const testResponse = await generateText({
      model: anthropic('claude-3-5-sonnet-20240620'),
      system: 'Rispondi con una sola parola: "ok"',
      messages: [{ role: 'user', content: 'test' }]
    });
    
    if (testResponse.text.toLowerCase().includes('ok')) {
      console.log('✅ AI configuration is working');
      return true;
    } else {
      console.warn('⚠️  AI configuration test failed - unexpected response');
      return false;
    }
  } catch (error) {
    console.error('❌ AI configuration error:', error);
    return false;
  }
};
