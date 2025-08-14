import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { mazzantiniResearchTool } from './tools/mazzanitni.js';
import { calendarTool } from './tools/calendar-tool.js';
import { userProfileTool } from './tools/user-profile-tool.js';
import { getUserProfileManager } from './user-profile/index.js';

export const processUserMessage = async (
  userId: string,
  userMessage: string,
  conversationHistory: any[],
  abortSignal?: AbortSignal
): Promise<string> => {
  try {
    // Get user profile
    const profileManager = getUserProfileManager();
    const userProfile = await profileManager.getProfile(userId);
    
    // Get current time in Rome
    const now = new Date();
    const romeTime = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const currentDateTime = romeTime.format(now);

    console.log(`🤖 [AI DEBUG] Starting AI generation for user ${userId} with message: "${userMessage}"`);
    
    const { text } = await generateText({
      model: anthropic('claude-3-5-sonnet-20240620'),
      maxSteps: 5,
      system: `🚨 CRITICAL: For calendar operations (create/delete/modify appointments), you MUST call calendarManagement tool FIRST. NEVER fake calendar actions!

You are the Mazzantini&Associati assistant. Answer in Italian, be friendly and professional.

User: ${userId}
Profile: ${userProfile ? `${userProfile.name || 'No name'}, ${userProfile.email || 'No email'}, Appointment: ${userProfile.currentAppointment ? 'Yes' : 'No'}` : 'None'}
Time: ${currentDateTime}

For greetings: "Ciao, sono l'assistente di Mazzantini Associati. Come posso esserti utile?"

TOOLS:
- calendarManagement: For ANY calendar request (create/delete/search) - ALWAYS call this first
- updateUserProfile: When detecting user info
- mazzantiniResearch: For company questions

Recent messages:
${conversationHistory.slice(-3).map(msg => `${msg.role}: "${msg.content}"`).join('\n')}`,
      messages: [{ role: 'user', content: userMessage }],
      tools: {
        mazzantiniResearch: mazzantiniResearchTool,
        calendarManagement: calendarTool,
        updateUserProfile: userProfileTool
      },
      abortSignal
    });

    console.log(`📤 [AI DEBUG] AI response for ${userId}: "${text}"`);
    return text;

  } catch (error: unknown) {
    console.error(`❌ Error in AI processing for ${userId}:`, error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    
    return `Ciao, sono l'assistente di Mazzantini Associati. Al momento ho difficoltà tecniche. Come posso esserti utile?`;
  }
};
