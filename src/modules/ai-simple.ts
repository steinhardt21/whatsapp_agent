import { generateText, stepCountIs, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { mazzantiniResearchTool } from './tools/mazzanitni.js';
import { calendarTool } from './tools/calendar-tool.js';
import { userProfileTool } from './tools/user-profile-tool.js';
import { getUserProfileManager } from './user-profile/index.js';
import type { LLMConversationContext } from './database/index.js';

// Define the user context interface
export interface UserContext {
  name?: string;
  phone?: string;
  connected?: boolean;
  email?: string;
  appointmentsPlanned?: Array<{
    id: string;
    start_time?: Date | string;
    end_time?: Date | string;
    google_event_id?: string;
  }>;
}

export const processUserMessage = async (
  userId: string,
  userMessage: string,
  conversationHistory: any[],
  userContext?: UserContext,
  llmContext?: LLMConversationContext,
  abortSignal?: AbortSignal
): Promise<string> => {
  try {

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
    // console.log(`🤖 [AI DEBUG] User context:`, userContext);
    // console.log(`🤖 [AI DEBUG] LLM context:`, llmContext);

    // Build enhanced context for AI
    const conversationText = llmContext?.messages
      ? llmContext.messages.slice(-6).map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: "${msg.content}"`).join('\n')
      : conversationHistory.slice(-3).map(msg => `${msg.role}: "${msg.content}"`).join('\n');

    // Format appointments info
    const appointmentsInfo = userContext?.appointmentsPlanned?.length
      ? userContext.appointmentsPlanned.map(apt =>
        `- Appointment ID: ${apt.id}, Google Calendar ID: ${apt.google_event_id}, Time: ${apt.start_time ? apt.start_time : 'TBD'}`
      ).join('\n')
      : 'No planned appointments';


    console.log('🟠111**** appointmentsInfo:', appointmentsInfo);

    const { text } = await generateText({
      model: anthropic("claude-4-sonnet-20250514"),
      stopWhen: stepCountIs(5),

      system: `🚨 

      You are Francesco of Gyver, a community of electricians. You are in charge of call scheduling and gyving information of job offers. Answer in Italian, be friendly and professional.

      CANDIDATE INFORMATION:
      - Name: ${userContext?.name || 'Unknown'}
      - Database ID: ${userId}
      - Phone: ${userContext?.phone || 'Not provided'}

      PLANNED APPOINTMENTS:
      ${appointmentsInfo}

      CONVERSATION CONTEXT:
      - Total messages in history: ${llmContext?.totalMessages || 0}
      - Last user message: "${llmContext?.lastUserMessage || 'None'}"
      - Last assistant message: "${llmContext?.lastAssistantMessage || 'None'}"

      Current time in Rome: ${currentDateTime}

      For greetings: "Ciao, sono Francesco di Gyver. Sei interessato a un'offerta di lavoro oppure di prendere un appuntamento con noi?"

      AVAILABLE TOOLS:
      - calendarManagement: For ALL calendar requests including:
        * Creating new call appointments
        * Modifying existing appointments  
        * Canceling scheduled calls
        * Viewing calendar availability

      CALL SCHEDULING GUIDELINES:
      - Always include the caller's phone number when creating appointments
      - Default to 30-minute duration unless specified otherwise
      - Use Europe/Rome timezone for all scheduling
      - Business hours: 9:00-18:00, Monday-Friday
      - Be professional and clear about appointment details

      RECENT CONVERSATION:
      ${conversationText}`,
      messages: [{ role: 'user', content: userMessage }],
      tools: {
        manageCalendar: calendarTool,
      }
    });

    console.log('🟠111**** llmContext?.lastUserMessage:', llmContext?.lastUserMessage);

    console.log(`📤 [AI DEBUG] AI response for ${userId}: "${text}"`);
    return text;

  } catch (error: unknown) {
    console.error(`❌ Error in AI processing for ${userId}:`, error);

    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    return `Ciao, sono Francesco di Gyver. Al momento ho difficoltà tecniche. Come posso esserti utile?`;
  }
};
