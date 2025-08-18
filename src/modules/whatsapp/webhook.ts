import { config } from '../../config.js';
import type { WhatsAppWebhookBody } from '../../types.js';
import { processUserMessage, type UserContext } from '../ai-simple.js';
import {
  getCandidateAppointmentsByStatus,
  getCandidateChatHistory,
  getUserData,
  getJobOffersByType,
  getInternalJobByStatus,
  createInternalJob,
  updateInternalJob,
  buildLLMConversationContext,
  extractConversationMessages,
  saveChatMessage,
  resetUserData,
  JobOfferData
} from '../database/index.js';
import { agentForStep1 } from './agents-for-steps.js';
import { sendMessage, sendTypingIndicator } from './index.js';

// Constants
const N8N_WEBHOOK_URL = 'https://gyver.app.n8n.cloud/webhook/2649fbb9-e562-49ce-9b90-d4713eec0eb4';
const TIMEZONE = 'Europe/Rome';

/**
 * Convert UTC date to local time for a specific timezone
 * @param dateString - UTC date string (e.g., "2025-08-17T07:00:00.000Z")
 * @param timezone - Timezone identifier (e.g., "Europe/Rome")
 * @returns ISO 8601 string with timezone (e.g., "2025-08-17T09:00:00.000+02:00")
 */
export const getLocalTimeEvent = (dateString: string, timezone: string = TIMEZONE): string => {
  try {
    const utcDate = new Date(dateString);
    
    if (isNaN(utcDate.getTime())) {
      throw new Error(`Invalid date string: ${dateString}`);
    }
    
    const localTimeString = utcDate.toLocaleString('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hour12: false
    }).replace(', ', 'T').replace(/,/g, '.');
    
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      timeZoneName: 'longOffset'
    });
    const parts = formatter.formatToParts(utcDate);
    const offsetPart = parts.find(part => part.type === 'timeZoneName');
    let timezoneOffset = offsetPart?.value || '+00:00';
    
    timezoneOffset = timezoneOffset.replace('GMT', '');
    
    return `${localTimeString}${timezoneOffset}`;
  } catch (error) {
    console.error('Error converting date to local time:', error);
    return dateString; // Fallback to original string
  }
};

/**
 * Save both user and assistant messages to the database
 */
async function saveConversationMessages(
  userId: string, 
  userMessage: string, 
  assistantMessage: string, 
  waMessageId: string
): Promise<void> {
  try {
    // Save user message
    await saveChatMessage(userId, {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      wa_message_id: waMessageId
    });

    // Save assistant message
    await saveChatMessage(userId, {
      role: 'assistant',
      content: assistantMessage,
      timestamp: new Date().toISOString(),
      wa_message_id: waMessageId
    });

    console.log(`💾 Saved conversation messages for user: ${userId}`);
  } catch (error) {
    console.error('❌ Error saving conversation messages:', error);
  }
}

/**
 * Send a webhook request to n8n
 */
async function sendN8nWebhook(payload: any): Promise<boolean> {
  try {
    console.log('🔄 Sending n8n webhook with payload:', JSON.stringify(payload, null, 2));
    console.log('🌐 Webhook URL:', N8N_WEBHOOK_URL);
    
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('📡 Response status:', response.status);
    console.log('📡 Response status text:', response.statusText);
    console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
    
    // Try to read response body for more details
    let responseBody = '';
    try {
      responseBody = await response.text();
      console.log('📡 Response body:', responseBody);
    } catch (bodyError) {
      console.log('⚠️ Could not read response body:', bodyError);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}, body: ${responseBody}`);
    }

    console.log('✅ N8n webhook sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Error sending n8n webhook:', error);
    console.error('❌ Payload that failed:', JSON.stringify(payload, null, 2));
    return false;
  }
}

// Types for return values
type WebhookResult = { success: boolean; response: string; statusCode: number };

/**
 * Verify WhatsApp webhook request
 */
export const verifyWebhook = (mode: string, token: string, challenge: string): WebhookResult => {
  console.log('Webhook verification request received');
  console.log('Mode:', mode);
  console.log('Token:', token);
  console.log('Challenge:', challenge);

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === config.WEBHOOK_VERIFICATION_TOKEN) {
      console.log('Webhook verified successfully!');
      return { success: true, response: challenge, statusCode: 200 };
    } else {
      console.log('Webhook verification failed - invalid token');
      return { success: false, response: 'Forbidden', statusCode: 403 };
    }
  }

  console.log('Webhook verification failed - missing parameters');
  return { success: false, response: 'Bad Request', statusCode: 400 };
};

/**
 * Process incoming webhook messages
 */
export const processWebhookMessage = async (body: WhatsAppWebhookBody): Promise<WebhookResult> => {
  try {
    console.log('🔄 Processing incoming webhook message');

    if (!body.object) {
      return { success: false, response: 'Not Found', statusCode: 404 };
    }

    if (!body.entry?.[0]?.changes?.[0] || body.entry[0].changes[0].field !== 'messages') {
      return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
    }

    const change = body.entry[0].changes[0];
    const value = change.value;

    if (!value.messages || value.messages.length === 0) {
      return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
    }

    const message = value.messages[0];
    const fromNumber = message.from;
    const messageId = message.id;
    const messageText = message.text?.body || '';

    console.log(`💬 Message from ${fromNumber}: ${messageText}`);
    console.log('📱 Full message object:', JSON.stringify(message, null, 2));

    // Send typing indicator
    await sendTypingIndicator(fromNumber, messageId);

    // Get user data from database
    console.log(`🔍 Looking up user data for phone: ${fromNumber}`);
    const userData = await getUserData(fromNumber);
    if (!userData) {
      console.error(`❌ User not found for phone: ${fromNumber}`);
      return { success: false, response: 'User not found', statusCode: 404 };
    }

    console.log(`👤 Processing message for user: ${userData.name} (${userData.id})`);
    console.log(`🔗 User connected status: ${userData.connected}`);

    // Handle RESET command
    if (messageText.trim().toUpperCase() === 'RESET') {
      console.log(`🔄 FLOW CHOSEN: Reset Command - clearing all user data`);
      return await handleResetCommand(fromNumber, messageId, userData.id);
    }

    // Build user context
    console.log(`📅 Getting planned appointments for user: ${userData.id}`);
    const plannedAppointments = await getCandidateAppointmentsByStatus(userData.id, 'planned');
    console.log(`📅 Found ${plannedAppointments.length} planned appointments`);
    
    const userContext: UserContext = {
      name: userData.name,
      phone: userData.phone,
      connected: userData.connected,
      email: userData.email,
      appointmentsPlanned: plannedAppointments.map(apt => ({
        id: apt.id,
        start_time: apt.start_time ? getLocalTimeEvent(apt.start_time.toISOString()) : undefined,
        end_time: apt.end_time ? getLocalTimeEvent(apt.end_time.toISOString()) : undefined,
        google_event_id: apt.google_event_id,
      })),
    };

    // Handle unconnected users
    if (!userData.connected) {
      console.log(`🔌 FLOW CHOSEN: Unconnected User - sending intention question template`);
      return await handleUnconnectedUser(fromNumber, messageText, messageId, userData.id);
    }

    // Handle button interactions
    if (message.type === 'button') {
      console.log(`🔘 FLOW CHOSEN: Button Interaction - payload: ${message.button?.payload}`);
      return await handleButtonInteraction(message, fromNumber, messageId, userData.id);
    }

    // Handle interactive flow responses
    if (message.type === 'interactive' && (message as any).interactive?.type === 'nfm_reply') {
      console.log(`📋 FLOW CHOSEN: Interactive Flow Response - handling nfm_reply`);
      return await handleFlowResponse(message, fromNumber, messageId, userData.id);
    }

    // Check for in-progress internal job
    console.log(`💼 Checking for in-progress jobs for user: ${userData.id}`);
    const inProgressJob = await getInternalJobByStatus(userData.id, 'in_progress');
    if (inProgressJob) {
      console.log(`💼 FLOW CHOSEN: In-Progress Job Handler - step ${inProgressJob.step}, type: ${inProgressJob.type}`);
      return await handleInProgressJob(inProgressJob, fromNumber, messageText, messageId, userData.id);
    } else {
      console.log(`💼 No in_progress job found for candidate: ${userData.id}`);
    }

    // Handle regular text messages with AI
    console.log(`🤖 FLOW CHOSEN: Regular AI Message Handler - processing text message with AI`);
    return await handleRegularMessage(fromNumber, messageText, messageId, userData.id, userContext);

  } catch (error) {
    console.error('❌ Error processing webhook message:', error);
    return { success: false, response: 'Internal Server Error', statusCode: 500 };
  }
};

/**
 * Handle in-progress job conversations
 */
async function handleInProgressJob(
  inProgressJob: any,
  fromNumber: string,
  messageText: string,
  messageId: string,
  userId: string
): Promise<WebhookResult> {
  try {
    console.log(`🏗️ [IN-PROGRESS JOB] Handling step ${inProgressJob.step} for job type: ${inProgressJob.type}`);
    
    if (inProgressJob.step === 1) {
      console.log(`📝 [STEP 1] Processing with agent for job offers`);
      
      // Get conversation history for agent context
      const lastMessages = await getCandidateChatHistory(userId, 9);
      const conversationMessages = extractConversationMessages(lastMessages);
      const llmContext = buildLLMConversationContext(lastMessages);
      
      console.log(`📚 [STEP 1] Providing ${lastMessages.length} historical messages for agent context`);
      
      const agentResponse = await agentForStep1(messageText, conversationMessages, llmContext);

      if (agentResponse.isUserInterested) {
        console.log(`✅ [STEP 1] User is interested in job: ${agentResponse.job_id}`);
        
        // Update job with user's interest
        await updateInternalJob(inProgressJob.id.toString(), {
          step: 2,
          job_offer_interested: agentResponse.job_id,
        });

        const confirmationMessage = 'Ottimo! Adesso ci sara\' da completare alcune domande per poter procedere con la candidatura.';
        await sendMessage(fromNumber, confirmationMessage);

        // Save conversation
        await saveConversationMessages(userId, messageText, confirmationMessage, messageId);

        // Send flow template
        console.log(`📋 [STEP 1] Sending flow template for job: ${agentResponse.job_id}`);
        await sendN8nWebhook({
          jobOffer: agentResponse.job_id,
          wa_id: fromNumber,
        });

        return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
      }

      console.log(`💬 [STEP 1] User not interested yet, sending agent response`);
      // Send agent response
      await sendMessage(fromNumber, agentResponse.answer);
      await saveConversationMessages(userId, messageText, agentResponse.answer, messageId);

      return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
    }

    if (inProgressJob.step === 2 || inProgressJob.step === 3) {
      console.log(`📝 [STEP ${inProgressJob.step}] Sending default question about job interest`);
      const responseMessage = 'Di quale offerta sei interessato e vorresti ricevere ulteriori informazioni?';
      await sendMessage(fromNumber, responseMessage);
      await saveConversationMessages(userId, messageText, responseMessage, messageId);

      return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
    }

    return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
  } catch (error) {
    console.error('❌ Error handling in-progress job:', error);
    throw error;
  }
}

/**
 * Handle unconnected users
 */
async function handleUnconnectedUser(
  fromNumber: string,
  messageText: string,
  messageId: string,
  userId: string
): Promise<WebhookResult> {
  try {
    console.log(`🔌 [UNCONNECTED USER] Sending intention question template to ${fromNumber}`);
    
    const success = await sendN8nWebhook({
      type: 'sendIntentionQuestionTemplate',
      wa_id: fromNumber,
    });

    if (success) {
      console.log(`✅ [UNCONNECTED USER] Template sent successfully, saving user message`);
      // Save user message (template response will be saved when user responds)
      await saveChatMessage(userId, {
        role: 'user',
        content: messageText,
        timestamp: new Date().toISOString(),
        wa_message_id: messageId
      });
    } else {
      console.log(`❌ [UNCONNECTED USER] Failed to send template`);
    }

    return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
  } catch (error) {
    console.error('❌ Error handling unconnected user:', error);
    throw error;
  }
}

/**
 * Handle button interactions
 */
async function handleButtonInteraction(
  message: any,
  fromNumber: string,
  messageId: string,
  userId: string
): Promise<WebhookResult> {
  try {
    const payload = message.button?.payload;
    const buttonText = message.button?.text || payload;

    console.log(`🔘 [BUTTON] Processing button interaction with payload: "${payload}"`);

    if (payload === 'Offerte lavoro per me') {
      console.log(`📝 [BUTTON] Handling "Offerte lavoro per me" - sending job offers template`);
      
      const success = await sendN8nWebhook({
        type: 'sendOfferteLavoroTemplate',
        wa_id: fromNumber,
      });

      if (success) {
        console.log(`✅ [BUTTON] Job offers template sent successfully`);
        await saveChatMessage(userId, {
          role: 'user',
          content: buttonText,
          timestamp: new Date().toISOString(),
          wa_message_id: messageId
        });
      } else {
        console.log(`❌ [BUTTON] Failed to send job offers template`);
      }

      return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
    }

    if (payload === 'Impianti industriali') {
      console.log(`🏭 [BUTTON] Handling "Impianti industriali" - fetching industrial job offers`);
      
      const jobOffers = await getJobOffersByType('impianti industriali');

      if (typeof jobOffers === 'string') {
        console.log(`❌ [BUTTON] No job offers found or error occurred`);
        await sendMessage(fromNumber, jobOffers);
        await saveConversationMessages(userId, buttonText, jobOffers, messageId);
        return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
      }

      console.log(`✅ [BUTTON] Found ${jobOffers.length} industrial job offers, sending to user`);
      const offers = jobOffers.map((offer: JobOfferData) => offer.summary).join('\n\n');
      const responseMessage = `Ci sono le seguenti offerte adatte a te:\n\n${offers}\n\n`;

      await sendMessage(fromNumber, responseMessage);
      await saveConversationMessages(userId, buttonText, responseMessage, messageId);

      await sendMessage(fromNumber, 'Di quale offerta sei interessato e vorresti ricevere ulteriori informazioni?');
      await saveConversationMessages(userId, buttonText, responseMessage, messageId);

      // Create internal job with step 1
      console.log(`📝 [BUTTON] Creating internal job for user - step 1, type: offerte-lavoro`);
      await createInternalJob(userId, 'offerte-lavoro', 1, 'in_progress', 'impianti industriali');

      return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
    }

    // Handle unknown button payload
    console.log(`⚠️ [BUTTON] Unknown button payload: ${payload}`);
    await saveChatMessage(userId, {
      role: 'user',
      content: buttonText,
      timestamp: new Date().toISOString(),
      wa_message_id: messageId
    });

    return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
  } catch (error) {
    console.error('❌ Error handling button interaction:', error);
    throw error;
  }
}

/**
 * Handle interactive flow responses
 */
async function handleFlowResponse(
  message: any,
  fromNumber: string,
  messageId: string,
  userId: string
): Promise<WebhookResult> {
  try {
    console.log('📋 [FLOW RESPONSE] Handling interactive flow response');

    const inProgressJob = await getInternalJobByStatus(userId, 'in_progress');

    if(inProgressJob) {
      console.log(`✅ [FLOW RESPONSE] Completing in-progress job ID: ${inProgressJob.id}`);
      // update the internal job status to done
      await updateInternalJob(inProgressJob.id.toString(), {
        status: 'completed',
      });
    } else {
      console.log(`ℹ️ [FLOW RESPONSE] No in-progress job found to complete`);
    }
    
    const flowReply = message.interactive?.nfm_reply;
    if (!flowReply) {
      console.log('❌ [FLOW RESPONSE] No nfm_reply found in interactive message');
      return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
    }

    console.log('📋 Flow reply details:', {
      name: flowReply.name,
      body: flowReply.body,
      hasResponseJson: !!flowReply.response_json
    });

    // Parse the response JSON
    let flowData: any = {};
    if (flowReply.response_json) {
      try {
        flowData = JSON.parse(flowReply.response_json);
        console.log('📊 Flow data parsed:', JSON.stringify(flowData, null, 2));
      } catch (parseError) {
        console.error('❌ Error parsing flow response JSON:', parseError);
        console.log('📄 Raw response_json:', flowReply.response_json);
      }
    }

    // Save the flow response as a user message
    // await saveChatMessage(userId, {
    //   role: 'user',
    //   content: `Flow response: ${flowReply.body}`,
    //   timestamp: new Date().toISOString(),
    //   wa_message_id: messageId,
    //   metadata: {
    //     type: 'flow_response',
    //     flow_name: flowReply.name,
    //     flow_data: flowData
    //   }
    // });

    // Handle different types of flow responses based on flow_token or other identifiers
    const flowToken = flowData.flow_token;
    console.log('🎫 [FLOW RESPONSE] Flow token:', flowToken);

    const responseMessage = 'Grazie per aver completato la candidatura! Riceverai presto una risposta dal nostro team riguardante la candidatura.';
    console.log('📤 [FLOW RESPONSE] Sending completion message to user');
    await sendMessage(fromNumber, responseMessage);
    await saveChatMessage(userId, {
      role: 'assistant',
      content: responseMessage,
      timestamp: new Date().toISOString(),
      wa_message_id: messageId
    });

    await sendMessage(fromNumber, 'Sei hai bisogno di altre informazioni oppure vuoi prendere un appuntamento con noi, scrivici');
    await saveChatMessage(userId, {
      role: 'assistant',
      content: 'Sei hai bisogno di altre informazioni oppure vuoi prendere un appuntamento con noi, scrivici',
      timestamp: new Date().toISOString(),
      wa_message_id: messageId
    });
    

    // You can add specific handling based on flow_token or other flow data
    // if (flowToken) {
    //   // Handle specific flows based on token
    //   console.log(`🎯 Processing flow with token: ${flowToken}`);
      
    //   // Example: if this is a job application flow
    //   if (flowToken.includes('job_application')) {
    //     const responseMessage = 'Grazie per aver completato la candidatura! Riceverai presto una risposta dal nostro team riguardante la candidatura.';
    //     await sendMessage(fromNumber, responseMessage);
        
    //     await saveChatMessage(userId, {
    //       role: 'assistant',
    //       content: responseMessage,
    //       timestamp: new Date().toISOString(),
    //       wa_message_id: messageId
    //     });
    //   } else {
    //     // Generic flow completion message
    //     const responseMessage = 'Grazie per aver completato il modulo!';
    //     await sendMessage(fromNumber, responseMessage);
        
    //     await saveChatMessage(userId, {
    //       role: 'assistant',
    //       content: responseMessage,
    //       timestamp: new Date().toISOString(),
    //       wa_message_id: messageId
    //     });
    //   }
    // } else {
    //   // No flow token, send generic acknowledgment
    //   const responseMessage = 'Informazioni ricevute. Grazie!';
    //   await sendMessage(fromNumber, responseMessage);
      
    //   await saveChatMessage(userId, {
    //     role: 'assistant',
    //     content: responseMessage,
    //     timestamp: new Date().toISOString(),
    //     wa_message_id: messageId
    //   });
    // }

    return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
  } catch (error) {
    console.error('❌ Error handling flow response:', error);
    throw error;
  }
}

/**
 * Handle RESET command - clear all user data
 */
async function handleResetCommand(
  fromNumber: string,
  messageId: string,
  userId: string
): Promise<WebhookResult> {
  try {
    console.log(`🔄 [RESET] Starting reset process for user: ${userId}`);

    // Reset all user data
    const resetSuccess = await resetUserData(userId);

    if (resetSuccess) {
      console.log(`✅ [RESET] Successfully reset all data for user: ${userId}`);
      const successMessage = `🔄 **Reset Completato**\n\nTutti i tuoi dati sono stati cancellati:\n\n✅ Cronologia chat eliminata\n✅ Candidature in corso eliminate\n✅ Appuntamenti eliminati\n✅ Stato connessione ripristinato\n\nPuoi ricominciare da capo. Ciao!`;
      
      await sendMessage(fromNumber, successMessage);

      // Don't save this reset message to chat history since we just cleared it
      console.log(`🎯 [RESET] Reset completed successfully for user: ${userId}`);
    } else {
      console.log(`❌ [RESET] Failed to reset data for user: ${userId}`);
      const errorMessage = `❌ **Errore Reset**\n\nSi è verificato un problema durante il reset dei dati. Riprova più tardi o contatta il supporto.`;
      
      await sendMessage(fromNumber, errorMessage);
    }

    return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
  } catch (error) {
    console.error('❌ Error handling reset command:', error);
    
    const errorMessage = `❌ **Errore Reset**\n\nSi è verificato un errore tecnico durante il reset. Riprova più tardi.`;
    await sendMessage(fromNumber, errorMessage);
    
    return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
  }
}

/**
 * Handle regular text messages with AI processing
 */
async function handleRegularMessage(
  fromNumber: string,
  messageText: string,
  messageId: string,
  userId: string,
  userContext: UserContext
): Promise<WebhookResult> {
  try {
    console.log(`🤖 [AI MESSAGE] Processing regular text message with AI`);
    console.log(`💬 [AI MESSAGE] User message: "${messageText}"`);
    
    // Get conversation history for LLM context
    const lastMessages = await getCandidateChatHistory(userId, 9);
    const conversationMessages = extractConversationMessages(lastMessages);
    const llmContext = buildLLMConversationContext(lastMessages);

    console.log(`📚 [AI MESSAGE] Retrieved ${lastMessages.length} historical messages for context`);

    // Process message with AI
    const aiResponse = await processUserMessage(
      userId,
      messageText,
      conversationMessages,
      userContext,
      llmContext
    );

    console.log(`🤖 [AI MESSAGE] AI generated response: "${aiResponse.substring(0, 100)}..."`);

    // Send response to WhatsApp
    await sendMessage(fromNumber, aiResponse);

    // Save both messages to database
    await saveConversationMessages(userId, messageText, aiResponse, messageId);

    console.log(`✅ [AI MESSAGE] Successfully processed and saved AI conversation`);

    return { success: true, response: 'EVENT_RECEIVED', statusCode: 200 };
  } catch (error) {
    console.error('❌ Error handling regular message:', error);
    throw error;
  }
}