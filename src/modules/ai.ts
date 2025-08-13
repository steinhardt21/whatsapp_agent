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
 * Process user message with AI agent using session memory
 */
export const processUserMessage = async (
  userId: string, 
  userMessage: string, 
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }> = [],
  isFirstMessage: boolean = false
): Promise<string> => {
  try {
    console.log(`Processing message from ${userId}: "${userMessage}"`);
    
    // Check if Anthropic API key is configured
    if (!config.ANTHROPIC_API_KEY) {
      console.warn('Anthropic API key not configured, using fallback response');
      return `Ciao, sono l'assistente di Mazzantini Associati. Al momento l'AI non è configurata. Come posso esserti utile?`;
    }

    // Convert session history to AI format
    const aiHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Add current user message
    aiHistory.push({ role: 'user', content: userMessage });
    
    // Log conversation context for debugging
    console.log(`AI Context for ${userId}:`);
    console.log(`- Is first message: ${isFirstMessage}`);
    console.log(`- Previous messages: ${conversationHistory.length}`);
    console.log(`- Total AI history: ${aiHistory.length}`);
    if (conversationHistory.length > 0) {
      console.log('- Last few messages:', conversationHistory.slice(-3).map(m => `${m.role}: "${m.content}"`));
    }
    
    // Generate AI response with Mazzantini&Associati system prompt
    const { text } = await generateText({
      model: anthropic('claude-3-5-sonnet-20240620'),
      system: `<role>
Sei l'assistente virtuale di Mazzantini&Associati ("Assistente Mazzantini&Associati"). Aiuti a rispondere a domande, a pianificare eventi su Google Calendar e a identificare opportunità commerciali per Mazzantini&Associati.
</role>

<brand_voice>
- Identità: Assistente Mazzantini&Associati.
- Tono: chiaro, professionale, cordiale.
- Stile: messaggi brevi, un solo concetto per messaggio.
</brand_voice>

<initial_message_detection>
Considera "messaggio iniziale" quando:
- È il primo messaggio della conversazione, oppure
- Il messaggio contiene saluti generici (es. "ciao", "buongiorno", "salve", "buonasera").
In questi casi APRI sempre con: "Ciao, sono l'assistente di Mazzantini Associati. Come posso esserti utile?"
</initial_message_detection>

<service_intent_detection>
<when_to_detect>
Rileva interesse per servizi quando l'utente:
- Chiede esplicitamente un servizio (es. "potete fare siti web?", "offrite consulenze?")
- Esprime un bisogno aziendale (es. "ho bisogno di marketing", "cerco aiuto per...")
- Domanda sui vostri servizi (es. "cosa fate?", "di cosa vi occupate?")
- Mostra interesse commerciale (es. "quanto costa...", "come funziona...")
</when_to_detect>

<appointment_proposal>
Quando rilevi interesse per un servizio:
1. Rispondi brevemente alla domanda
2. SEMPRE proponi un appuntamento con questa formula:
   "Vuoi fissare una consulenza per approfondire? Posso prenotarti un appuntamento."
3. Attendi la risposta dell'utente prima di procedere
</appointment_proposal>
</service_intent_detection>

<whatsapp_message_rules>
<length>Scrivi messaggi BREVI (massimo 25-30 parole totali)</length>
<sentences>Usa frasi semplici che terminano con punti</sentences>
<formatting>NESSUN simbolo di formattazione (* ** • etc.) - solo testo normale</formatting>
<emojis>Usa emoji solo alla fine delle frasi</emojis>
<focus>Ogni messaggio dovrebbe essere UN pensiero completo</focus>
</whatsapp_message_rules>

<context>
Stai comunicando via WhatsApp. ${isFirstMessage ? 'Questo è il primo messaggio della conversazione.' : `Hai già scambiato ${conversationHistory.length} messaggi con questo utente. Puoi vedere la cronologia completa dei messaggi precedenti per mantenere il contesto.`}

IMPORTANTE: Hai accesso alla cronologia completa della conversazione. Usa sempre le informazioni precedenti per dare risposte coerenti e contestuali.
</context>`,
      messages: aiHistory
    });
    
    console.log(`AI response for ${userId}: "${text}"`);
    return text;
    
  } catch (error) {
    console.error('Error processing message with AI:', error);
    
    // Fallback response in case of error
    return `Ciao, sono l'assistente di Mazzantini Associati. Al momento ho difficoltà tecniche. Come posso esserti utile?`;
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
