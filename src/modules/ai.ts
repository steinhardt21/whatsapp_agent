import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { config } from '../config.js';
import { 
  mazzantiniResearchTool, 
  mazzanitniInfoTool,
  calendarTool,
  userProfileTool,
  handleMazzantiniResearch
} from './tools/index.js';
import { getUserProfileManager } from './user-profile/index.js';

/**
 * Get current time and day in Rome timezone
 */
const getRomeTimeAndDay = (): { currentTime: string; currentDay: string; currentDate: string } => {
  const now = new Date();
  const romeTime = now.toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const romeDay = now.toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long'
  });
  
  const romeDate = now.toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return {
    currentTime: romeTime,
    currentDay: romeDay,
    currentDate: romeDate
  };
};

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
  isFirstMessage: boolean = false,
  abortSignal?: AbortSignal
): Promise<string> => {
  try {
    // Check for abort at the start
    if (abortSignal?.aborted) {
      const error = new Error('Processing aborted before AI call');
      error.name = 'AbortError';
      throw error;
    }

    console.log(`Processing message from ${userId}: "${userMessage}"`);
    
    // Check if Anthropic API key is configured
    if (!config.ANTHROPIC_API_KEY) {
      console.warn('Anthropic API key not configured, using fallback response');
      return `Ciao, sono l'assistente di Mazzantini Associati. Al momento l'AI non è configurata. Come posso esserti utile?`;
    }

    // Check for abort before building history
    if (abortSignal?.aborted) {
      const error = new Error('Processing aborted before building conversation history');
      error.name = 'AbortError';
      throw error;
    }

    // Convert session history to AI format
    const aiHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Add current user message
    aiHistory.push({ role: 'user', content: userMessage });
    
    // Get current Rome time and day
    const { currentTime, currentDay, currentDate } = getRomeTimeAndDay();

    // Get user profile for context
    const profileManager = getUserProfileManager();
    
    // Also get conversation history from user profile for better context
    const persistentHistory = await profileManager.getRecentMessages(userId, 20); // Get last 20 messages
    console.log(`📚 [AI DEBUG] Persistent conversation history: ${persistentHistory.length} messages from profile`);
    
    // If we have persistent history and it's more recent/complete than session history, prefer it
    if (persistentHistory.length > conversationHistory.length) {
      console.log(`📚 [AI DEBUG] Using persistent history (${persistentHistory.length} msgs) over session history (${conversationHistory.length} msgs)`);
      const persistentAiHistory = persistentHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      // Add current message if it's not already the last one
      if (persistentAiHistory.length === 0 || persistentAiHistory[persistentAiHistory.length - 1].content !== userMessage) {
        persistentAiHistory.push({ role: 'user', content: userMessage });
      }
      // Use persistent history for AI context
      aiHistory.length = 0;
      aiHistory.push(...persistentAiHistory);
    }
    await profileManager.updateFromConversation(userId, userMessage);
    const userProfile = await profileManager.getProfile(userId);

    // Log conversation context for debugging
    console.log(`AI Context for ${userId}:`);
    console.log(`- Is first message: ${isFirstMessage}`);
    console.log(`- Previous messages: ${conversationHistory.length}`);
    console.log(`- Total AI history: ${aiHistory.length}`);
    console.log(`- Rome time: ${currentTime} (${currentDay}, ${currentDate})`);
    console.log(`- User profile:`, {
      name: userProfile?.name,
      email: userProfile?.email,
      interestLevel: userProfile?.interestLevel,
      hasAppointment: !!userProfile?.currentAppointment,
      appointmentDetails: userProfile?.currentAppointment ? {
        id: userProfile.currentAppointment.googleCalendarId || userProfile.currentAppointment.eventId,
        title: userProfile.currentAppointment.title,
        scheduledFor: userProfile.currentAppointment.scheduledFor,
        status: userProfile.currentAppointment.status
      } : null
    });
    if (conversationHistory.length > 0) {
      console.log('- Last few messages:', conversationHistory.slice(-3).map(m => `${m.role}: "${m.content}"`));
    }

    // Check for abort before AI call
    if (abortSignal?.aborted) {
      const error = new Error('Processing aborted before AI generation');
      error.name = 'AbortError';
      throw error;
    }
    
    // Generate AI response with Mazzantini&Associati system prompt
    console.log(`🤖 [AI DEBUG] Starting AI generation for user ${userId} with message: "${userMessage}"`);
    const { text } = await generateText({
      model: anthropic('claude-3-5-sonnet-20240620'),
      maxSteps: 5,
      system: `🚨 MANDATORY RULE: For calendar operations (create/delete/modify), you MUST call calendarManagement tool FIRST. NEVER fake calendar actions!

You are Mazzantini&Associati assistant. Answer in Italian, be friendly and professional.

USER: ${userId}
PROFILE: ${userProfile ? `Nome: ${userProfile.name || 'N/A'}, Email: ${userProfile.email || 'N/A'}, Appuntamento: ${userProfile.currentAppointment ? 'Sì' : 'No'}` : 'Nessuno'}

For greetings: "Ciao, sono l'assistente di Mazzantini Associati. Come posso esserti utile?"

Calendar requests: ALWAYS call calendarManagement(action: "create|delete|search", phoneNumber: "${userId}", userRequest: "user's message")

<whatsapp_message_rules>
<length>Scrivi messaggi BREVI ma completi</length>
<sentences>Usa frasi semplici che terminano con punti</sentences>
<formatting>NESSUN simbolo di formattazione (* ** • etc.) - solo testo normale</formatting>
<emojis>Usa emoji solo alla fine delle frasi</emojis>
<focus>Ogni messaggio dovrebbe essere UN pensiero completo</focus>
</whatsapp_message_rules>

<context>
Stai comunicando via WhatsApp. ${isFirstMessage ? 'Questo è il primo messaggio della conversazione.' : `Hai già scambiato ${conversationHistory.length} messaggi con questo utente. Puoi vedere la cronologia completa dei messaggi precedenti per mantenere il contesto.`}

NUMERO TELEFONO UTENTE: ${userId}
ORARIO ATTUALE: ${currentTime} di ${currentDay}, ${currentDate} (fuso orario di Roma)

PROFILO UTENTE CORRENTE:
${userProfile ? `
- Nome: ${userProfile.name || 'Non disponibile'}
- Email: ${userProfile.email || 'Non disponibile'}
- Livello interesse: ${userProfile.interestLevel || 'Sconosciuto'}
- Servizi di interesse: ${userProfile.serviceInterests?.join(', ') || 'Nessuno'}
- Appuntamento attivo: ${userProfile.currentAppointment ? `Sì - ${userProfile.currentAppointment.title} il ${userProfile.currentAppointment.scheduledFor}` : 'No'}
${userProfile.currentAppointment ? `- ID Evento Google Calendar: ${userProfile.currentAppointment.googleCalendarId || 'Non disponibile'}
- Status appuntamento: ${userProfile.currentAppointment.status || 'Non disponibile'}
- Durata: ${userProfile.currentAppointment.duration || 60} minuti` : ''}
- Profilo completato: ${Math.round((userProfile.completionPercentage || 0) * 100)}%
` : 'Nessun profilo disponibile'}

REGOLE INTELLIGENTI PER RACCOLTA DATI:
🧠 PRIMA DI CHIEDERE INFORMAZIONI, CONTROLLA SEMPRE IL PROFILO UTENTE:

1. NOME:
   - SE già presente nel profilo → NON chiedere di nuovo
   - SE mancante → "Per fissare l'appuntamento, mi serve il tuo nome"
   - ⚠️ IMPORTANTE: Chiedi solo "nome", MAI "nome completo" o "nome e cognome"
   - 🧠 ESTRAZIONE INTELLIGENTE: Quando l'utente fornisce il nome in qualsiasi forma:
     * "il mio nome e' Alex" → usa updateUserProfile con name: "Alex"
     * "Alex Enache" → usa updateUserProfile con name: "Alex Enache"  
     * "sono Marco" → usa updateUserProfile con name: "Marco"
   - ✅ SEMPRE chiamare updateUserProfile quando rilevi un nome nella conversazione
   - 📢 DOPO aver salvato: conferma con "Perfetto, [Nome]! Ho aggiornato il tuo profilo."

2. EMAIL:
   - SE già presente e valida nel profilo → NON chiedere di nuovo, USALA direttamente
   - SE mancante o non valida → "Per inviarti l'invito, mi serve il tuo indirizzo email"

3. DETTAGLI MEETING:
   - Chiedi sempre cosa vuole discutere durante l'incontro
   - Salva nel profilo per preparazione

4. APPUNTAMENTI:
   - SE ha già un appuntamento attivo → offri cancellazione/riprogrammazione
   - SE non ha appuntamenti → procedi normalmente

IMPORTANTE: 
- Hai accesso alla cronologia completa della conversazione e all'orario attuale
- Il numero di telefono dell'utente è ${userId} - usa questo come parametro phoneNumber negli strumenti
- USA SEMPRE i dati esistenti del profilo per evitare domande ripetitive
- Personalizza le risposte con le informazioni che già conosci
- Se l'utente chiede l'ora o informazioni temporali, usa l'orario di Roma fornito

ESPERIENZA UTENTE MIGLIORATA:
- Non ripetere domande per informazioni già disponibili
- Usa il nome dell'utente quando lo conosci
- Riferisciti ai suoi interessi precedenti quando appropriato
- Mantieni coerenza con le informazioni salvate
</context>`,
      messages: aiHistory,
      tools: {
        mazzantiniResearch: mazzantiniResearchTool,
        mazzanitniInfo: mazzanitniInfoTool,
        calendarManagement: calendarTool,
        updateUserProfile: userProfileTool,
      },
      abortSignal // Pass abort signal to AI generation
    });
    
    console.log(`🤖 [AI DEBUG] AI generation completed for ${userId}`);
    console.log(`📤 [AI DEBUG] AI response for ${userId}: "${text}"`);
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
