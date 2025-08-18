/**
 * Complete example of integrating getUserData with your webhook
 * This replaces the line 60 in your webhook.ts file
 */

import { getUserData, getUserComplete, createOrUpdateUser, saveChatMessage } from './index.js';

/**
 * Enhanced webhook processing with your existing database
 */
export async function processWebhookWithYourDatabase(messages: any[], whatsappPhoneId?: string) {
  try {
    // Process each message
    for (const message of messages) {
      const wa_id = message.from;
      const messageContent = message.text?.body || '';
      const messageId = message.id;
      
      console.log(`🔄 Processing message from ${wa_id}: "${messageContent}"`);
      
      // 1. GET CANDIDATE DATA FROM YOUR POSTGRES DATABASE
      let candidateData = await getUserData(wa_id);
      
      if (!candidateData) {
        console.log(`🆕 New candidate detected: ${wa_id}`);
        // Create new candidate if they don't exist
        candidateData = await createOrUpdateUser(wa_id, {
          first_name: 'New',
          last_name: 'Candidate',
          phone: wa_id,
          connected: true
        });
      } else {
        console.log(`👤 Existing candidate: ${candidateData.name} (ID: ${candidateData.id})`);
      }
      
      // 2. GET COMPLETE DATA: APPOINTMENTS, CHAT HISTORY, JOBS
      const completeData = await getUserComplete(wa_id, 9);
      const appointments = completeData?.appointments || [];
      const chatHistory = completeData?.chat_history || [];
      const jobs = completeData?.jobs || [];
      
      console.log(`📊 Candidate context:`);
      console.log(`  📅 Appointments: ${appointments.length}`);
      console.log(`  💬 Chat history: ${chatHistory.length} messages`);
      console.log(`  💼 Jobs: ${jobs.length}`);
      
      // 3. SAVE INCOMING MESSAGE TO CHAT HISTORY
      if (messageContent) {
        await saveChatMessage(candidateData.id, {
          role: 'user',
          content: messageContent,
          timestamp: new Date().toISOString(),
          wa_message_id: messageId,
          phone_number: wa_id
        });
      }
      
      // 4. PREPARE RICH CONTEXT FOR AI PROCESSING
      const aiContext = {
        candidate: {
          id: candidateData.id,
          name: candidateData.name,
          email: candidateData.email,
          phone: candidateData.phone,
          connected: candidateData.connected,
          created_at: candidateData.created_at
        },
        appointments: appointments.map(apt => ({
          id: apt.id,
          status: apt.status,
          start_time: apt.start_time,
          end_time: apt.end_time,
          google_event_id: apt.google_event_id
        })),
        recentChatHistory: chatHistory.slice(-5).map(chat => ({
          message: chat.message,
          timestamp: chat.id // Using ID as timestamp proxy
        })),
        activeJobs: jobs.filter(job => job.status !== 'completed').map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          step: job.step
        })),
        currentMessage: messageContent,
        messageId: messageId
      };
      
      console.log(`🤖 AI Context prepared for: ${candidateData.name}`);
      
      // 5. RETURN CONTEXT FOR YOUR AI PROCESSING
      // You can now use this rich context in your existing AI processing
      return aiContext;
    }
    
  } catch (error) {
    console.error('❌ Error in webhook database processing:', error);
    throw error;
  }
}

/**
 * Simplified version - just get the candidate data
 */
export async function getWebhookCandidateData(wa_id: string) {
  try {
    // This is what you can use to replace line 60 in webhook.ts
    const candidateData = await getUserData(wa_id);
    
    if (candidateData) {
      console.log(`✅ Found candidate: ${candidateData.name} (${candidateData.email})`);
      console.log(`📱 Connected: ${candidateData.connected}`);
      console.log(`📅 Member since: ${candidateData.created_at}`);
    } else {
      console.log(`❌ No candidate found for wa_id: ${wa_id}`);
      // Optionally create a new candidate
      const newCandidate = await createOrUpdateUser(wa_id, {
        first_name: 'Unknown',
        last_name: 'User',
        phone: wa_id,
        connected: true
      });
      console.log(`🆕 Created new candidate: ${newCandidate.id}`);
      return newCandidate;
    }
    
    return candidateData;
    
  } catch (error) {
    console.error(`❌ Error getting candidate data for ${wa_id}:`, error);
    return null;
  }
}

/**
 * Example of how to update your webhook.ts processWebhookMessage function
 */
export function updateWebhookExample() {
  return `
// In your webhook.ts file, replace this line:
// const userData = await getUserData(value.messages[0].from);

// With this:
import { getUserData, getUserComplete } from '../database/index.js';

// Simple version - just get candidate data
const candidateData = await getUserData(value.messages[0].from);

// OR Complete version - get everything
const completeCandidate = await getUserComplete(value.messages[0].from, 9);
const candidateData = completeCandidate;
const appointments = completeCandidate?.appointments || [];
const chatHistory = completeCandidate?.chat_history || [];
const jobs = completeCandidate?.jobs || [];

console.log('🎯 Ready for AI processing with full context!');
`;
}

// Quick test function to verify database connection
export async function testDatabaseIntegration() {
  try {
    console.log('🧪 Testing database integration...');
    
    // Test with a sample wa_id
    const testWaId = '1234567890';
    const candidateData = await getUserData(testWaId);
    
    if (candidateData) {
      console.log(`✅ Database test successful! Found: ${candidateData.name}`);
    } else {
      console.log(`ℹ️ No candidate found for test wa_id: ${testWaId}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database test failed:', error);
    return false;
  }
}
