import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { config } from '../config.js';
import { mazzantiniResearchTool, mazzanitniInfoTool, calendarTool } from './tools/index.js';
/**
 * Get current time and day in Rome timezone
 */
const getRomeTimeAndDay = () => {
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
const conversationHistory = new Map();
/**
 * Get conversation history for a user
 */
const getConversationHistory = (userId) => {
    if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, []);
    }
    return conversationHistory.get(userId);
};
/**
 * Add message to conversation history
 */
const addToHistory = (userId, role, content) => {
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
export const processUserMessage = async (userId, userMessage, conversationHistory = [], isFirstMessage = false, abortSignal) => {
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
        // Log conversation context for debugging
        console.log(`AI Context for ${userId}:`);
        console.log(`- Is first message: ${isFirstMessage}`);
        console.log(`- Previous messages: ${conversationHistory.length}`);
        console.log(`- Total AI history: ${aiHistory.length}`);
        console.log(`- Rome time: ${currentTime} (${currentDay}, ${currentDate})`);
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

    <tools_usage>
Hai accesso ai seguenti strumenti per ricerca dettagliata:
- mazzantiniResearch: STRUMENTO PRINCIPALE - Usa questo per qualsiasi domanda dettagliata su Mazzantini & Associati: servizi, storia, team, approccio AI, Web3, filosofia aziendale. Fornisce risposte complete e contestualizzate.
- mazzanitniInfo: Strumento legacy per informazioni base sulla creazione dell'azienda (30 anni fa).
- calendarManagement: GESTIONE CALENDARIO - Usa questo per qualsiasi richiesta relativa a calendario, appuntamenti, eventi, gestione del tempo.

QUANDO USARE mazzantiniResearch:
- Domande sui servizi (digital marketing, eventi, grafica, Web3, AI)
- Informazioni su team e competenze
- Storia e filosofia aziendale  
- Approccio all'intelligenza artificiale
- Servizi blockchain, NFT, metaverso
- Comunicazione Integrata Multicanale©
- Qualsiasi domanda specifica sull'agenzia

QUANDO USARE calendarManagement:
- Creare appuntamenti o eventi
- Cercare appuntamenti esistenti
- Modificare o cancellare eventi
- Visualizzare il calendario
- Qualsiasi richiesta che coinvolge date, orari, programmazione

SEMPRE delegare a mazzantiniResearch per domande sostanziali su Mazzantini & Associati.
SEMPRE delegare a calendarManagement per richieste di calendario.

NOTA: Il sistema è stato aggiornato per utilizzare programmazione funzionale pura per migliori performance e testabilità.
</tools_usage>

<whatsapp_message_rules>
<length>Scrivi messaggi BREVI ma completi</length>
<sentences>Usa frasi semplici che terminano con punti</sentences>
<formatting>NESSUN simbolo di formattazione (* ** • etc.) - solo testo normale</formatting>
<emojis>Usa emoji solo alla fine delle frasi</emojis>
<focus>Ogni messaggio dovrebbe essere UN pensiero completo</focus>
</whatsapp_message_rules>

<context>
Stai comunicando via WhatsApp. ${isFirstMessage ? 'Questo è il primo messaggio della conversazione.' : `Hai già scambiato ${conversationHistory.length} messaggi con questo utente. Puoi vedere la cronologia completa dei messaggi precedenti per mantenere il contesto.`}

ORARIO ATTUALE: ${currentTime} di ${currentDay}, ${currentDate} (fuso orario di Roma)

IMPORTANTE: Hai accesso alla cronologia completa della conversazione e all'orario attuale. Usa sempre le informazioni precedenti per dare risposte coerenti e contestuali. Se l'utente chiede l'ora o informazioni temporali, usa l'orario di Roma fornito.
</context>`,
            messages: aiHistory,
            tools: {
                mazzantiniResearch: mazzantiniResearchTool,
                mazzanitniInfo: mazzanitniInfoTool,
                calendarManagement: calendarTool,
            },
            abortSignal // Pass abort signal to AI generation
        });
        console.log(`🤖 [AI DEBUG] AI generation completed for ${userId}`);
        console.log(`📤 [AI DEBUG] AI response for ${userId}: "${text}"`);
        return text;
    }
    catch (error) {
        console.error('Error processing message with AI:', error);
        // Fallback response in case of error
        return `Ciao, sono l'assistente di Mazzantini Associati. Al momento ho difficoltà tecniche. Come posso esserti utile?`;
    }
};
/**
 * Clear conversation history for a user
 */
export const clearUserHistory = (userId) => {
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
export const testAIConfiguration = async () => {
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
        }
        else {
            console.warn('⚠️  AI configuration test failed - unexpected response');
            return false;
        }
    }
    catch (error) {
        console.error('❌ AI configuration error:', error);
        return false;
    }
};
//# sourceMappingURL=ai.js.map